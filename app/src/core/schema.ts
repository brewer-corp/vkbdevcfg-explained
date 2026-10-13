// What the bytes mean. Layout from docs/BLOCK-*.md.
//
// `conf` says how far to trust a field: 'verified' has been changed on a real stick and read
// back; 'static' is a reading of the vendor tool's code. The UI only lets static fields be
// edited in experimental mode.

export type Confidence = 'verified' | 'static';

export interface FieldDef {
  key: string;
  label: string;
  /** Position inside the record: byte offset, first bit, width in bits (may span bytes, LSB first). */
  byte: number;
  bit: number;
  width: number;
  kind: 'bool' | 'uint' | 'enum' | 'tenths';
  options?: string[];
  conf: Confidence;
  hint?: string;
  min?: number;
  max?: number;
  /** Stored value = shown value - offset (the tool stores many 1-based numbers minus one). */
  offset?: number;
}

export function getBits(block: Uint8Array, at: number, bit: number, width: number): number {
  let v = 0;
  for (let i = 0; i < width; i++) {
    const p = bit + i;
    v |= ((block[at + (p >> 3)] >> (p & 7)) & 1) << i;
  }
  return v >>> 0;
}

export function setBits(block: Uint8Array, at: number, bit: number, width: number, value: number): void {
  for (let i = 0; i < width; i++) {
    const p = bit + i;
    const mask = 1 << (p & 7);
    if ((value >> i) & 1) block[at + (p >> 3)] |= mask;
    else block[at + (p >> 3)] &= ~mask;
  }
}

export const readField = (block: Uint8Array, base: number, f: FieldDef) =>
  getBits(block, base + f.byte, f.bit, f.width) + (f.offset ?? 0);

export function writeField(block: Uint8Array, base: number, f: FieldDef, shown: number): void {
  const max = f.width >= 31 ? 0x7fffffff : (1 << f.width) - 1;
  const raw = Math.max(0, Math.min(max, Math.round(shown) - (f.offset ?? 0)));
  setBits(block, base + f.byte, f.bit, f.width, raw);
}

// ---------------------------------------------------------------- axes ---

export const AXIS_SLOTS = 8;
export const logicalAxisBase = (n: number) => (n < 8 ? 0x3c + 8 * n : 0x61a + 8 * (n - 8));
export const physicalAxisBase = (n: number) => (n < 8 ? 0x7c + 8 * n : 0x65a + 8 * (n - 8));
export const curveBase = (n: number) => 0xbc + 10 * n;
export const CURVE_POINTS = 10;

export const HID_USAGES = ['X', 'Y', 'Z', 'Rot X', 'Rot Y', 'Rot Z', 'Slider', 'Dial', 'Wheel', 'Rudder',
  'Throttle', 'Accelerator', 'Flaps', 'Aileron', 'Aileron trim', 'Elevator'];
export const INPUT_TYPES = ['D_MaRS', 'Analogue', 'A_MaRS', 'Virtual', 'V_MaRS', 'Trimmer', 'Shunt', '7'];

export const LOGICAL_AXIS: FieldDef[] = [
  { key: 'en', label: 'Enabled', byte: 0, bit: 4, width: 1, kind: 'bool', conf: 'static' },
  { key: 'vis', label: 'Visible to the PC', byte: 0, bit: 5, width: 1, kind: 'bool', conf: 'static' },
  { key: 'inv', label: 'Inverted', byte: 0, bit: 6, width: 1, kind: 'bool', conf: 'static' },
  { key: 'ctr', label: 'Has a centre', byte: 0, bit: 7, width: 1, kind: 'bool', conf: 'static' },
  { key: 'src', label: 'Physical axis', byte: 0, bit: 0, width: 4, kind: 'uint', offset: 1, min: 1, max: 16, conf: 'static',
    hint: 'Which sensor feeds this axis' },
  { key: 'usage', label: 'Appears as', byte: 1, bit: 0, width: 4, kind: 'enum', options: HID_USAGES, conf: 'static' },
  { key: 'prec', label: 'Precision (bits)', byte: 2, bit: 0, width: 4, kind: 'uint', min: 8, max: 15, conf: 'static' },
  { key: 'dzlo', label: 'Deadzone, centre / low (%)', byte: 3, bit: 0, width: 8, kind: 'tenths', conf: 'static' },
  { key: 'dzhi', label: 'Deadzone, high (%)', byte: 4, bit: 0, width: 8, kind: 'tenths', conf: 'static' },
  { key: 'rel', label: 'Relative mode', byte: 6, bit: 7, width: 1, kind: 'bool', conf: 'static' },
];

