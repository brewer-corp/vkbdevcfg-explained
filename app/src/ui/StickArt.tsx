// The stick, drawn. Each of the two drawings is an outline traced from a product photograph (see stickart.paths.ts)
// with the controls and a few edges added by hand at positions measured on the same photograph. A right-hand Omni
// stick and a left-hand standard one are the mirror images of the two that were traced.
import type { ReactNode } from 'react';
import { OMNI, STANDARD } from './stickart.paths';

export type Hand = 'left' | 'right';
export type Mount = 'standard' | 'omni';

/** Where each control is, in its drawing's own coordinates. */
const SPOTS: Record<Mount, Record<string, [number, number]>> = {
  standard: {
    a1: [262, 48], a4: [305, 55], a3: [276, 88], a2: [247, 91], b1: [384, 98], rapid: [338, 146], trigger: [359, 131],
    c1: [213, 172], d1: [224, 198], f: [145, 404], sw1: [78, 450], throttle: [108, 466], en: [143, 478], stick: [240, 372],
  },
  omni: {
    a4: [872, 186], a3: [805, 312], a1: [885, 348], a2: [810, 435], b1: [1008, 198], rapid: [1017, 508], trigger: [949, 510],
    c1: [605, 520], d1: [612, 584], f: [314, 1000], sw1: [164, 1083], throttle: [224, 1135], en: [288, 1192], stick: [590, 925],
  },
};
const DRAWN: Record<Mount, { w: number; h: number; hand: Hand }> = {
  standard: { w: STANDARD.w, h: STANDARD.h, hand: 'right' },
  omni: { w: OMNI.w, h: OMNI.h, hand: 'left' },
};

export const artSize = (mount: Mount) => ({ w: DRAWN[mount].w, h: DRAWN[mount].h });

/** Position of a control in the drawing's coordinates, for the given variant. */
export function spot(id: string, hand: Hand, mount: Mount): [number, number] {
  const [x, y] = SPOTS[mount][id];
  return [hand === DRAWN[mount].hand ? x : DRAWN[mount].w - x, y];
}

/** A closed curve through the given points (Catmull-Rom, as cubic Béziers). */
function smooth(points: number[][]): string {
  const n = points.length, p = (i: number) => points[(i + n) % n];
  let d = `M${p(0)[0]},${p(0)[1]}`;
  for (let i = 0; i < n; i++) {
    const [a, b, c, e] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    d += ` C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6},${c[1] - (e[1] - b[1]) / 6} ${c[0]},${c[1]}`;
  }
  return d + 'Z';
}

// Small parts, sized by `u`: one unit is a pixel of the standard drawing, so both drawings share the same shapes.
function Hat({ at, u, kind, rx = 13, ry = 13, turn = 0 }: { at: [number, number]; u: number; kind: 'knurl' | 'castle' | 'thumb'; rx?: number; ry?: number; turn?: number }) {
  const [x, y] = at;
  return (
    <g className={`part hat ${kind}`} transform={`rotate(${turn} ${x} ${y})`}>
      <ellipse cx={x} cy={y} rx={rx * u} ry={ry * u} />
      {kind === 'castle'
        ? <path d={`M${x - rx * u * 0.55},${y} H${x + rx * u * 0.55} M${x},${y - ry * u * 0.55} V${y + ry * u * 0.55}`} />
        : [-0.5, 0, 0.5].map((o) => <path key={o} className="ridge" d={`M${x - rx * u * 0.75},${y + o * ry * u} H${x + rx * u * 0.75}`} />)}
    </g>
  );
}
function Wheel({ at, u, rx, ry, turn }: { at: [number, number]; u: number; rx: number; ry: number; turn: number }) {
  const [x, y] = at;
  return (
    <g className="part" transform={`rotate(${turn} ${x} ${y})`}>
      <ellipse cx={x} cy={y} rx={rx * u} ry={ry * u} />
      {[-0.6, -0.3, 0, 0.3, 0.6].map((o) => <path key={o} className="ridge" d={`M${x - rx * u * 0.85},${y + o * ry * u} h${rx * u * 1.7}`} />)}
    </g>
  );
}
const Btn = ({ at, u, w, h, turn, r = 3 }: { at: number[]; u: number; w: number; h: number; turn: number; r?: number }) =>
  <rect className="part" x={at[0] - (w * u) / 2} y={at[1] - (h * u) / 2} width={w * u} height={h * u} rx={r * u} transform={`rotate(${turn} ${at[0]} ${at[1]})`} />;

