import { describe, expect, it } from 'vitest';
import { crc16, crc32Stm32, fromHex, hex, rc4 } from './bytes';
import { BLOCK_SIZE, blockCrcOk, cfgDecrypt, cfgEncrypt, diffBlocks, firmwareText, loadBlockFile, typeId, withFixedCrc, writeRefusal } from './block';
import { MockStick, demoBlock } from './mock';
import { STATUS_OK, Stick, longWriteFrames } from './protocol';
import { LOGICAL_AXIS, PHYSICAL_AXIS, extDevice, ledEvent, logicalAxisBase, logicalFunction, physicalAxisBase,
  physicalFunction, readField, setLogicalButton, writeField, inputType } from './schema';
import { existsSync, readFileSync } from 'node:fs';
import { parseInput } from '../ui/Live';

const text = (s: string) => new TextEncoder().encode(s);

describe('primitives, against published check values', () => {
  it('CRC-16/MODBUS', () => expect(crc16(text('123456789'))).toBe(0x4b37));
  it('STM32 CRC-32 = CRC-32/MPEG-2 over byte-swapped words', () => {
    expect(crc32Stm32(text('43218765'))).toBe(0x49e3c2fb);
    expect(crc32Stm32(new Uint8Array(4))).toBe(0xc704dd7b);
  });
  it('RC4', () => expect(hex(rc4(text('Plaintext'), text('Key')), '')).toBe('bbf316e8d940af0ad3'));
});

describe('.cfg container', () => {
  const block = demoBlock();
  it('round-trips', () => {
    const cfg = cfgEncrypt(block);
    expect(cfg.length).toBe(BLOCK_SIZE);
    expect(cfgDecrypt(cfg)).toEqual(block);
    expect(loadBlockFile(cfg)).toEqual(block);
    expect(loadBlockFile(block)).toEqual(block);
  });
  it('rejects a damaged file', () => {
    const cfg = cfgEncrypt(block); cfg[100] ^= 1;
    expect(() => cfgDecrypt(cfg)).toThrow();
  });
  it('changes every byte when one setting changes (the CRC is part of the key)', () => {
    const other = new Uint8Array(block); other[0xb5] ^= 0x20;
    const a = cfgEncrypt(block), b = cfgEncrypt(other);
    let same = 0; for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
    expect(same).toBeLessThan(64);
  });
  // Optional: real vendor profiles, if present on this machine. Never committed.
  const dir = process.env.VKB_SAMPLES;
  it.skipIf(!dir || !existsSync(`${dir}/p1.cfg`))('reproduces real vendor profiles byte for byte', () => {
    for (const n of ['p1.cfg', 'p2.cfg']) {
      const file = new Uint8Array(readFileSync(`${dir}/${n}`));
      const b = cfgDecrypt(file);
      expect(blockCrcOk(b)).toBe(true);
      expect(cfgEncrypt(b)).toEqual(file);
    }
  });
});

describe('protocol, against the mock stick', () => {
  it('reads the block, riding out the stale reply after READ_CPUID', async () => {
    const mock = new MockStick(); const stick = new Stick(mock);
    const token = await stick.readToken();
    expect(token).toEqual(mock.token);
    const block = await stick.readBlock(token);
    expect(block).toEqual(mock.flash);
    expect(blockCrcOk(block)).toBe(true);
    expect(stick.retries).toBe(1);
    expect(await stick.readBlock(token, 'ram')).toEqual(block);
  });
  it('frames a 4096-byte write as 33 reports', () => {
    const frames = longWriteFrames(0x24, 0, new Uint8Array(BLOCK_SIZE));
    expect(frames.length).toBe(33);
    expect(hex(frames[0].subarray(0, 6))).toBe('a5 a4 00 10 00 00');
  });
  it('writes a change; the stick keeps its own type id and CRC', async () => {
    const mock = new MockStick(); const stick = new Stick(mock);
    const token = await stick.readToken();
    const next = new Uint8Array(await stick.readBlock(token));
    writeField(next, physicalAxisBase(7), PHYSICAL_AXIS[0], 5);
    next[2] = 0x12; next.fill(0, 4, 8);                         // wrong type id, no CRC: both device-owned
    expect(await stick.writeBlock(token, next)).toBe(STATUS_OK);
    await new Promise((r) => setTimeout(r, 5));
    const back = await new Stick(mock).readBlock(await new Stick(mock).readToken());
    expect(readField(back, physicalAxisBase(7), PHYSICAL_AXIS[0])).toBe(5);
    expect(typeId(back)).toBe(0x11);
    expect(blockCrcOk(back)).toBe(true);
  });
  it('refuses blocks for another model or firmware before sending', () => {
    const cur = demoBlock();
    const model = new Uint8Array(cur); model[2] = 0x12;
    const fw = new Uint8Array(cur); fw[8] = 0x0b;
    expect(writeRefusal(cur, cur)).toBeNull();
    expect(writeRefusal(cur, model)).toMatch(/different model/);
    expect(writeRefusal(cur, fw)).toMatch(/firmware/);
    expect(writeRefusal(cur, cur.subarray(0, 100))).toMatch(/bytes/);
  });
});

