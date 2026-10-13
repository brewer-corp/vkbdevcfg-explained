// The configuration protocol over HID feature report 0x59. See docs/PROTOCOL.md.
import { crc16, fromHex, rc4 } from './bytes';
import { BLOCK_SIZE } from './block';

export const REPORT_ID = 0x59;
export const FRAME = 128;          // data bytes in one feature report, report id excluded
const HDR = 8;

export const CMD_READ_CPUID = 0x0b;
export const CMD_READ_FLASH = 0x02;
export const CMD_READ_RAM = 0x03;
export const CMD_WRITE_FLASH = 0x24;
const FLAG_READ = 0xc0;
const FLAG_WRITE = 0x80;

/** 13-byte RC4 key that unwraps the session token in the READ_CPUID reply. */
export const CPUID_KEY = fromHex('f91462a0d26c8d4e88c6b04c29');

export const STATUS_OK = 0x0088a55a;
export const WRITE_STATUS: Record<number, string> = {
  0x0088a55a: 'block written',
  0x11a55a11: 'no new data',
  0x22222222: 'CRC error',
  0x31dead31: 'flash erase error',
  0x33dead33: 'flash write error',
  0x33a55a33: 'non-compatible profile',
};

/** One feature report each way. `data` is always 128 bytes, without the report id. */
export interface Transport {
  send(data: Uint8Array): Promise<void>;
  receive(): Promise<Uint8Array>;
  close(): Promise<void>;
  /** Milliseconds to wait between frames; 0 for an in-memory device. */
  readonly pace: number;
  /** Live input reports (the data plane), if the transport can deliver them. Returns an unsubscribe. */
  onInput?(listener: (reportId: number, data: Uint8Array) => void): () => void;
}

class StaleReply extends Error {}
const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

function header(cmd: number, size: number, addr: number, crc: number): Uint8Array {
  return new Uint8Array([0xa5, cmd, size & 0xff, size >> 8, addr & 0xff, addr >> 8, crc & 0xff, crc >> 8]);
}

/** The frames of one long write: an 8-byte header and 120 payload bytes, then 128 per frame. */
export function longWriteFrames(cmd: number, addr: number, data: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  for (let sent = 0; sent < data.length; ) {
    const frame = new Uint8Array(FRAME);
    let at = 0;
    if (sent === 0) { frame.set(header(cmd | FLAG_WRITE, data.length, addr, crc16(data))); at = HDR; }
    const chunk = data.subarray(sent, sent + FRAME - at);
    frame.set(chunk, at);
    sent += chunk.length;
    frames.push(frame);
  }
  return frames;
}

export class Stick {
  retries = 0;
  constructor(readonly transport: Transport) {}

  private async longReadOnce(cmd: number, size: number, addr: number): Promise<Uint8Array> {
    const t = this.transport;
    const req = new Uint8Array(FRAME);
    req.set(header(cmd | FLAG_READ, size, addr, 0));
    await t.send(req);
    await sleep(t.pace + 4);
    let rx = await t.receive();
    if (rx[0] !== 0x5a || rx[1] !== (cmd | FLAG_READ) || (rx[4] | (rx[5] << 8)) !== addr)
      throw new StaleReply();
    const want = Math.min(size, rx[2] | (rx[3] << 8));
    const crc = rx[6] | (rx[7] << 8);
    const data = new Uint8Array(want);
    let got = Math.min(FRAME - HDR, want);
    data.set(rx.subarray(HDR, HDR + got));
    while (got < want) {
      await sleep(t.pace);
      rx = await t.receive();
      const n = Math.min(FRAME, want - got);
      data.set(rx.subarray(0, n), got);
      got += n;
    }
    if (crc16(data) !== crc) throw new Error('The transfer arrived damaged (CRC-16 mismatch).');
    return data;
  }

  /** The request after READ_CPUID is answered with a stale frame, so check the echo and ask again. */
  async longRead(cmd: number, size: number, addr = 0): Promise<Uint8Array> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { return await this.longReadOnce(cmd, size, addr); }
      catch (e) {
        if (!(e instanceof StaleReply)) throw e;
        this.retries++;
        await sleep(this.transport.pace * 2 + 10);
      }
    }
    throw new Error('The stick did not answer the request.');
  }

  /** The 16-byte session token; its first 12 bytes are the microcontroller's unique id. */
  async readToken(): Promise<Uint8Array> {
    const reply = await this.longRead(CMD_READ_CPUID, 0x78);
    return rc4(reply.subarray(0x58, 0x68), CPUID_KEY);
  }

  async readBlock(token: Uint8Array, target: 'flash' | 'ram' = 'flash'): Promise<Uint8Array> {
    const cipher = await this.longRead(target === 'ram' ? CMD_READ_RAM : CMD_READ_FLASH, BLOCK_SIZE);
    return rc4(cipher, token.subarray(0, 15));
  }

  /** Send the block to flash and return the status word. The stick restarts after accepting it. */
  async writeBlock(token: Uint8Array, block: Uint8Array): Promise<number> {
    const t = this.transport;
    for (const frame of longWriteFrames(CMD_WRITE_FLASH, 0, rc4(block, token.subarray(0, 15)))) await t.send(frame);
    await sleep(t.pace > 0 ? 60 : 0);
    const st = await t.receive();
    return (st[0] | (st[1] << 8) | (st[2] << 16) | (st[3] << 24)) >>> 0;
  }
}
