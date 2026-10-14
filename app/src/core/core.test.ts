import { describe, expect, it } from 'vitest';
import { crc16, crc32Stm32, fromHex, hex, rc4 } from './bytes';
import { BLOCK_SIZE, blockCrcOk, cfgDecrypt, cfgEncrypt, diffBlocks, firmwareText, loadBlockFile, typeId, withFixedCrc, writeRefusal } from './block';
import { MockStick, demoBlock } from './mock';
import { STATUS_OK, Stick, longWriteFrames } from './protocol';
import { LOGICAL_AXIS, PHYSICAL_AXIS, extDevice, ledEvent, logicalAxisBase, logicalFunction, physicalAxisBase,
  physicalFunction, readField, setLogical, setLogicalButton, writeField, inputType, physicalEntry, logicalEntry } from './schema';
import { existsSync, readFileSync } from 'node:fs';
import { parseAfter, parseInput } from '../ui/Live';
import { extRegisters, wiring } from './wiring';
import { Session, applyToStick, backupName, checkStick, noteUnchecked, settleUnchecked } from '../session';
import { foreignSigns, stickModel } from './identity';
import { curveOutput, curvePoints, curveState, setCurvePoint, setCurveShape } from './curve';
import { SCG_CHART, chartFits, choiceOf, freeButton, freeLine, hatIncludes, lineOf, miniStick, miniStickWay, roleOf, rowSends, setButton, setChoice, setLayered, setMiniStick,
  setRole, shiftsInUse } from './chart';
import { artSize, spot } from '../ui/StickArt';

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
    setLogicalButton(c, 9, null); expect(logicalFunction(c, 9)).toMatchObject({ kind: 'Auto', auto: true, button: 10 });   // sends its own number
    setLogical(c, 9, 'none'); expect(logicalFunction(c, 9)).toMatchObject({ kind: 'No function', button: null });
    expect(logicalFunction(c, 9).auto).toBe(false);
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
    expect(s.hats).toEqual([8, 8, 8, 8]);
    expect(s.subShifts).toEqual([]);
    expect(s.after).toBeNull();
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
  it('reads four hats and the sub-shift flags', () => {
    const d = new Uint8Array(idle); d[34] = 2; d[36] = 6; d[38] = 4; d[0x2c] = 0x0c; d[0x2d] = 0x80;
    const s = parseInput(d, 3);
    expect(s.hats).toEqual([8, 2, 6, 4]);
    expect(s.subShifts).toEqual([1, 2, 7]);
  });
  it('reads the after-functions line map from report 0x0C', () => {
    // captured from the stick: lines 70, 102 and 111 active after their functions
    const r = fromHex('0000000000000000 20 000000 2040 0000' + '00'.repeat(47));
    expect([...parseAfter(r)]).toEqual([70, 102, 111]);
    expect([...parseInput(idle, 4, r).after!]).toEqual([70, 102, 111]);
  });
  it('ignores the tail without its 0xA5 marker', () => {
    const d = new Uint8Array(idle); d[0x2e] = 0;
    expect(parseInput(d, 1).lines.size).toBe(0);
  });
});

describe('wiring: the vendor diagram\'s control names', () => {
  const b = demoBlock();
  it('places a grip by its first register', () => {
    expect(extRegisters(b, 0)).toEqual({ type: 8, first: 2, count: 4 });
    const w = wiring(b);
    expect(w.get(10)).toMatchObject({ name: 'Trigger 1', owner: 'SCG', key: 'trigger.1' });
    expect(w.get(13)?.name).toBe('Mini-stick push');
    expect(w.get(36)?.name).toBe('Rapid fire down');
    expect(w.has(37)).toBe(false);                      // the grip's four spare lines
    const moved = new Uint8Array(b); moved[0x334] = 0x43;
    expect(wiring(moved).get(18)?.name).toBe('Trigger 1');
    expect(wiring(moved).has(1)).toBe(false);           // no longer the layout a Gladiator base implies
  });
  it('agrees with the factory configuration', () => {
    const w = wiring(b);
    // every hat direction the diagram names sits on a line set up as that direction of the POV switch
    for (const [line, dir] of [[17, 'down'], [18, 'up'], [19, 'left'], [20, 'right']] as const) {
      expect(w.get(line)?.name).toBe(`A1 ${dir}`);
      expect(physicalFunction(b, line - 1).detail).toBe(`hat 1, ${dir}`);
    }
    expect(physicalFunction(b, 0).kind).toBe('Encoder');
    expect(w.get(1)?.owner).toBe('Base');
  });
  it('names the base only for a Gladiator', () => {
    expect(wiring(b, 0x0200).get(6)).toMatchObject({ name: 'F1', owner: 'Base' });
    expect(wiring(b, 0x0126).has(6)).toBe(false);       // a Gunfighter has no register of its own
    expect(wiring(b, 0x0126).get(10)?.name).toBe('Trigger 1');
  });
  it('wires the left-hand grip like the right-hand one (the vendor diagram swaps A4 left and right; a real stick does not)', () => {
    const l = new Uint8Array(b); l[0x332] = 0x49;
    expect(wiring(l).get(27)).toMatchObject({ name: 'A4 left', owner: 'SCG-L', key: 'a4.left' });
    expect(wiring(l).get(28)?.name).toBe('A4 right');
    expect(wiring(b).get(27)?.name).toBe('A4 left');
  });
  it('names nothing without a known grip', () => {
    const none = new Uint8Array(b); none.fill(0, 0x330, 0x340);
    expect(wiring(none).size).toBe(0);
  });
});

