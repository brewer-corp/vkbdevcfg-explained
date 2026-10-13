// An in-memory stick that speaks the real protocol, for tests and for demo mode.
// It reproduces the behaviours observed on hardware: the stale reply after READ_CPUID,
// the CRC-16 check, the device-owned header, the acknowledged-but-ignored RAM target,
// and the restart after an accepted write.
import { crc16, fromHex, rc4 } from './bytes';
import { BLOCK_SIZE, withFixedCrc } from './block';
import { CPUID_KEY, FRAME, Transport } from './protocol';
import { LED_EVENTS_AT, logicalAxisBase, logicalEntry, physicalAxisBase, physicalEntry, curveBase } from './schema';

/** A plausible near-default Gladiator EVO configuration. Synthetic: no unit's calibration. */
export function demoBlock(): Uint8Array {
  const b = new Uint8Array(BLOCK_SIZE);
  b.set(fromHex('ffff11ff 00000000 0c22c459 ff000000 00000000 32323200 02004200 00800100 00000041'));
  b.set(fromHex('822cc67f a00a867f'), 0x34);                                   // two POV records
  const logical = ['b0000c1e0a000000', 'b1010c1e0a000000', 'b2050b640a000000', 'b3020b001e000000',
    'b4030c6464000000', 'b5040c6464000000', '86060c6464000000', '87070b0000000000'];
  logical.forEach((r, i) => b.set(fromHex(r), logicalAxisBase(i)));
  const physical = ['97c96428', '93c96428', '97c96480', 'aae8c800', 'abe8c808', 'abe8c808', '9ac86408', '9ac86408'];
  const calib = ['b4b40000', 'b4b40000', 'b4b40000', '96960000', 'b0900000', 'b0900000', 'ffff0000', 'ffff0000'];
  physical.forEach((r, i) => b.set(fromHex(r + calib[i]), physicalAxisBase(i)));
  for (let c = 0; c < 8; c++) b.fill(0x80, curveBase(c), curveBase(c) + 10);
  b.set(fromHex('3a424a515961697078 80'), curveBase(4));
  b.set(fromHex('3a424a515961697078 80'), curveBase(5));
  b.fill(0xff, 0x10c, 0x30c);                                                 // both button tables: unused
  b.set(fromHex('63000000'), physicalEntry(0));                               // base encoder
  for (const l of [8, 9, 10, 11, 13, 14, 15, 20, 21, 22, 23, 24, 25, 26, 27, 32, 33, 34, 35, 40]) b.set([0xff, 0x7f], physicalEntry(l));
  b.set(fromHex('2ee4'), physicalEntry(12));
  b.set(fromHex('3a00 3800 3b00 3900'), physicalEntry(16));                   // hat: down, up, left, right
  for (let l = 28; l < 32; l++) b.set([0x80 | l, l], physicalEntry(l));
  for (let l = 36; l < 40; l++) b.set([0x7f, 0xff], physicalEntry(l));
  let n = 1;
  for (const l of [9, 8, 10, 11, 13, 14, 15, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 0, 1, 40])
    b.set([0x80 | (n++ - 1), 0xff], logicalEntry(l));
  b.set(fromHex('000200020002000200020002'), 0x30c);
  b.set(fromHex('0b11488442 80a000 81a14445'), 0x330);                         // external device 0: SCG grip
  b.set(fromHex('0c40404040404040'), 0x3b0);
  b.set(fromHex('c00604010000 5801040100 0a 40010c040100 02 00041e010b c00a500d0000'), LED_EVENTS_AT);
  b.set([0x68], 0x5e0); b[0x603] = 0x7f; b[0x607] = 0x7f;
  b.fill(0xff, 0x900, 0xa00);
  return withFixedCrc(b);
}

export interface MockOptions {
  block?: Uint8Array;
  /** Called when the stick "restarts"; the transport then fails until `restartMs` has passed. */
  onRestart?: () => void;
  restartMs?: number;
}

