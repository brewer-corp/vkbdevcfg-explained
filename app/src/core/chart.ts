// The stick as a chart: which controls it has, how they group, and what each one sends.
// This is the model behind the picture; nothing here draws anything.
import { logicalFunction, physicalEntry, physicalFunction } from './schema';
import type { Control } from './wiring';

/** `glyph` is one of the drawn marks (up, down, left, right, push, click, dot) or a short text such as "F1". */
export interface RowDef { key: string; glyph: string; label: string }
export interface GroupDef { id: string; title: string; rows: RowDef[] }

const way = (id: string, extra: RowDef[] = []): RowDef[] => [
  { key: `${id}.push`, glyph: 'push', label: 'push' }, { key: `${id}.up`, glyph: 'up', label: 'up' }, { key: `${id}.down`, glyph: 'down', label: 'down' },
  { key: `${id}.left`, glyph: 'left', label: 'left' }, { key: `${id}.right`, glyph: 'right', label: 'right' }, ...extra,
];

/**
 * A Gladiator EVO with an SCG grip, in two columns. `inner` is the side the grip's hats face: the left column for a
 * left-hand stick, the right column for a right-hand one.
 */
export const SCG_CHART: { inner: GroupDef[]; outer: GroupDef[] } = {
  inner: [
    { id: 'b1', title: 'B1 · side button', rows: [{ key: 'b1', glyph: 'dot', label: 'press' }] },
    { id: 'a4', title: 'A4 · top hat', rows: way('a4') },
    { id: 'a3', title: 'A3 · centre hat', rows: way('a3') },
    { id: 'a1', title: 'A1 · mini-stick', rows: way('a1', [{ key: 'mini-stick.push', glyph: 'click', label: 'stick click' }]) },
    { id: 'f', title: 'Base buttons', rows: [{ key: 'f2', glyph: 'F2', label: 'F2' }, { key: 'f1', glyph: 'F1', label: 'F1' }, { key: 'f3', glyph: 'F3', label: 'F3' }] },
    { id: 'sw1', title: 'Sw1 · base switch', rows: [{ key: 'sw1.up', glyph: 'up', label: 'up' }, { key: 'sw1.down', glyph: 'down', label: 'down' }] },
  ],
  outer: [
    { id: 'a2', title: 'A2 · red button', rows: [{ key: 'a2', glyph: 'dot', label: 'press' }] },
    { id: 'rapid', title: 'Rapid-fire trigger', rows: [{ key: 'rapid.fire.up', glyph: 'up', label: 'up' }, { key: 'rapid.fire.down', glyph: 'down', label: 'down' }] },
    { id: 'trigger', title: 'Main trigger', rows: [{ key: 'trigger.1', glyph: '1', label: 'first stage' }, { key: 'trigger.2', glyph: '2', label: 'second stage' }] },
    { id: 'c1', title: 'C1 · thumb hat', rows: way('c1') },
    { id: 'd1', title: 'D1 · pinky button', rows: [{ key: 'd1', glyph: 'dot', label: 'press' }] },
    { id: 'en', title: 'Base dial', rows: [{ key: 'en.a', glyph: 'up', label: 'one way' }, { key: 'en.b', glyph: 'down', label: 'the other way' }] },
  ],
};

/** The EVO's axes, by logical slot, in the order the factory configuration uses. */
export const SCG_AXES = [
  { slot: 0, label: 'Stick X' }, { slot: 1, label: 'Stick Y' }, { slot: 2, label: 'Twist' },
  { slot: 3, label: 'Throttle' }, { slot: 4, label: 'Mini-stick X' }, { slot: 5, label: 'Mini-stick Y' },
];

/** True when this configuration is one the chart can draw: every control it names is wired somewhere. */
export function chartFits(controls: Map<number, Control>): boolean {
  const keys = new Set([...controls.values()].map((c) => c.key));
  return [...SCG_CHART.inner, ...SCG_CHART.outer].every((g) => g.rows.every((r) => keys.has(r.key)));
}

export const lineOf = (controls: Map<number, Control>, key: string): number | null => {
  for (const [line, c] of controls) if (c.key === key) return line;
  return null;
};

// ---------------------------------------------------------------- what a control sends ---

/** 0 = nothing held, 1 = SHIFT1 held, 2 = SHIFT2 held. */
export type Layer = 0 | 1 | 2;

export interface Sends {
  text: string;
  /** The line whose output entry decides what is sent (1-based): the control's own, or the one a shift moves it to. */
  via: number;
  /** A plain button, auto-numbered button or nothing: what the chart can edit directly. */
  simple: boolean;
}

const title = (s: string) => s[0].toUpperCase() + s.slice(1);

function output(block: Uint8Array, line: number): { text: string; simple: boolean } {
  const l = logicalFunction(block, line - 1);
  if (l.kind === 'Button' || l.kind === 'Auto') return { text: `Button ${l.button}${l.detail ? ' ' + l.detail : ''}`, simple: true };
  if (l.kind === 'No function') return { text: 'nothing', simple: true };
  if (l.kind === 'Hat') { const [hat, dir] = l.detail.split(', '); return { text: `${title(hat)} ${dir}`, simple: false }; }
  return { text: `${l.kind}${l.detail ? ' ' + l.detail : ''}`, simple: false };
}

