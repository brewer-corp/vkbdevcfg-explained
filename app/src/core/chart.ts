// The stick as a chart: which controls it has, how they group, and what each one sends.
// This is the model behind the picture; nothing here draws anything.
import { logicalEntry, logicalFunction, physicalEntry, physicalFunction, setLogical } from './schema';
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

/**
 * The EVO's axes, by logical slot, in the order the factory configuration uses. `note` is for the two whose numbers run
 * the opposite way to what a person expects.
 */
export const SCG_AXES: { slot: number; label: string; note?: string }[] = [
  { slot: 0, label: 'Stick X' },
  { slot: 1, label: 'Stick Y', note: 'This one runs backwards from what you might expect: the value goes down as the stick goes forward.' },
  { slot: 2, label: 'Twist' },
  { slot: 3, label: 'Throttle', note: 'This one runs backwards from what you might expect: the value goes down as the lever goes forward.' },
  { slot: 4, label: 'Mini-stick X' }, { slot: 5, label: 'Mini-stick Y' },
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
  /** Set when what is sent is a direction of a hat (1-based hat number). */
  hat?: { n: number; dir: string };
}

/**
 * Whether a hat's reported value (0 = up, clockwise in eighths, 8 = centred) includes a direction. A diagonal counts
 * for both of its neighbours.
 */
export function hatIncludes(value: number, dir: string): boolean {
  const at = ['up', 'right', 'down', 'left'].indexOf(dir) * 2;
  return value < 8 && at >= 0 && [(at + 7) % 8, at, (at + 1) % 8].includes(value);
}

const title = (s: string) => s[0].toUpperCase() + s.slice(1);

function output(block: Uint8Array, line: number): { text: string; simple: boolean; hat?: Sends['hat'] } {
  const l = logicalFunction(block, line - 1);
  if (l.kind === 'Button' || l.kind === 'Auto') return { text: `Button ${l.button}${l.detail ? ' ' + l.detail : ''}`, simple: true };
  if (l.kind === 'No function') return { text: 'nothing', simple: true };
  if (l.kind === 'Hat') { const [hat, dir] = l.detail.split(', '); return { text: `${title(hat)} ${dir}`, simple: false, hat: { n: +hat.slice(4), dir } }; }
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
  if (p.kind === 'POV switch') { const [hat, dir] = p.detail.split(', '); return { text: `${title(hat)} ${dir}`, via: line, simple: false, hat: { n: +hat.slice(4), dir } }; }
  if (p.kind === 'uStick switch') return { text: 'Switches it: hat or axes', via: line, simple: false };
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

// ---------------------------------------------------------------- the mini-stick: hat, axes, and its click ---

const USTICK = 0x2e;                              // the job "this press switches the mini-stick between hat and axes"

/**
 * What the mini-stick is, and what its click does. From the factory the click switches it between a hat and two axes.
 * All four of these were tried on a stick:
 * - with the click an ordinary button and no switching record anywhere, the mini-stick is two axes, permanently;
 * - with a switching record parked on a line nothing is wired to, the mini-stick starts the way that record says
 *   (bit 7: as a hat) and stays that way, since nothing can press it.
 */
export type MiniStick = 'toggle-hat' | 'toggle-axes' | 'hat' | 'axes';

export const MINI_STICK: Record<MiniStick, string> = {
  'toggle-hat': 'switchable, starts as a hat',
  'toggle-axes': 'switchable, starts as axes',
  hat: 'always a hat',
  axes: 'always two axes',
};

const parked = (block: Uint8Array, wired: (line: number) => boolean) =>
  [...Array(128).keys()].map((i) => i + 1).filter((l) => !wired(l) && block[physicalEntry(l - 1)] === USTICK);

/** Null when the configuration is none of the four (a switching record on some other control, say). */
export function miniStick(block: Uint8Array, click: number, wired: (line: number) => boolean): MiniStick | null {
  const at = physicalEntry(click - 1);
  if (block[at] === USTICK) return block[at + 1] & 0x80 ? 'toggle-hat' : 'toggle-axes';
  if (!(block[at] & 0x80)) return null;
  for (let l = 1; l <= 128; l++) if (l !== click && wired(l) && block[physicalEntry(l - 1)] === USTICK) return null;
  const spare = parked(block, wired);
  return spare.length && block[physicalEntry(spare[0] - 1) + 1] & 0x80 ? 'hat' : 'axes';
}

export function setMiniStick(block: Uint8Array, original: Uint8Array, click: number, mode: MiniStick, wired: (line: number) => boolean): void {
  const at = physicalEntry(click - 1);
  // keep the record's other settings (which hat, how it switches) from wherever one last was
  const kept = [click, ...parked(block, wired)].map((l) => physicalEntry(l - 1)).find((o) => block[o] === USTICK);
  const record = (kept !== undefined ? block[kept + 1] : original[at] === USTICK ? original[at + 1] : 0xe4) & 0x7f;
  for (const l of parked(block, wired)) block.set([0xff, 0xff], physicalEntry(l - 1));
  if (mode === 'toggle-hat' || mode === 'toggle-axes') {
    // coming back from being a button: drop the button number it was given (a switching press sends nothing).
    // Not "what it was before": after a write, before is the button.
    if (block[at] & 0x80) block.set([0xff, 0xff], logicalEntry(click - 1));
    block.set([USTICK, record | (mode === 'toggle-hat' ? 0x80 : 0)], at);
    return;
  }
  const wasButton = !!(block[at] & 0x80);
  block.set(PLAIN, at);
  if (mode === 'hat') { const spare = freeLine(block, wired); if (spare) block.set([USTICK, record | 0x80], physicalEntry(spare - 1)); }
  if (!wasButton) {
    // newly a button: left on "its own number" it would send button 13, which the factory layout already uses. Give it
    // the lowest joystick button nothing else sends.
    const used = new Set<number>();
    for (let l = 1; l <= 128; l++) { const f = logicalFunction(block, l - 1); if (f.button !== null && l !== click && (!f.auto || wired(l))) used.add(f.button); }
    let free = 1; while (used.has(free) && free < 127) free++;
    setLogical(block, click - 1, 'button', free);
  }
}
