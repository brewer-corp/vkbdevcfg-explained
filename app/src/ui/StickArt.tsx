// A line drawing of a Gladiator EVO with an SCG grip. Our own artwork: traced loosely over product photographs for
// proportion, as a left-hand stick on an Omni Throttle adapter. The other three variants come from that one drawing:
// a standard stick stands the same grip upright on the shaft, and a right-hand stick is the mirror image.
import type { ReactNode } from 'react';

export type Hand = 'left' | 'right';
export type Mount = 'standard' | 'omni';

export const ART = { w: 900, h: 1100 };

/** Where the grip meets what carries it, in the drawing as traced (Omni, left hand). */
const JOINT: [number, number] = [330, 440];
/** The standard pose: turn the grip upright about that joint, then set the joint on top of the shaft. */
const UPRIGHT = { turn: -62, at: [432, 600] as [number, number] };

/** Where each control sits, in the traced pose. `grip` parts move with the grip. */
const SPOTS: Record<string, { at: [number, number]; grip: boolean }> = {
  a4: { at: [640, 128], grip: true }, a3: { at: [580, 230], grip: true }, a1: { at: [652, 256], grip: true },
  a2: { at: [598, 320], grip: true }, b1: { at: [752, 152], grip: true }, c1: { at: [445, 375], grip: true },
  d1: { at: [505, 418], grip: true }, trigger: { at: [702, 398], grip: true }, rapid: { at: [758, 374], grip: true },
  f: { at: [232, 737], grip: false }, sw1: { at: [112, 812], grip: false }, en: { at: [205, 872], grip: false },
  throttle: { at: [158, 838], grip: false }, stick: { at: [432, 668], grip: false },
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Position of a control in the drawing's own coordinates, for the given variant. */
export function spot(id: string, hand: Hand, mount: Mount): [number, number] {
  const s = SPOTS[id];
  let [x, y] = s.at;
  if (s.grip && mount === 'standard') {
    const dx = x - JOINT[0], dy = y - JOINT[1], c = Math.cos(rad(UPRIGHT.turn)), sn = Math.sin(rad(UPRIGHT.turn));
    x = UPRIGHT.at[0] + dx * c - dy * sn; y = UPRIGHT.at[1] + dx * sn + dy * c;
  }
  return [hand === 'right' ? ART.w - x : x, y];
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

const GRIP = smooth([[232, 400], [226, 345], [258, 296], [300, 272], [345, 288], [410, 262], [490, 215], [560, 198], [598, 160], [612, 100],
  [648, 72], [702, 78], [748, 118], [788, 196], [806, 278], [792, 338], [745, 372], [690, 380], [628, 366], [585, 352], [520, 352], [480, 372],
  [470, 420], [430, 446], [330, 458], [258, 440]]);
const FACE = smooth([[608, 112], [650, 90], [700, 98], [738, 142], [766, 212], [768, 288], [736, 338], [682, 354], [622, 344], [588, 300], [562, 246], [584, 172]]);
const REST = smooth([[236, 396], [232, 348], [260, 302], [300, 280], [322, 304], [288, 334], [270, 392]]);

function Hat({ id, r, kind }: { id: string; r: number; kind: 'knurl' | 'castle' | 'stick' | 'thumb' }) {
  const [x, y] = SPOTS[id].at;
  return (
    <g className={`part hat ${kind}`}>
      <circle cx={x} cy={y} r={r} />
      {kind === 'castle' && <path d={`M${x - r * 0.62},${y} H${x + r * 0.62} M${x},${y - r * 0.62} V${y + r * 0.62}`} />}
      {kind !== 'castle' && <circle cx={x} cy={y} r={r * 0.55} className="inner" />}
      {kind === 'thumb' && [...Array(5).keys()].map((i) => <path key={i} d={`M${x - r * 0.7 + i * r * 0.35},${y - r * 0.6} v${r * 1.2}`} className="ridge" />)}
    </g>
  );
}

function Grip() {
  return (
    <g className="grip">
      {/* triggers hang below the head, behind it */}
      <path className="part" d="M664,372 q30,62 74,30 l10,-34 z" />
      <path className="part" d="M742,370 q26,-4 34,-26 l10,22 q-10,28 -40,26 z" />
      <path className="body" d={GRIP} />
      <path className="detail" d={FACE} />
      <path className="detail" d={REST} />
      {[0, 1, 2, 3, 4].map((i) => <path key={i} className="ridge" d={`M${246 + i * 12},${352 - i * 9} l22,34`} />)}
      <path className="detail" d="M470,300 q70,-40 120,-52" />
      <Hat id="a4" r={27} kind="knurl" />
      <Hat id="a3" r={28} kind="castle" />
      <Hat id="a1" r={27} kind="stick" />
      <Hat id="c1" r={31} kind="thumb" />
      <circle className="part red" cx={SPOTS.a2.at[0]} cy={SPOTS.a2.at[1]} r={21} />
      <rect className="part" x={SPOTS.b1.at[0] - 8} y={SPOTS.b1.at[1] - 22} width={16} height={44} rx={7} transform={`rotate(24 ${SPOTS.b1.at[0]} ${SPOTS.b1.at[1]})`} />
      <rect className="part" x={SPOTS.d1.at[0] - 20} y={SPOTS.d1.at[1] - 9} width={40} height={18} rx={8} transform={`rotate(-8 ${SPOTS.d1.at[0]} ${SPOTS.d1.at[1]})`} />
    </g>
  );
}

function Base({ shaftTop }: { shaftTop: number }) {
  const wheel = (id: string) => {
    const [x, y] = SPOTS[id].at;
    return (
      <g className="part" transform={`rotate(-22 ${x} ${y})`}>
        <ellipse cx={x} cy={y} rx={15} ry={40} />
        {[-24, -12, 0, 12, 24].map((o) => <path key={o} className="ridge" d={`M${x - 13},${y + o} h26`} />)}
      </g>
    );
  };
  return (
    <g className="base">
      <path className="plate" d="M40,850 L250,1040 L845,870 L640,720 Z" />
      {[[66, 858], [246, 1016], [806, 874]].map(([x, y]) => <circle key={x} className="hole" cx={x} cy={y} r={7} />)}
      <path className="body" d="M95,788 L160,702 L300,660 L540,640 L610,655 L640,770 L665,940 L330,1020 L95,862 Z" />
      <path className="detail" d="M160,702 L330,792 L640,770 M330,792 V1020" />
      <path className="detail" d="M440,838 L612,818 L616,852 L444,874 Z" />
      {[...Array(9).keys()].map((i) => <path key={i} className="ridge" d={`M${452 + i * 19},${898 - i * 2.4} v52`} />)}
      {[[187, 712], [232, 737], [277, 770]].map(([x, y]) => <rect key={x} className="part" x={x - 18} y={y - 11} width={36} height={22} rx={4} transform={`rotate(27 ${x} ${y})`} />)}
      {wheel('sw1')}{wheel('throttle')}{wheel('en')}
      <ellipse className="detail" cx={432} cy={694} rx={66} ry={27} />
      <rect className="shaft" x={413} y={shaftTop} width={38} height={694 - shaftTop} />
    </g>
  );
}

/** The drawing, inside a `<g>` in its own 900 × 1100 coordinates. `children` are drawn on top, unmirrored. */
export function StickArt({ hand, mount, children }: { hand: Hand; mount: Mount; children?: ReactNode }) {
  const upright = mount === 'standard';
  return (
    <g className="stickart">
      <g transform={hand === 'right' ? `translate(${ART.w} 0) scale(-1 1)` : undefined}>
        <Base shaftTop={upright ? UPRIGHT.at[1] - 6 : 612} />
        {!upright && (
          <>
            <path className="arm-edge" d="M432,618 C506,566 498,492 420,470 C384,460 356,456 336,448" />
            <path className="arm" d="M432,618 C506,566 498,492 420,470 C384,460 356,456 336,448" />
          </>
        )}
        <g transform={upright ? `translate(${UPRIGHT.at[0] - JOINT[0]} ${UPRIGHT.at[1] - JOINT[1]}) rotate(${UPRIGHT.turn} ${JOINT[0]} ${JOINT[1]})` : undefined}>
          <Grip />
        </g>
      </g>
      {children}
    </g>
  );
}
