import { useState } from 'react';
import type { Editor } from '../App';
import { LINES, logicalEntry, logicalFunction, physicalEntry, physicalFunction, setLogicalButton } from '../core/schema';
import { hex } from '../core/bytes';

export function Buttons({ ed }: { ed: Editor }) {
  const [all, setAll] = useState(false);
  const locked = !ed.canEdit('static');
  const rows = [];
  let skip: boolean = false;
  for (let line = 0; line < LINES; line++) {
    const p = physicalFunction(ed.block, line);
    const l = logicalFunction(ed.block, line);
    const pe = physicalEntry(line), le = logicalEntry(line);
    const unused = ed.block[pe] === 0xff && ed.block[pe + 1] === 0xff && ed.block[le] === 0xff;
    const continuation: boolean = skip;
    skip = !continuation && p.wide;
    if (unused && !all) continue;
    const changed = [pe, pe + 1, le, le + 1].some((o) => ed.block[o] !== ed.original[o]);
    rows.push(
      <tr key={line} className={`${changed ? 'changed' : ''} ${unused ? 'unused' : ''}`}>
        <td className="num">{line + 1}</td>
        <td>{continuation ? <span className="dim">↳ part of line {line}</span> : <b>{p.kind}</b>}</td>
        <td className="dim">{continuation ? '' : p.detail}</td>
        <td>
          {l.kind === 'Button' || l.kind === '—'
            ? <input type="number" min={1} max={127} placeholder="—" disabled={locked} value={l.button ?? ''}
                onChange={(e) => ed.edit((b) => setLogicalButton(b, line, e.target.value === '' ? null : Math.max(1, Math.min(127, +e.target.value))))} />
            : <span>{l.kind} <span className="dim">{l.detail}</span></span>}
        </td>
        <td className="mono dim">{hex(ed.block.subarray(pe, pe + 2))} · {hex(ed.block.subarray(le, le + 2))}</td>
      </tr>,
    );
  }
  return (
    <>
      <p className="intro">
        The stick has up to 128 wired <b>lines</b>. Each has a job (what kind of control it is) and
        something it sends to the PC. Here you can change which joystick button a line sends.
      </p>
      <label className="toggle"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all 128 lines</label>
      {locked && <p className="note">Button mappings come from static analysis and are locked. Turn on <b>Experimental fields</b> to edit them.</p>}
      <table className="lines">
        <thead><tr><th>Line</th><th>It is a</th><th></th><th>Sends button</th><th>Raw (job · output)</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </>
  );
}