export const PHYSICAL_AXIS: FieldDef[] = [
  { key: 'filter', label: 'Filter grade', byte: 1, bit: 5, width: 3, kind: 'uint', min: 0, max: 7, conf: 'verified',
    hint: 'Smoothing. 0 = manual / off' },
  { key: 'thr', label: 'Dynamic filter threshold', byte: 2, bit: 0, width: 8, kind: 'uint', min: 0, max: 255, conf: 'static' },
  { key: 'hf', label: 'H-filter', byte: 0, bit: 4, width: 3, kind: 'uint', min: 0, max: 7, conf: 'static' },
  { key: 'inv', label: 'Sensor inverted', byte: 0, bit: 2, width: 1, kind: 'bool', conf: 'static' },
  { key: 'acn', label: 'Auto-centre', byte: 0, bit: 0, width: 1, kind: 'bool', conf: 'static' },
  { key: 'acl', label: 'Auto-calibrate', byte: 0, bit: 1, width: 1, kind: 'bool', conf: 'static' },
  { key: 'eq', label: 'Response curve on', byte: 3, bit: 4, width: 1, kind: 'bool', conf: 'static' },
  { key: 'mpl', label: 'Multiplier', byte: 1, bit: 0, width: 4, kind: 'uint', min: 1, max: 15, conf: 'static' },
];

/** Sensor type of a physical axis: three bits scattered over the record. */
export function inputType(block: Uint8Array, n: number): string {
  const b = physicalAxisBase(n);
  return INPUT_TYPES[getBits(block, b, 3, 1) | (getBits(block, b + 3, 3, 1) << 1) | (getBits(block, b + 3, 7, 1) << 2)];
}

/** A physical slot holding the factory template for "no sensor here". */
export function physicalAxisUnused(block: Uint8Array, n: number): boolean {
  const b = physicalAxisBase(n);
  return block[b + 4] === 0xff && block[b + 5] === 0xff && block[b + 6] === 0 && block[b + 7] === 0;
}

// ------------------------------------------------------------- buttons ---

export const LINES = 128;
export const physicalEntry = (line: number) => 0x10c + 2 * line;
export const logicalEntry = (line: number) => 0x20c + 2 * line;

const PHYS_TYPES: Record<number, string> = {
  0: 'AUX axes', 1: 'Generator', 2: 'Fix axes', 3: 'Cyclic switch', 4: 'Boolean', 6: 'Trimmer',
  9: 'SHIFT', 10: 'Tempo', 12: 'Encoder', 13: 'Curves v2',
};
const POV_DIR = ['up', 'right', 'down', 'left'];

export interface PhysicalFn { kind: string; detail: string; plain: boolean; wide: boolean }

/** What a wired line is. `wide` records also consume the next line's entry. */
export function physicalFunction(block: Uint8Array, line: number): PhysicalFn {
  const at = physicalEntry(line);
  const b0 = block[at], b1 = block[at + 1];
  if (b0 & 0x80) {
    const s1 = b0 & 0x7f, s2 = b1 & 0x7f;
    const sh = (s: number) => (s === 0x7f || s === line ? null : s + 1);
    const parts = [sh(s1) && `SHIFT1 → line ${sh(s1)}`, sh(s2) && `SHIFT2 → line ${sh(s2)}`].filter(Boolean);
    return { kind: 'Button', detail: parts.join(', '), plain: true, wide: false };
  }
  const type = b0 >> 3, sub = b0 & 7;
  let kind = PHYS_TYPES[type] ?? `Type ${type}`, detail = '';
  if (type === 7) { kind = sub < 4 ? 'POV switch' : 'uPOV switch'; detail = sub < 4 ? `hat ${(b1 & 3) + 1}, ${POV_DIR[sub]}` : ''; }
  else if (type === 5) kind = ['Sync', 'Replica button', 'Curves', 'Curves (alt)', 'Rel axes', 'Rel axes', 'uStick switch', 'Parametric'][sub];
  else if (type === 8) kind = sub < 4 ? 'ButtonX' : 'Switch CB';
  else if (type === 11) kind = sub === 4 ? 'ButAlt / Radio' : sub === 5 ? 'Rotary switch' : sub === 6 ? 'Dependent button' : 'Toggle';
  else if (type === 14) kind = sub === 0 ? 'SubSHIFT' : 'ButtonS / ButtonM';
  else if (type === 15) kind = 'No function';
  else if (type === 9) detail = `shift ${(sub & 3) + 1}`;
  else if (type === 12) detail = `mode ${sub}`;
  return { kind, detail, plain: false, wide: type === 4 || type === 12 };
}

