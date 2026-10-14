// Response curves, as people think of them: "soften the centre a bit", not ten gain bytes.
//
// The stick stores a curve as ten bytes, one per 10 % of travel. Each is a gain: output = input x byte / 128, so 0x80
// means "unchanged". Between points the firmware interpolates the gain (seen on hardware). A curve applies to a
// physical axis when its Eq bit is set; the axis uses the curve with its own number unless told otherwise.
import { CURVE_POINTS, PHYSICAL_AXIS, curveBase, physicalAxisBase, readField, writeField } from './schema';

const EQ = PHYSICAL_AXIS.find((f) => f.key === 'eq')!;
const curveNumberAt = (n: number) => 0x69a + 2 * n;          // low nibble: 0 = the axis's own curve
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The ten points for a shape from -100 to 100. Positive softens the centre (the classic "expo": small movements do
 * less, full travel still reaches full output); negative sharpens it; 0 is a straight line.
 */
export function curvePoints(shape: number): number[] {
  const k = (Math.abs(shape) / 100) * 0.9;
  return [...Array(CURVE_POINTS).keys()].map((i) => {
    const x = (i + 1) / CURVE_POINTS;
    return clamp(Math.round(128 * (shape >= 0 ? 1 - k + k * x * x : 1 + k * (1 - x * x))), 1, 255);
  });
}

export const CURVE_PRESETS = [
  { name: 'Straight (no curve)', shape: 0 },
  { name: 'Soft centre', shape: 35 },
  { name: 'Softer centre', shape: 60 },
  { name: 'Softest centre', shape: 85 },
  { name: 'Sharp centre', shape: -40 },
];

/** Output (0–1) for an input (0–1) under the given points. */
export function curveOutput(points: number[], x: number): number {
  const at = x * CURVE_POINTS - 1;                           // position among the points; the first sits at 10 %
  const i = clamp(Math.floor(at), 0, CURVE_POINTS - 2), t = clamp(at - i, 0, 1);
  const gain = at <= 0 ? points[0] : points[i] + (points[i + 1] - points[i]) * t;
  return clamp((x * gain) / 128, 0, 1);
}

export interface CurveState {
  on: boolean;
  points: number[];
  /** The shape these points are, if they are one of ours; null for anything else (a curve set by hand or by VKB). */
  shape: number | null;
}

export function curveState(block: Uint8Array, n: number): CurveState {
  const on = !!readField(block, physicalAxisBase(n), EQ);
  const points = [...block.subarray(curveBase(n), curveBase(n) + CURVE_POINTS)];
  if (!on) return { on, points, shape: 0 };
  let shape: number | null = null;
  for (let s = -100; s <= 100 && shape === null; s++) if (s && curvePoints(s).every((v, i) => v === points[i])) shape = s;
  return { on, points, shape };
}

function enable(block: Uint8Array, n: number): void {
  writeField(block, physicalAxisBase(n), EQ, 1);
  block[curveNumberAt(n)] &= 0xf0;                           // use this axis's own curve
}

/** Give physical axis `n` a curve of the given shape. 0 switches the curve off and leaves its points alone. */
export function setCurveShape(block: Uint8Array, n: number, shape: number): void {
  if (shape === 0) { writeField(block, physicalAxisBase(n), EQ, 0); return; }
  enable(block, n);
  block.set(curvePoints(shape), curveBase(n));
}

/** Set one point by what it should do: at (i + 1) x 10 % of travel, give `output` (0–1 of full output). */
export function setCurvePoint(block: Uint8Array, n: number, i: number, output: number): void {
  enable(block, n);
  block[curveBase(n) + i] = clamp(Math.round((128 * output) / ((i + 1) / CURVE_POINTS)), 0, 255);
}