describe('button functions, as confirmed on hardware', () => {
  const b = demoBlock();
  const phys = (bytes: number[]) => { const c = new Uint8Array(b); c.set(bytes, physicalEntry(69)); return physicalFunction(c, 69); };
  const logic = (bytes: number[]) => { const c = new Uint8Array(b); c.set(bytes, logicalEntry(69)); return logicalFunction(c, 69); };
  it('physical', () => {
    expect(phys([0x5a, 0x3b])).toMatchObject({ kind: 'Toggle', detail: 'on open → line 60' });
    expect(phys([0x5a, 0x45])).toMatchObject({ kind: 'Toggle', detail: 'pulse on close' });
    expect(phys([0x5c, 0xfe])).toMatchObject({ kind: 'ButAlt', detail: 'starts off' });
    expect(phys([0x5c, 0x21])).toMatchObject({ kind: 'Radiobutton', detail: 'group 2, master' });
    expect(phys([0x51, 0x3b])).toMatchObject({ kind: 'Tempo 2', detail: 'long press → line 60' });
    expect(phys([0x70, 0x09])).toMatchObject({ kind: 'SubSHIFT 1', detail: 'alternate' });
    expect(phys([0x72, 0x31])).toMatchObject({ kind: 'ButtonS', detail: 'line 50 under SubSHIFT 2' });
    expect(phys([0x40, 0x31])).toMatchObject({ kind: 'ButtonX', detail: 'line 50 under SubSHIFT 7' });
    expect(phys([0x44, 0x31])).toMatchObject({ kind: 'Switch CB', detail: 'complement on line 50' });
    expect(phys([0x5e, 0x6e])).toMatchObject({ kind: 'Dependent button', detail: 'master: line 111' });
    expect(phys([0x29, 0x65])).toMatchObject({ kind: 'Replica button', detail: 'of line 102' });
    expect(phys([0x49, 0x00])).toMatchObject({ kind: 'SHIFT', detail: 'SHIFT1 + alternate' });
    expect(phys([0x49, 0xff])).toMatchObject({ kind: 'SHIFT', detail: 'SHIFT1' });
    expect(phys([0x09, 0x00])).toMatchObject({ kind: 'Generator', detail: 'G8, value 1' });
    expect(phys([0x39, 0x01])).toMatchObject({ kind: 'POV switch', detail: 'hat 2, right' });
  });
  it('logical', () => {
    expect(logic([0x74, 0x85])).toMatchObject({ kind: 'Hat', detail: 'hat 3, left' });
    expect(logic([0x74, 0xff])).toMatchObject({ kind: 'Hat', detail: 'hat 1, up' });
    expect(logic([0xff, 0xff])).toMatchObject({ kind: 'Auto', button: 70 });
    expect(logic([0x03, 0xff])).toMatchObject({ kind: 'Keyboard', detail: 'HID key 0x4' });
  });
});