function Standard() {
  const s = SPOTS.standard, u = 1;
  return (
    <>
      <path className="body" d={STANDARD.body} />
      {/* base: the deck the buttons sit on, the front corner, the name plate and its vents */}
      <path className="edge" d="M97,402 L216,443 L352,404 M216,443 L212,548 M97,402 Q104,384 128,376" />
      <path className="edge" d="M270,456 L346,430 L348,443 L272,469 Z" />
      {[...Array(10).keys()].map((i) => <path key={i} className="ridge" d={`M${277 + i * 7.6},${482 - i * 2.6} v25`} />)}
      {[[113, 392], [145, 404], [176, 424]].map((p) => <Btn key={p[0]} at={p} u={u} w={22} h={13} turn={18} />)}
      <Wheel at={s.sw1} u={u} rx={8} ry={19} turn={-16} />
      <Wheel at={s.throttle} u={u} rx={11} ry={24} turn={-14} />
      <Wheel at={s.en} u={u} rx={10} ry={22} turn={-14} />
      {/* grip: hand rest and clamp, the seam down its side, the recess the hats sit in */}
      <path className="edge" d="M205,206 Q199,270 196,330" />
      <path className="part rest" d={smooth([[236, 311], [262, 298], [292, 300], [297, 311], [274, 324], [242, 327]])} />
      <path className="edge" d="M254,330 L308,320 L312,340 L264,352 Z" />
      <path className="edge" d={smooth([[241, 40], [268, 23], [302, 18], [330, 30], [339, 62], [326, 96], [300, 113], [262, 119], [241, 106], [237, 70]])} />
      <Btn at={[359, 131]} u={u} w={18} h={28} turn={4} />
      {STANDARD.reds.map((d) => <path key={d.length} className="part red" d={d} />)}
      <Hat at={s.a1} u={u} kind="knurl" rx={12} ry={15} turn={-22} />
      <Hat at={s.a4} u={u} kind="knurl" rx={11} ry={14} turn={14} />
      <Hat at={s.a3} u={u} kind="castle" rx={13} ry={13} />
      <Btn at={s.b1} u={u} w={9} h={22} turn={8} r={4} />
      <Hat at={s.c1} u={u} kind="thumb" rx={9} ry={9} />
      <Btn at={s.d1} u={u} w={8} h={14} turn={10} r={4} />
    </>
  );
}

function Omni() {
  const s = SPOTS.omni, u = 2.7;
  return (
    <>
      <path className="body" d={OMNI.body} />
      <path className="edge" d="M192,987 L442,1115 L897,1038 M442,1115 L449,1397 M192,987 Q210,950 262,932" />
      <path className="edge" d="M600,1160 L833,1122 L836,1160 L603,1199 Z" />
      {[...Array(10).keys()].map((i) => <path key={i} className="ridge" d={`M${617 + i * 23.5},${1228 - i * 4.4} v72`} />)}
      {[[263, 970], [314, 1000], [369, 1045]].map((p) => <Btn key={p[0]} at={p} u={u} w={21} h={12.5} turn={26} />)}
      <Wheel at={s.sw1} u={u} rx={7.5} ry={18} turn={-24} />
      <Wheel at={s.throttle} u={u} rx={10} ry={21} turn={-22} />
      <Wheel at={s.en} u={u} rx={9} ry={20} turn={-22} />
      <path className="part rest" d={smooth([[362, 372], [412, 366], [462, 386], [452, 440], [404, 446], [372, 420]])} />
      <path className="edge" d="M470,470 Q610,395 770,352" />
      <path className="edge" d={smooth([[833, 126], [896, 102], [948, 132], [978, 206], [988, 300], [972, 386], [922, 440], [846, 478], [790, 440], [768, 340], [796, 236]])} />
      <Btn at={[949, 512]} u={u} w={20} h={12} turn={-8} />
      <Btn at={[1017, 510]} u={u} w={14} h={10} turn={-14} />
      {OMNI.reds.map((d) => <path key={d.length} className="part red" d={d} />)}
      <Hat at={s.a4} u={u} kind="knurl" rx={11} ry={14} turn={-18} />
      <Hat at={s.a3} u={u} kind="castle" rx={13} ry={13} />
      <Hat at={s.a1} u={u} kind="knurl" rx={12} ry={12} />
      <Btn at={s.b1} u={u} w={8} h={20} turn={24} r={4} />
      <Hat at={s.c1} u={u} kind="thumb" rx={14} ry={14} />
      <Btn at={s.d1} u={u} w={12} h={7} turn={-6} r={3} />
    </>
  );
}

/** The drawing, in its own coordinates (see `artSize`). `children` are drawn on top, unmirrored. */
export function StickArt({ hand, mount, children }: { hand: Hand; mount: Mount; children?: ReactNode }) {
  const mirrored = hand !== DRAWN[mount].hand;
  return (
    <g className="stickart">
      <g transform={mirrored ? `translate(${DRAWN[mount].w} 0) scale(-1 1)` : undefined}>
        {mount === 'standard' ? <Standard /> : <Omni />}
      </g>
      {children}
    </g>
  );
}