export interface LogicalFn { kind: string; detail: string; button: number | null }

/** What a line sends to the PC. `button` is the joystick button number when it is a plain button. */
export function logicalFunction(block: Uint8Array, line: number): LogicalFn {
  const at = logicalEntry(line);
  const lo = block[at], hi = block[at + 1];
  if (lo === 0xff) return { kind: hi === 0xff ? '—' : 'Auto', detail: '', button: null };
  if (lo & 0x80) {
    const second = hi === 0xff ? '' : `+ button ${((hi + 1) & 0x7f)}`;
    return { kind: 'Button', detail: second, button: (lo & 0x7f) + 1 };
  }
  const named: Record<number, string> = { 0x74: 'Hat', 0x76: 'Macro', 0x77: 'Mouse', 0x78: 'System', 0x79: 'Multimedia',
    0x7a: 'Audio', 0x7b: 'Application', 0x7c: 'Void', 0x7f: 'No function' };
  if (named[lo]) return { kind: named[lo], detail: lo === 0x76 ? `#${((hi + 1) & 0x7f)}` : '', button: null };
  return { kind: 'Keyboard', detail: `key 0x${lo.toString(16)}`, button: null };
}

/** Assign a joystick button (1..127) to a line, or null to clear it. */
export function setLogicalButton(block: Uint8Array, line: number, button: number | null): void {
  const at = logicalEntry(line);
  block[at] = button === null ? 0xff : 0x80 | ((button - 1) & 0x7f);
  block[at + 1] = 0xff;
}

// ---------------------------------------------------------------- LEDs ---

export const LED_EVENTS_AT = 0x3b8;
export const LED_EVENT_SIZE = 6;
export const LED_EVENT_MAX = 52;
export const LED_EVENT_TYPES = ['External', 'Always', 'SHIFT', 'Fix axis', 'Calibration', 'Physical button', 'Virtual button',
  'Logical button', 'Axis in centre', 'MaRS fault', 'Calibration fault', 'SubSHIFT', 'Rudder connect', 'BUS error',
  'POV active', 'Mouse active', 'Profile N', 'Cyclic switch', 'P-alternate function', 'V-alternate function',
  'Boolean function', 'Detents set', 'Detents state', 'Trimmer in centre'];
export const LED_MODES = ['Off', 'Constant', 'Slow blink', 'Fast blink', 'Ultra-fast blink', 'Flash', '6', '7'];
export const LED_COLOR_MODES = ['Colour 1', 'Colour 2', 'Colour 1 / 2', 'Colour 2 / 1', 'Colour 1 + 2', '5', '6', '7'];

export interface LedEvent {
  index: number; at: number; empty: boolean; led: number; type: number; typeName: string;
  c1: [number, number, number]; c2: [number, number, number]; mode: number; colorMode: number; param: number; inverted: boolean;
}

export function ledEvent(block: Uint8Array, index: number): LedEvent {
  const at = LED_EVENTS_AT + index * LED_EVENT_SIZE;
  const g = (bit: number, w = 3) => getBits(block, at, bit, w);
  const b3 = block[at + 3];
  const type = (b3 & 0x0f) + ((b3 >> 5) & 1) * 16;
  return {
    index, at, empty: block.subarray(at, at + LED_EVENT_SIZE).every((x) => x === 0),
    led: block[at + 5] & 0x7f, type, typeName: LED_EVENT_TYPES[type] ?? `Type ${type}`,
    c1: [g(0), g(3), g(6)], c2: [g(9), g(12), g(15)], mode: g(18), colorMode: g(21),
    param: block[at + 4], inverted: !!(b3 & 0x10),
  };
}