describe('schema, against the demo block', () => {
  const b = demoBlock();
  const f = (defs: typeof LOGICAL_AXIS, key: string) => defs.find((d) => d.key === key)!;
  it('header', () => { expect(firmwareText(b)).toBe('2.20.C'); expect(typeId(b)).toBe(0x11); });
  it('logical axes', () => {
    expect(readField(b, logicalAxisBase(0), f(LOGICAL_AXIS, 'en'))).toBe(1);
    expect(readField(b, logicalAxisBase(0), f(LOGICAL_AXIS, 'src'))).toBe(1);
    expect(readField(b, logicalAxisBase(2), f(LOGICAL_AXIS, 'usage'))).toBe(5);         // Rot Z
    expect(readField(b, logicalAxisBase(0), f(LOGICAL_AXIS, 'dzlo'))).toBe(30);         // 3.0 %
    expect(readField(b, logicalAxisBase(6), f(LOGICAL_AXIS, 'en'))).toBe(0);
  });
  it('physical axes', () => {
    expect(readField(b, physicalAxisBase(0), f(PHYSICAL_AXIS, 'filter'))).toBe(6);
    expect(readField(b, physicalAxisBase(3), f(PHYSICAL_AXIS, 'filter'))).toBe(7);
    expect(inputType(b, 0)).toBe('A_MaRS');
    expect(inputType(b, 2)).toBe('V_MaRS');
  });
  it('writeField touches only its own bits', () => {
    const c = new Uint8Array(b);
    writeField(c, physicalAxisBase(7), f(PHYSICAL_AXIS, 'filter'), 5);
    expect(diffBlocks(b, c)).toEqual([{ start: 0xb5, end: 0xb5 }]);
    expect(c[0xb5]).toBe(0xa8);
  });
  it('buttons', () => {
    expect(physicalFunction(b, 16)).toMatchObject({ kind: 'POV switch', detail: 'hat 1, down' });
    expect(physicalFunction(b, 0)).toMatchObject({ kind: 'Encoder', wide: true });
    expect(physicalFunction(b, 9)).toMatchObject({ kind: 'Button', plain: true });
    expect(physicalFunction(b, 36).kind).toBe('No function');
    expect(logicalFunction(b, 9).button).toBe(1);
    const c = new Uint8Array(b); setLogicalButton(c, 9, 40);
    expect(logicalFunction(c, 9).button).toBe(40);
    setLogicalButton(c, 9, null); expect(logicalFunction(c, 9).button).toBeNull();
  });
  it('LED events and external devices', () => {
    expect(ledEvent(b, 0)).toMatchObject({ led: 0, typeName: 'Always', c1: [0, 0, 3], c2: [3, 0, 0], mode: 1 });
    expect(ledEvent(b, 4)).toMatchObject({ typeName: 'BUS error', mode: 4, colorMode: 2 });
    expect(ledEvent(b, 5).empty).toBe(true);
    expect(extDevice(b, 0)).toMatchObject({ name: 'SCG', registers: 4, leds: 2, firstLed: 10, port: 2 });
  });
  it('withFixedCrc is idempotent', () => expect(withFixedCrc(b)).toEqual(b));
  it('fromHex ignores spacing', () => expect(fromHex('0a 0B-0c')).toEqual(new Uint8Array([10, 11, 12])));
});

describe('live input report', () => {
  // A report captured from a Gladiator EVO at rest (data after the report id), with two lines then marked held.
  const idle = fromHex('0008 0008 0004 aa04 0008 0008 0000 0000' + '00'.repeat(16) + '08' + '0008 0008 0008' + '000000 01 00 00 00 a5 01' + '00'.repeat(15));
  it('decodes axes, hat, and the line map in the tail', () => {
    expect(idle.length).toBe(63);
    const s = parseInput(idle, 1);
    expect(s.axes).toEqual([2048, 2048, 1024, 1194, 2048, 2048, 0, 0]);
    expect(s.hat).toBe(8);
    expect([...s.buttons]).toEqual([]);
    expect([...s.lines]).toEqual([1]);
    expect(s.shift1 || s.shift2).toBe(false);
  });
  it('reads held lines and shift state', () => {
    const d = new Uint8Array(idle);
    d[0x2f + (101 >> 3)] |= 1 << (101 & 7); d[0x2f + (110 >> 3)] |= 1 << (110 & 7); d[0x2c] = 1; d[16 + (101 >> 3)] |= 1 << (101 & 7);
    const s = parseInput(d, 2);
    expect([...s.lines]).toEqual([1, 102, 111]);
    expect([...s.buttons]).toEqual([102]);
    expect(s.shift1).toBe(true);
  });
  it('ignores the tail without its 0xA5 marker', () => {
    const d = new Uint8Array(idle); d[0x2e] = 0;
    expect(parseInput(d, 1).lines.size).toBe(0);
  });
});