describe('writing when the browser forgets the stick at its restart', () => {
  const setup = async (forgets: boolean) => {
    const transport = new MockStick({ restartMs: 250 });
    const stick = new Stick(transport);
    const original = await stick.readBlock(await stick.readToken());
    const session: Session = { source: 'demo', name: 'test', original, transport, forgets };
    const next = new Uint8Array(original); setLogical(next, 9, 'button', 40);
    return { session, next, transport };
  };
  it('asks for the stick again, then verifies as usual', async () => {
    const { session, next, transport } = await setup(true);
    const steps: string[] = []; let asked = 0;
    const stored = await applyToStick(session, next, (s) => steps.push(s), async () => { asked++; return transport; });
    expect(asked).toBe(1);
    expect(logicalFunction(stored, 9).button).toBe(40);
    expect(steps.some((s) => s.startsWith('Written.'))).toBe(true);
  });
  it('does not ask when the stick is still known', async () => {
    const { session, next, transport } = await setup(false);
    let asked = 0;
    await applyToStick(session, next, () => {}, async () => { asked++; return transport; });
    expect(asked).toBe(0);
  });
  it('says the write happened if there is nobody to ask', async () => {
    const { session, next } = await setup(true);
    await expect(applyToStick(session, next, () => {})).rejects.toThrow(/was written/);
  });
  it('notices when a different stick is picked', async () => {
    const { session, next } = await setup(true);
    await expect(applyToStick(session, next, () => {}, async () => new MockStick({ restartMs: 250 }))).rejects.toThrow(/picked does not hold/);
  });
});

describe('telling one stick\'s profile from another\'s', () => {
  const mine = demoBlock();
  const f = (defs: typeof LOGICAL_AXIS, key: string) => defs.find((d) => d.key === key)!;
  const samples = process.env.VKB_SAMPLES && existsSync(`${process.env.VKB_SAMPLES}/p1.cfg`) ? process.env.VKB_SAMPLES : '';
  it('finds nothing in the stick\'s own configuration, however it was edited', () => {
    expect(foreignSigns(mine, mine)).toEqual([]);
    const edited = new Uint8Array(mine); setLogical(edited, 9, 'button', 40); writeField(edited, physicalAxisBase(0), f(PHYSICAL_AXIS, 'filter'), 3);
    expect(foreignSigns(mine, edited)).toEqual([]);
  });
  it('notices another stick\'s calibration', () => {
    const other = new Uint8Array(mine); other[physicalAxisBase(0) + 4] ^= 0x14; other[physicalAxisBase(1) + 6] ^= 0x40;
    const signs = foreignSigns(mine, other);
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatch(/calibration differs .* on 2 axes/);
  });
  it('notices a different grip', () => {
    const left = new Uint8Array(mine); left[0x332] = (left[0x332] & 0xe0) | 9;
    expect(foreignSigns(mine, left)).toEqual(['It is set up for a different grip: SCG-L, where this stick has SCG.']);
  });
  it('ignores the bias bytes of a slot neither stick has calibrated', () => {
    const a = new Uint8Array(mine), b = new Uint8Array(mine);
    for (const x of [a, b]) x.set([0xff, 0xff], physicalAxisBase(7) + 4);
    b[physicalAxisBase(7) + 6] = 0x55;
    expect(foreignSigns(a, b)).toEqual([]);
  });
  it.skipIf(!samples)('real profiles: two saves from one stick agree, and differ from another stick', () => {
    const load = (n: string) => cfgDecrypt(new Uint8Array(readFileSync(`${samples}/${n}.cfg`)));
    expect(foreignSigns(load('p1'), load('p2'))).toEqual([]);
    expect(foreignSigns(mine, load('p1')).length).toBe(2);
  });
});