/** What the control on `line` (1-based) sends to the PC with the given shift held. */
export function rowSends(block: Uint8Array, line: number, layer: Layer = 0): Sends {
  const p = physicalFunction(block, line - 1);
  const b0 = block[physicalEntry(line - 1)], b1 = block[physicalEntry(line - 1) + 1];
  // the second half of a two-line record (an encoder's other direction) has no entry of its own
  const first = line > 1 ? physicalFunction(block, line - 2) : null;
  if (first?.wide && first.kind === 'Encoder') {
    const via = ((block[physicalEntry(line - 2) + 1] + 1) & 0x7f) + 1;
    return { ...output(block, via), via, simple: false };
  }
  if (p.plain) {
    const moved = layer === 1 ? b0 & 0x7f : layer === 2 ? b1 & 0x7f : 0x7f;
    const via = layer && moved !== 0x7f ? moved + 1 : line;
    return { ...output(block, via), via };
  }
  if (p.kind === 'Encoder') { const via = ((b1 + 1) & 0x7f) || line; return { ...output(block, via), via, simple: false }; }
  if (p.kind === 'POV switch') { const [hat, dir] = p.detail.split(', '); return { text: `${title(hat)} ${dir}`, via: line, simple: false }; }
  if (p.kind === 'uStick switch') return { text: 'Switches mini-stick: hat or axes', via: line, simple: false };
  if (p.kind === 'No function') return { text: 'nothing', via: line, simple: false };
  if (p.kind === 'SHIFT') { const [which, ...how] = p.detail.split(' + '); return { text: `${which} key${how.length ? ` (${how.join(', ')})` : ''}`, via: line, simple: false }; }
  return { text: p.detail ? `${p.kind}: ${p.detail}` : p.kind, via: line, simple: false };
}

/** Whether any control is set up as SHIFT1 or SHIFT2, i.e. whether there is more than one layer to show. */
export function shiftsInUse(block: Uint8Array): { shift1: boolean; shift2: boolean } {
  let shift1 = false, shift2 = false;
  for (let line = 0; line < 128; line++) {
    const b0 = block[physicalEntry(line)];
    if (b0 >> 3 === 9) { shift1 ||= !!(b0 & 1); shift2 ||= !!(b0 & 2); }
  }
  return { shift1, shift2 };
}

// ---------------------------------------------------------------- editing through the chart ---

const PLAIN = [0xff, 0x7f];                       // a button with no shift lines, as the factory writes it

/** What a control is, as far as the chart lets you choose: an ordinary button, or one of the two shift keys. */
export type Role = 'button' | 'shift1' | 'shift2' | 'other';

export function roleOf(block: Uint8Array, line: number): Role {
  const b0 = block[physicalEntry(line - 1)];
  if (b0 & 0x80) return 'button';
  if (b0 >> 3 === 9 && (b0 & 3) === 1) return 'shift1';
  if (b0 >> 3 === 9 && (b0 & 3) === 2) return 'shift2';
  return 'other';
}

/** Make the control a button again (as it was, if it was one) or a momentary SHIFT1 / SHIFT2 key. */
export function setRole(block: Uint8Array, original: Uint8Array, line: number, role: 'button' | 'shift1' | 'shift2'): void {
  const at = physicalEntry(line - 1);
  if (role === 'button') block.set(original[at] & 0x80 ? original.subarray(at, at + 2) : PLAIN, at);
  else block.set([role === 'shift1' ? 0x49 : 0x4a, 0xff], at);
}

/** A line nothing uses: not wired, no job, no output, and not a shift target of any button. Null if there is none. */
export function freeLine(block: Uint8Array, wired: (line: number) => boolean): number | null {
  const taken = new Set<number>();
  for (let l = 1; l <= 128; l++) {
    const at = physicalEntry(l - 1), b0 = block[at], b1 = block[at + 1];
    if (!(b0 & 0x80)) continue;
    for (const s of [b0 & 0x7f, b1 & 0x7f]) if (s !== 0x7f && s + 1 !== l) taken.add(s + 1);
  }
  for (let l = 127; l > 40; l--) {
    const at = physicalEntry(l - 1), lg = 0x20c + 2 * (l - 1);
    const idle = block[at] === 0xff && (block[at + 1] | 0x80) === 0xff && block[lg] === 0xff && block[lg + 1] === 0xff;
    if (idle && !taken.has(l) && !wired(l)) return l;
  }
  return null;
}

/**
 * Give a button its own output while a shift is held, on a spare line (returned), or take that away again.
 * A button stores, for each shift, the line it should act as; the spare line's output entry then says what is sent.
 */
export function setLayered(block: Uint8Array, line: number, layer: 1 | 2, spare: number | null): void {
  const at = physicalEntry(line - 1) + (layer === 1 ? 0 : 1);
  const was = block[at] & 0x7f;
  if (spare === null) {
    if (was !== 0x7f && was + 1 !== line) block.set([0xff, 0xff], 0x20c + 2 * was);     // hand the spare line back
    block[at] = (block[at] & 0x80) | 0x7f;
    if (layer === 1) block[at] |= 0x80;                                                  // byte 0 must stay a "button" byte
  } else {
    block[at] = (layer === 1 ? 0x80 : block[at] & 0x80) | (spare - 1);
  }
}
