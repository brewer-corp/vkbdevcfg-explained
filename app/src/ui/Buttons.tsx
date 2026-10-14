import { useState } from 'react';
import type { Editor } from '../App';
import { LINES, LogicalChoice, logicalEntry, logicalFunction, physicalEntry, physicalFunction, setLogical } from '../core/schema';
import { hex } from '../core/bytes';
import type { LiveState } from './Live';

export function Buttons({ ed, live }: { ed: Editor; live: LiveState | null }) {
  const [all, setAll] = useState(false);
  // The entry encoding (line -> joystick button) was confirmed on hardware; which physical control
  // is wired to which line was not, so the live highlight is the way to find a line.
  const rows = [];
  let skip: boolean = false;
  for (let line = 0; line < LINES; line++) {
    const p = physicalFunction(ed.block, line);
    const l = logicalFunction(ed.block, line);
    const pe = physicalEntry(line), le = logicalEntry(line);
    const unused = ed.block[pe] === 0xff && ed.block[pe + 1] === 0xff && l.auto;
    const continuation: boolean = skip;
    skip = !continuation && p.wide;
    const control = ed.controls.get(line + 1);
    if (unused && !control && !all) continue;
    const changed = [pe, pe + 1, le, le + 1].some((o) => ed.block[o] !== ed.original[o]);
    rows.push(
      <tr key={line} className={`${changed ? 'changed' : ''} ${unused ? 'unused' : ''} ${live?.lines.has(line + 1) ? 'pressed' : ''}`}>
        <td className="num">{line + 1}</td>
        <td>{control ? <>{control.name} <span className="dim">{control.owner}</span></> : <span className="dim">—</span>}</td>
        <td>{continuation ? <span className="dim">↳ part of line {line}</span> : <b>{p.kind}</b>}</td>
        <td className="dim">{continuation ? '' : p.detail}</td>
        <td>
          {l.kind === 'Button' || l.kind === 'Auto' || l.kind === 'No function'
            ? <span className="sends">
                <select value={l.auto ? 'auto' : l.kind === 'Button' ? 'button' : 'none'}
                  onChange={(e) => ed.edit((b) => setLogical(b, line, e.target.value as LogicalChoice, l.button ?? line + 1))}>
                  <option value="button">button</option>
                  <option value="auto">same as line</option>
                  <option value="none">nothing</option>
                </select>
                {l.kind !== 'No function' && <input type="number" min={1} max={127} disabled={l.auto} value={l.button ?? ''}
                  onChange={(e) => e.target.value !== '' && ed.edit((b) => setLogical(b, line, 'button', Math.max(1, Math.min(127, +e.target.value))))} />}
                {l.detail && <span className="dim"> {l.detail}</span>}
              </span>
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
        something it sends to the PC. Here you can change which joystick button a line sends;
        left alone, a line sends the button with its own number.
      </p>
      <label className="toggle"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all 128 lines</label>
      {ed.controls.size > 0 && <p className="note">Control names are VKB’s, taken from the diagram in their own tool. They match this stick’s
        factory setup but have not been checked by pressing each control — the live highlight is the test.</p>}
      {live && <p className="note ok">Live: press a control on the stick and its line lights up here, whatever it is set to do.</p>}
      <table className="lines">
        <thead><tr><th>Line</th><th>Control</th><th>It is a</th><th></th><th>Sends</th><th>Raw (job · output)</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </>
  );
}
