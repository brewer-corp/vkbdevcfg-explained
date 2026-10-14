// The stick, drawn. Each of the two drawings was made by program from a product photograph (see stickart.paths.ts);
// the positions of the controls were measured on the same photographs. A right-hand Omni stick and a left-hand
// standard one are the mirror images of the two that were photographed.
import type { ReactNode } from 'react';
import { OMNI, STANDARD, Traced } from './stickart.paths';

export type Hand = 'left' | 'right';
export type Mount = 'standard' | 'omni';

const DRAWN: Record<Mount, { art: Traced; hand: Hand; spots: Record<string, [number, number]> }> = {
  standard: {
    art: STANDARD, hand: 'right',
    spots: {
      a1: [262, 48], a4: [305, 55], a3: [276, 88], a2: [247, 91], b1: [384, 98], rapid: [331, 158], trigger: [359, 131],
      c1: [213, 172], d1: [224, 198], f: [145, 404], sw1: [78, 450], throttle: [108, 466], en: [143, 478], stick: [240, 372],
    },
  },
  omni: {
    art: OMNI, hand: 'left',
    spots: {
      a4: [815, 205], a3: [767, 294], a1: [824, 320], a2: [771, 382], b1: [912, 213], rapid: [918, 434], trigger: [870, 436],
      c1: [624, 443], d1: [629, 488], f: [417, 785], sw1: [310, 844], throttle: [353, 882], en: [398, 922], stick: [614, 732],
    },
  },
};

/** The drawing's size; its coordinates run from 0,0 to this. */
export const artSize = (mount: Mount) => ({ w: DRAWN[mount].art.box[2], h: DRAWN[mount].art.box[3] });

/** Position of a control in the drawing's coordinates, for the given variant. */
export function spot(id: string, hand: Hand, mount: Mount): [number, number] {
  const { art, spots, hand: drawn } = DRAWN[mount];
  const x = spots[id][0] - art.box[0], y = spots[id][1] - art.box[1];
  return [hand === drawn ? x : art.box[2] - x, y];
}

/** The drawing, in its own coordinates (see `artSize`). `children` are drawn on top, unmirrored. */
export function StickArt({ hand, mount, children }: { hand: Hand; mount: Mount; children?: ReactNode }) {
  const { art, hand: drawn } = DRAWN[mount];
  const [x, y, w] = art.box;
  return (
    <g className="stickart">
      <g transform={`${hand === drawn ? '' : `translate(${w} 0) scale(-1 1) `}translate(${-x} ${-y})`}>
        <path className="body" d={art.body} />
        {art.reds.map((d) => <path key={d.length} className="red" d={d} />)}
        <path className="lines" d={art.lines} />
      </g>
      {children}
    </g>
  );
}