export class MockStick implements Transport {
  readonly pace = 0;
  flash: Uint8Array;
  readonly token = fromHex('112233445566778857363220a1b2c3d4');
  private out: Uint8Array[] = [];
  private lastTransfer = new Uint8Array(120);
  private afterCpuid = false;
  private write: { cmd: number; size: number; crc: number; data: Uint8Array; got: number } | null = null;
  private downUntil = 0;
  writes = 0;

  constructor(private opts: MockOptions = {}) {
    this.flash = withFixedCrc(opts.block ?? demoBlock());
  }

  private alive() {
    if (Date.now() < this.downUntil) throw new Error('The stick is restarting.');
  }

  private reply(cmd: number, addr: number, payload: Uint8Array) {
    const total = new Uint8Array(8 + payload.length);
    total.set([0x5a, cmd, payload.length & 0xff, payload.length >> 8, addr & 0xff, addr >> 8, crc16(payload) & 0xff, crc16(payload) >> 8]);
    total.set(payload, 8);
    this.out = [];
    for (let i = 0; i < total.length; i += FRAME) {
      const f = new Uint8Array(FRAME);
      f.set(total.subarray(i, i + FRAME));
      this.out.push(f);
    }
  }

  private status(word: number) {
    const f = new Uint8Array(FRAME);
    f.set([word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, word >>> 24]);
    this.out = [f];
  }

  async send(data: Uint8Array): Promise<void> {
    this.alive();
    if (this.write) {                                   // continuation of a long write
      const w = this.write;
      const n = Math.min(FRAME, w.size - w.got);
      w.data.set(data.subarray(0, n), w.got);
      w.got += n;
      if (w.got >= w.size) this.finishWrite();
      return;
    }
    if (data[0] !== 0xa5) return;
    const cmd = data[1], size = data[2] | (data[3] << 8), addr = data[4] | (data[5] << 8);
    if ((cmd & 0xc0) === 0xc0) {
      if (this.afterCpuid) {                            // the quirk: the next request gets a stale frame
        this.afterCpuid = false;
        const f = new Uint8Array(FRAME);
        f.set([0x5a, 0x4b, 0x78, 0, 0, 0, 0x29, 0x0f]);
        this.out = [f];
        return;
      }
      const c = cmd & 0x3f;
      if (c === 0x0b) {
        const payload = new Uint8Array(this.lastTransfer.subarray(0, 0x78));
        payload.set(rc4(this.token, CPUID_KEY), 0x58);
        this.reply(cmd, addr, payload);
        this.afterCpuid = true;
      } else if (c === 2 || c === 3) {
        const payload = rc4(this.flash.subarray(0, size), this.token.subarray(0, 15));
        this.lastTransfer = new Uint8Array(this.flash.subarray(0, 120));
        this.reply(cmd, addr, payload);
      }
    } else if (cmd & 0x80) {
      const first = Math.min(FRAME - 8, size);
      this.write = { cmd: cmd & 0x7f, size, crc: data[6] | (data[7] << 8), data: new Uint8Array(size), got: first };
      this.write.data.set(data.subarray(8, 8 + first));
      if (first >= size) this.finishWrite();
    }
  }

  private finishWrite() {
    const w = this.write!;
    this.write = null;
    if (crc16(w.data) !== w.crc) return this.status(0x22222222);
    if (w.cmd === 0x24 && w.size === BLOCK_SIZE) {
      const plain = rc4(w.data, this.token.subarray(0, 15));
      plain.set(this.flash.subarray(0, 4));               // the stick keeps its own marker and type id
      this.flash = withFixedCrc(plain);                   // and computes its own CRC
      this.writes++;
    }
    this.status(0x0088a55a);                              // 0x25 (RAM) is acknowledged and ignored
    const ms = this.opts.restartMs ?? 0;
    setTimeout(() => {
      this.downUntil = Date.now() + ms;
      this.out = [];
      this.afterCpuid = false;
      this.opts.onRestart?.();
    }, ms > 0 ? 300 : 0);
  }

  async receive(): Promise<Uint8Array> {
    this.alive();
    return this.out.shift() ?? new Uint8Array(FRAME);
  }

  async close(): Promise<void> {}
}