/** A 3-bit-per-channel colour as CSS. */
export const ledCss = ([r, g, b]: [number, number, number]) =>
  `rgb(${Math.round((r / 7) * 255)}, ${Math.round((g / 7) * 255)}, ${Math.round((b / 7) * 255)})`;

// ----------------------------------------------------- external devices ---

export const EXT_TYPES: Record<number, string> = { 0: 'None', 1: 'Generic device', 2: 'TRudder', 3: 'KG12', 4: 'KG12 Twist',
  5: 'GF Base L', 6: 'GF Base', 7: 'MCG', 8: 'SCG', 9: 'SCG-L', 10: 'TMW Adapter', 11: 'F14 Stick', 12: 'MCG Ultimate',
  13: 'SEM', 14: 'THQ', 15: 'FSM.DIY', 16: 'FSM.GA', 17: 'FSM.XX', 18: 'STEM', 19: 'MTG-R', 20: 'MTG-L', 21: 'MTS-R',
  22: 'MTS-L', 23: 'TR3', 24: 'RP', 25: 'LP', 31: 'NXT Joker' };

export interface ExtDevice { index: number; type: number; name: string; registers: number; leds: number; firstLed: number; port: number }

export function extDevice(block: Uint8Array, index: number): ExtDevice {
  const at = 0x330 + 16 * index;
  const type = block[at + 2] & 0x1f;
  return {
    index, type, name: EXT_TYPES[type] ?? `Type ${type}`,
    registers: getBits(block, at + 4, 4, 5), leds: getBits(block, at + 5, 6, 6), firstLed: getBits(block, at + 6, 4, 6),
    port: getBits(block, at + 3, 2, 3) + 1,
  };
}

// -------------------------------------------------------------- regions ---

export interface Region { start: number; end: number; name: string; group: 'header' | 'options' | 'axes' | 'buttons' | 'ext' | 'leds' | 'detents' | 'unknown' | 'unused' }

export const REGIONS: Region[] = [
  { start: 0x000, end: 0x009, name: 'Header: marker, type, CRC-32, firmware', group: 'header' },
  { start: 0x00a, end: 0x03b, name: 'Global options, mouse, POV hats', group: 'options' },
  { start: 0x03c, end: 0x07b, name: 'Logical axes 0–7', group: 'axes' },
  { start: 0x07c, end: 0x0bb, name: 'Physical axes 0–7', group: 'axes' },
  { start: 0x0bc, end: 0x10b, name: 'Response curves', group: 'axes' },
  { start: 0x10c, end: 0x20b, name: 'Physical button table', group: 'buttons' },
  { start: 0x20c, end: 0x30b, name: 'Logical button table', group: 'buttons' },
  { start: 0x30c, end: 0x31b, name: 'Axis → buttons', group: 'axes' },
  { start: 0x31c, end: 0x32f, name: 'Virtual buttons, system address', group: 'options' },
  { start: 0x330, end: 0x3af, name: 'External devices', group: 'ext' },
  { start: 0x3b0, end: 0x4ef, name: 'LED masks and events', group: 'leds' },
  { start: 0x4f0, end: 0x5df, name: 'Boolean functions', group: 'buttons' },
  { start: 0x5e0, end: 0x619, name: 'More options, POV 2–3', group: 'options' },
  { start: 0x61a, end: 0x6b9, name: 'Axes 8–15, curve numbers', group: 'axes' },
  { start: 0x6ba, end: 0x78f, name: 'Not decoded', group: 'unknown' },
  { start: 0x790, end: 0x7cf, name: 'Trimmer sources', group: 'axes' },
  { start: 0x7d0, end: 0x7ff, name: 'LED gauges', group: 'leds' },
  { start: 0x800, end: 0x8ff, name: 'Button table extension', group: 'buttons' },
  { start: 0x900, end: 0xaff, name: 'Advanced Mapping virtual layer', group: 'unknown' },
  { start: 0xb00, end: 0xdb1, name: 'Detents', group: 'detents' },
  { start: 0xdb2, end: 0xfff, name: 'Unused', group: 'unused' },
];
export const regionOf = (offset: number) => REGIONS.find((r) => offset >= r.start && offset <= r.end)!;