describe('checking what is on the stick', () => {
  const connect = async () => {
    const transport = new MockStick({ restartMs: 250 });
    const stick = new Stick(transport);
    const original = await stick.readBlock(await stick.readToken());
    return { transport, session: { source: 'demo', name: 'VKBsim Gladiator EVO R  ', original, transport } as Session };
  };
  it('agrees when nothing changed, and records the check', async () => {
    const { session } = await connect();
    expect((await checkStick(session)).drift).toEqual([]);
    expect(session.checked).toMatchObject({ how: 'check', ok: true });
  });
  it('reports what changed behind the page\'s back', async () => {
    const { session, transport } = await connect();
    const elsewhere = new Stick(transport), token = await elsewhere.readToken();
    const theirs = new Uint8Array(await elsewhere.readBlock(token)); setLogical(theirs, 9, 'button', 77);
    await elsewhere.writeBlock(token, withFixedCrc(theirs));
    await new Promise((r) => setTimeout(r, 700));                                       // its restart
    const { drift, stored } = await checkStick(session);
    expect(drift).toEqual([{ start: logicalEntry(9), end: logicalEntry(9) }]);
    expect(logicalFunction(stored, 9).button).toBe(77);
    expect(session.checked).toMatchObject({ how: 'check', ok: false });
  });
  it('a write records its own read-back', async () => {
    const { session } = await connect();
    const next = new Uint8Array(session.original); setLogical(next, 9, 'button', 41);
    await applyToStick(session, next, () => {});
    expect(session.checked).toMatchObject({ how: 'write', ok: true });
  });
  it('names backups after the stick', async () => {
    const { session } = await connect();
    expect(backupName(session)).toMatch(/^vkb-gladiator-evo-r-backup-\d{4}-/);
  });
  it('remembers a write that was never read back, and settles it at the next connect', () => {
    const kept = new Map<string, string>();
    (globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
    try {
      const wanted = demoBlock(); setLogical(wanted, 9, 'button', 42);
      expect(settleUnchecked(wanted)).toBeUndefined();                                  // nothing outstanding
      noteUnchecked({ wanted, at: Date.now() - 5000 });
      expect(settleUnchecked(demoBlock())).toMatchObject({ ok: false });                // another stick, or it did not last
      expect(settleUnchecked(wanted)).toMatchObject({ ok: true });
      expect(settleUnchecked(wanted)).toBeUndefined();                                  // settled once
    } finally { delete (globalThis as { sessionStorage?: unknown }).sessionStorage; }
  });
});

describe('which stick this is', () => {
  const right = demoBlock(), left = new Uint8Array(right); left[0x332] = (left[0x332] & 0xe0) | 9;
  it('takes the hand from the grip type, with or without a stick attached', () => {
    expect(stickModel(right)).toEqual({ hand: 'right', mount: null });
    expect(stickModel(left)).toEqual({ hand: 'left', mount: null });
  });
  it('takes the mount from the USB product id', () => {
    expect(stickModel(right, 0x0200)).toEqual({ hand: 'right', mount: 'standard' });
    expect(stickModel(left, 0x0201)).toEqual({ hand: 'left', mount: 'standard' });
    expect(stickModel(left, 0x3201)).toEqual({ hand: 'left', mount: 'omni' });
    expect(stickModel(right, 0x3200)).toEqual({ hand: 'right', mount: 'omni' });
  });
  it('falls back to the product id for the hand, and claims nothing for other devices', () => {
    const bare = new Uint8Array(right); bare.fill(0, 0x330, 0x340);
    expect(stickModel(bare, 0x3201)).toEqual({ hand: 'left', mount: 'omni' });
    expect(stickModel(bare, 0x0126)).toEqual({ hand: null, mount: null });
  });
});

describe('the chart', () => {
  const b = demoBlock(), w = wiring(b);
  const rows = [...SCG_CHART.inner, ...SCG_CHART.outer].flatMap((g) => g.rows);
  const at = (key: string) => lineOf(w, key)!;
  it('has a wired line for every row, and no line twice', () => {
    expect(chartFits(w)).toBe(true);
    const lines = rows.map((r) => lineOf(w, r.key));
    expect(lines.every((l) => l !== null)).toBe(true);
    expect(new Set(lines).size).toBe(rows.length);
    expect(rows.length).toBe(34);                       // seven on the base, twenty-seven on the grip
    expect(rows.some((r) => r.key === 'a1.push')).toBe(false);   // line 34: a plain hat's push, which a mini-stick grip lacks
    const bare = new Uint8Array(b); bare.fill(0, 0x330, 0x340);
    expect(chartFits(wiring(bare))).toBe(false);
  });
  it('says what each kind of control sends', () => {
    expect(rowSends(b, at('trigger.1'))).toMatchObject({ text: 'Button 1', simple: true, via: 10 });
    expect(rowSends(b, at('a1.up'))).toMatchObject({ text: 'Hat 1 up', simple: false });
    expect(rowSends(b, at('mini-stick.push')).text).toBe('Switches hat / axes');
    expect(rowSends(b, at('en.a'))).toMatchObject({ text: 'Button 23', via: 1 });      // the dial's two directions
    expect(rowSends(b, at('en.b'))).toMatchObject({ text: 'Button 24', via: 2 });
    expect(rowSends(b, at('f1')).text).toBe('Button 27');
    const auto = new Uint8Array(b); setLogical(auto, at('f1') - 1, 'auto');
    expect(rowSends(auto, at('f1')).text).toBe('Button 6');                             // left on auto: its own line number
    const shifted = new Uint8Array(b); setRole(shifted, b, at('d1'), 'shift1');
    expect(rowSends(shifted, at('d1')).text).toBe('SHIFT1 key');
  });
  it('knows which rows are hat directions, and when the hat points their way', () => {
    expect(rowSends(b, at('a1.up')).hat).toEqual({ n: 1, dir: 'up' });
    expect(rowSends(b, at('a1.left')).hat).toEqual({ n: 1, dir: 'left' });
    expect(rowSends(b, at('trigger.1')).hat).toBeUndefined();
    expect(hatIncludes(0, 'up')).toBe(true);
    expect(hatIncludes(1, 'up') && hatIncludes(1, 'right')).toBe(true);      // up-right lights both
    expect(hatIncludes(2, 'up')).toBe(false);
    expect(hatIncludes(7, 'up') && hatIncludes(7, 'left')).toBe(true);
    expect(['up', 'right', 'down', 'left'].some((d) => hatIncludes(8, d))).toBe(false);   // centred
  });
  it('makes a control a shift key and back', () => {
    const c = new Uint8Array(b), l = at('d1');
    expect(shiftsInUse(c)).toEqual({ shift1: false, shift2: false });
    setRole(c, b, l, 'shift1');
    expect(roleOf(c, l)).toBe('shift1');
    expect(physicalFunction(c, l - 1)).toMatchObject({ kind: 'SHIFT', detail: 'SHIFT1' });
    expect(shiftsInUse(c)).toEqual({ shift1: true, shift2: false });
    setRole(c, b, l, 'button');
    expect(c).toEqual(b);
  });
  it('gives a button its own output on a shift layer, on a spare line', () => {
    const c = new Uint8Array(b), l = at('a2'), wired = (n: number) => w.has(n);
    const spare = freeLine(c, wired)!;
    expect(spare).toBeGreaterThan(40);
    expect(w.has(spare)).toBe(false);
    setLayered(c, l, 1, spare); setLogical(c, spare - 1, 'button', 40);
    expect(rowSends(c, l, 0).text).toBe(rowSends(b, l, 0).text);                        // the normal layer is untouched
    expect(rowSends(c, l, 1)).toMatchObject({ text: 'Button 40', via: spare });
    expect(rowSends(c, l, 2).via).toBe(l);
    expect(physicalFunction(c, l - 1)).toMatchObject({ kind: 'Button', detail: `SHIFT1 → line ${spare}` });
    expect(freeLine(c, wired)).not.toBe(spare);                                         // a second one gets a different line
    setLayered(c, l, 2, freeLine(c, wired)!);
    expect(rowSends(c, l, 2).via).not.toBe(l);
    setLayered(c, l, 1, null); setLayered(c, l, 2, null);
    expect(rowSends(c, l, 1).via).toBe(l);
    expect(logicalFunction(c, spare - 1).auto).toBe(true);                              // the spare line was handed back
    expect(physicalFunction(c, l - 1)).toMatchObject({ kind: 'Button', detail: '' });
  });
  it('offers one choice per control: a button, a shift key or nothing', () => {
    const wired = (n: number) => w.has(n), l = at('a2');
    expect(choiceOf(b, l, 0)).toBe('button');
    expect(choiceOf(b, at('a1.up'), 0)).toBeNull();                                  // a hat direction
    expect(choiceOf(b, at('en.a'), 0)).toBeNull();                                   // the dial
    const c = new Uint8Array(b);
    setChoice(c, b, l, 0, 'shift2', wired); expect(choiceOf(c, l, 0)).toBe('shift2');
    setChoice(c, b, l, 0, 'none', wired);
    expect(choiceOf(c, l, 0)).toBe('none'); expect(roleOf(c, l)).toBe('button');
    setChoice(c, b, l, 0, 'button', wired);
    expect(c).toEqual(b);                                                             // back to the number it had
  });
  it('gives a control that never sent a button the lowest free number', () => {
    const wired = (n: number) => w.has(n), l = at('a2'), c = new Uint8Array(b);
    setLogical(c, l - 1, 'none');
    const fresh = new Uint8Array(c); setChoice(fresh, c, l, 0, 'button', wired);
    expect(rowSends(fresh, l).text).toBe(`Button ${freeButton(c, l, wired)}`);
    expect(freeButton(b, 0, wired)).toBe(31);                                         // the factory layout uses 1 to 30
  });
  it('types a button number, and typing the line number back restores "its own number"', () => {
    const l = at('f1'), auto = new Uint8Array(b); setLogical(auto, l - 1, 'auto');
    const c = new Uint8Array(auto);
    setButton(c, auto, l, 0, 50); expect(rowSends(c, l).text).toBe('Button 50');
    setButton(c, auto, l, 0, l); expect(c).toEqual(auto);
  });
  it('on a shift layer: the same as normal, its own button, or nothing', () => {
    const wired = (n: number) => w.has(n), l = at('a2'), c = new Uint8Array(b);
    expect(choiceOf(c, l, 1)).toBe('same');
    setChoice(c, b, l, 1, 'button', wired);
    const via = rowSends(c, l, 1).via;
    expect(via).not.toBe(l); expect(w.has(via)).toBe(false);
    expect(choiceOf(c, l, 1)).toBe('button');
    expect(rowSends(c, l, 1).text).toBe('Button 31');                                 // not the spare line's own number
    setButton(c, b, l, 1, 60); expect(rowSends(c, l, 1).text).toBe('Button 60');
    setChoice(c, b, l, 1, 'none', wired); expect(rowSends(c, l, 1)).toMatchObject({ text: 'nothing', via });
    setChoice(c, b, l, 1, 'same', wired);
    expect(c).toEqual(b);
    const shifted = new Uint8Array(b); setRole(shifted, b, l, 'shift1');
    expect(choiceOf(shifted, l, 1)).toBeNull();                                       // a shift key has no layers of its own
  });
  it('places every control inside its drawing, for all four sticks', () => {
    for (const g of [...SCG_CHART.inner, ...SCG_CHART.outer])
      for (const hand of ['left', 'right'] as const)
        for (const mount of ['standard', 'omni'] as const) {
          const [x, y] = spot(g.id, hand, mount), art = artSize(hand, mount);
          expect(x > 0 && x < art.w && y > 0 && y < art.h, `${g.id} ${hand} ${mount}: ${x},${y}`).toBe(true);
        }
  });
});

describe('response curves', () => {
  const b = demoBlock();
  it('a soft centre does less for small movements and still reaches full output', () => {
    const p = curvePoints(60);
    expect(p[9]).toBe(128);                                   // unity gain at full travel
    expect(p[0]).toBeLessThan(70);
    expect(p.every((v, i) => i === 0 || v >= p[i - 1])).toBe(true);
    expect(curveOutput(p, 1)).toBe(1);
    expect(curveOutput(p, 0.2)).toBeLessThan(0.12);
    expect(curvePoints(0)).toEqual(Array(10).fill(128));
    expect(curveOutput(curvePoints(-40), 0.2)).toBeGreaterThan(0.25);    // a sharp centre does more
    for (let x = 0.05; x < 1; x += 0.05) expect(curveOutput(p, x + 0.05)).toBeGreaterThan(curveOutput(p, x));   // never doubles back
  });
  it('choosing a shape switches the curve on, for this axis\'s own curve, and can be read back', () => {
    const c = new Uint8Array(b); c[0x69a + 2 * 3] = 0x05;      // the axis was pointed at another curve
    expect(curveState(c, 3)).toMatchObject({ on: false, shape: 0 });
    setCurveShape(c, 3, 60);
    expect(curveState(c, 3)).toMatchObject({ on: true, shape: 60 });
    expect(c[0x69a + 2 * 3] & 0x0f).toBe(0);
    expect([...c.subarray(0xbc + 30, 0xbc + 40)]).toEqual(curvePoints(60));
    setCurveShape(c, 3, 0);
    expect(curveState(c, 3)).toMatchObject({ on: false });
    expect([...c.subarray(0xbc + 30, 0xbc + 40)]).toEqual(curvePoints(60));   // switching off leaves the points alone
  });
  it('dragging a point sets what the axis gives there, and makes the curve a custom one', () => {
    const c = new Uint8Array(b);
    setCurvePoint(c, 0, 4, 0.25);                             // at half travel, give a quarter
    expect(c[0xbc + 4]).toBe(64);
    expect(curveOutput([...c.subarray(0xbc, 0xbc + 10)], 0.5)).toBeCloseTo(0.25);
    expect(curveState(c, 0)).toMatchObject({ on: true, shape: null });
  });
  it('recognises a curve it did not make as custom', () => {
    const c = new Uint8Array(b); c.set(fromHex('3a424a515961697078 80'), 0xbc + 40); c[0x7c + 8 * 4 + 3] |= 0x10;
    expect(curveState(c, 4)).toMatchObject({ on: true, shape: null });
  });
});

describe('the mini-stick and its click', () => {
  // every byte pattern asserted here was tried on a stick: see docs/BLOCK-BUTTONS.md section 11a
  const b = demoBlock(), w = wiring(b), wired = (n: number) => w.has(n), click = lineOf(w, 'mini-stick.push')!;
  const at = (c: Uint8Array, line: number) => [...c.subarray(physicalEntry(line - 1), physicalEntry(line - 1) + 2)];
  it('from the factory the click switches, starting as a hat', () => {
    expect(click).toBe(13);
    expect(miniStick(b, click, wired)).toBe('toggle-hat');
  });
  it('always a hat: the click becomes a button and the switching record is parked where nothing can press it', () => {
    const c = new Uint8Array(b); setMiniStick(c, b, click, 'hat', wired);
    expect(at(c, click)).toEqual([0xff, 0x7f]);
    const spare = [...Array(128).keys()].map((i) => i + 1).filter((l) => l !== click && c[physicalEntry(l - 1)] === 0x2e);
    expect(spare).toHaveLength(1);
    expect(w.has(spare[0])).toBe(false);
    expect(at(c, spare[0])).toEqual([0x2e, 0xe4]);
    expect(miniStick(c, click, wired)).toBe('hat');
    expect(rowSends(c, click)).toMatchObject({ text: 'Button 31', simple: true });   // the lowest number the factory layout leaves free
    expect(freeLine(c, wired)).not.toBe(spare[0]);                                   // and that line is no longer handed out
  });
  it('always axes: the click is a button and no switching record is left', () => {
    const c = new Uint8Array(b); setMiniStick(c, b, click, 'axes', wired);
    expect(at(c, click)).toEqual([0xff, 0x7f]);
    expect([...Array(128).keys()].some((i) => c[physicalEntry(i)] === 0x2e)).toBe(false);
    expect(miniStick(c, click, wired)).toBe('axes');
  });
  it('moves between all four and comes back to the factory bytes', () => {
    const c = new Uint8Array(b);
    for (const m of ['hat', 'axes', 'hat', 'toggle-axes'] as const) { setMiniStick(c, b, click, m, wired); expect(miniStick(c, click, wired)).toBe(m); }
    expect(at(c, click)).toEqual([0x2e, 0x64]);
    setMiniStick(c, b, click, 'toggle-hat', wired);
    expect(c).toEqual(b);
  });
  it('comes back to the factory bytes even after the change has been written (the stick, not the page, is then "before")', () => {
    const written = new Uint8Array(b); setMiniStick(written, b, click, 'hat', wired);
    const c = new Uint8Array(written); setMiniStick(c, written, click, 'toggle-hat', wired);     // found on a real stick
    expect(c).toEqual(b);
  });
  it('lets the freed click be a shift key, and keeps the mode while it is one', () => {
    const c = new Uint8Array(b); setMiniStick(c, b, click, 'hat', wired);
    setChoice(c, b, click, 0, 'shift1', wired);
    expect(miniStick(c, click, wired)).toBe('hat');
    setMiniStick(c, b, click, 'axes', wired);
    expect(roleOf(c, click)).toBe('shift1');
    expect(miniStick(c, click, wired)).toBe('axes');
    setMiniStick(c, b, click, 'toggle-hat', wired);
    expect(c).toEqual(b);
  });
  it('says what each direction gives in each mode', () => {
    expect(miniStickWay('up', 'hat', 'Hat 1 up')).toBe('Hat 1 up');
    expect(miniStickWay('left', 'axes', 'Hat 1 left')).toBe('X axis');
    expect(miniStickWay('down', 'toggle-hat', 'Hat 1 down')).toBe('Hat 1 down, or Y axis');
  });
  it('keeps a button number the user chose for the click when switching between the two "always" choices', () => {
    const c = new Uint8Array(b); setMiniStick(c, b, click, 'axes', wired); setLogical(c, click - 1, 'button', 77);
    setMiniStick(c, b, click, 'hat', wired);
    expect(rowSends(c, click).text).toBe('Button 77');
  });
});
