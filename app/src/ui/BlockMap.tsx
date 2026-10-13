import { useState } from 'react';
import type { Editor } from '../App';
import { REGIONS, regionOf } from '../core/schema';

/** The raw 4096 bytes, coloured by region, with changed bytes marked. */
export function BlockMap({ ed }: { ed: Editor }) {
  const [hover, setHover] = useState<number | null>(null);
  const region = hover === null ? null : regionOf(hover);
  const rows = [];
  for (let row = 0; row < ed.block.length; row += 32) {
    const cells = [];
    for (let i = row; i < row + 32; i++) {
      const r = regionOf(i);
      cells.push(
        <span key={i} className={`byte g-${r.group} ${ed.block[i] !== ed.original[i] ? 'chg' : ''} ${region === r ? 'hl' : ''}`}
          onMouseEnter={() => setHover(i)}>{ed.block[i].toString(16).padStart(2, '0')}</span>,
      );
    }
    rows.push(<div key={row} className="hexrow"><span className="off">{row.toString(16).padStart(3, '0')}</span>{cells}</div>);
  }
  return (
    <>
      <p className="intro">
        Everything on the other tabs is a view of these 4096 bytes. Colours show what each part is for;
        hover for detail. Bytes you have changed are outlined.
      </p>
      <div className="legend">
        {['header', 'options', 'axes', 'buttons', 'ext', 'leds', 'detents', 'unknown', 'unused'].map((g) => (
          <span key={g} className={`g-${g}`}>{{ ext: 'external devices', unknown: 'not decoded' }[g] ?? g}</span>
        ))}
      </div>
      <div className="where">
        {hover === null ? 'Hover a byte.' : <>
          <b>0x{hover.toString(16).padStart(3, '0')}</b> · {region!.name} <span className="dim">(0x{region!.start.toString(16)}–0x{region!.end.toString(16)})</span>
        </>}
      </div>
      <div className="hexdump" onMouseLeave={() => setHover(null)}>{rows}</div>
      <p className="dim">{REGIONS.length} regions. The first eight bytes belong to the stick: it keeps its own model ID and computes its own checksum, whatever is sent.</p>
    </>
  );
}
