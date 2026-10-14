// The stick, drawn: one line drawing for each of the four sticks, with the position of every control on it.
// The drawings and the positions are generated (see stickart.paths.ts); nothing here is placed by hand.
import type { ReactNode } from 'react';
import { OMNI_LEFT, OMNI_RIGHT, STANDARD_LEFT, STANDARD_RIGHT, Traced } from './stickart.paths';

export type Hand = 'left' | 'right';
export type Mount = 'standard' | 'omni';

const DRAWN: Record<Mount, Record<Hand, Traced>> = {
  standard: { left: STANDARD_LEFT, right: STANDARD_RIGHT },
  omni: { left: OMNI_LEFT, right: OMNI_RIGHT },
};

/** The drawing's size; its coordinates run from 0,0 to this. */
export const artSize = (hand: Hand, mount: Mount) => ({ w: DRAWN[mount][hand].box[2], h: DRAWN[mount][hand].box[3] });

/** Position of a control in its drawing's coordinates. */
export function spot(id: string, hand: Hand, mount: Mount): [number, number] {
  const art = DRAWN[mount][hand], edge = 8;
  // a chart's leader can stop just short of the stick (the side button's does); keep the marker on the drawing
  const within = (v: number, size: number) => Math.max(edge, Math.min(size - edge, v));
  return [within(art.spots[id][0] - art.box[0], art.box[2]), within(art.spots[id][1] - art.box[1], art.box[3])];
}

/** The drawing, in its own coordinates (see `artSize`). `children` are drawn on top. */
export function StickArt({ hand, mount, children }: { hand: Hand; mount: Mount; children?: ReactNode }) {
  const art = DRAWN[mount][hand];
  return (
    <g className="stickart">
      <g transform={`translate(${-art.box[0]} ${-art.box[1]})`}>
        {/* drawn like a cockpit hologram: a glowing outline, a body of scan lines, the detail in a dimmer line */}
        <defs>
          <pattern id="stick-scan" width="8" height="5" patternUnits="userSpaceOnUse">
            <rect width="8" height="1.6" />
          </pattern>
        </defs>
        <path className="body" d={art.body} />
        <path className="scan" d={art.body} fill="url(#stick-scan)" />
        {art.reds.map((d) => <path key={d.length} className="red" d={d} />)}
        <path className="lines" d={art.lines} />
        <path className="outline" d={art.body} />
      </g>
      {children}
    </g>
  );
}
