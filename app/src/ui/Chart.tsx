import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '../App';
import { GroupDef, Layer, RowDef, SCG_AXES, SCG_CHART, freeLine, lineOf, roleOf, rowSends, setLayered, setRole, shiftsInUse } from '../core/chart';
import { stickModel } from '../core/identity';
import { HID_USAGES, LOGICAL_AXIS, LogicalChoice, logicalAxisBase, logicalEntry, logicalFunction, physicalEntry, physicalFunction, readField, setLogical } from '../core/schema';
import type { Session } from '../session';
import { CurveEditor } from './CurveEditor';
import { Field } from './Field';
import type { LiveState } from './Live';
import { Hand, Mount, StickArt, artSize, spot } from './StickArt';

// Everything is laid out in one coordinate system so the picture, the boxes and the lines between them scale together.
const VIEW = { w: 1280, h: 792 };
/** The box the drawing is fitted into. */
const DRAW = { x: 384, y: 6, w: 512, h: 650 };
const COL = { left: 16, right: 912, w: 352, title: 24, row: 22, gap: 8, top: 6 };

type Selection = { kind: 'row'; key: string } | { kind: 'axis'; slot: number } | null;
interface Placed { group: GroupDef; side: 'left' | 'right'; y: number; hot: [number, number] }

const LAYERS = ['Normal', 'SHIFT1 held', 'SHIFT2 held'];

export function Chart({ session, ed, live }: { session: Session; ed: Editor; live: LiveState | null }) {
  const [sel, setSel] = useState<Selection>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>(0);
  const [follow, setFollow] = useState(true);

  // ?look=left-omni forces a variant, for looking at the drawings without owning all four sticks
  const look = new URLSearchParams(location.search).get('look');
  const model = stickModel(ed.original, session.productId);
  const hand: Hand = look?.includes('left') ? 'left' : look?.includes('right') ? 'right' : model.hand ?? 'right';
  const mount: Mount = look?.includes('omni') ? 'omni' : look?.includes('standard') ? 'standard' : model.mount ?? 'standard';

  const art = artSize(hand, mount), scale = Math.min(DRAW.w / art.w, DRAW.h / art.h);
  const origin = [DRAW.x + (DRAW.w - art.w * scale) / 2, DRAW.y + (DRAW.h - art.h * scale) / 2];
  const at = (id: string): [number, number] => { const [x, y] = spot(id, hand, mount); return [origin[0] + scale * x, origin[1] + scale * y]; };
  const placed = useMemo(() => {
    // Each box goes on the side of the picture its control is on, and boxes run top to bottom in the order their
    // controls do, so the lines between them cross as little as possible.
    const height = (rows: number) => COL.title + rows * COL.row + COL.gap;
    const middle = origin[0] + (art.w * scale) / 2, room = VIEW.h - COL.top;
    const all = [...SCG_CHART.inner, ...SCG_CHART.outer].map((group) => ({ group, hot: at(group.id), h: height(group.rows.length) }));
    const cols = { left: all.filter((g) => g.hot[0] < middle), right: all.filter((g) => g.hot[0] >= middle) };
    const tall = (side: 'left' | 'right') => cols[side].reduce((n, g) => n + g.h, 0);
    for (const [from, to] of [['left', 'right'], ['right', 'left']] as const)
      while (tall(from) > room && cols[from].length > 1) {                    // too many on one side: hand over the most central
        const g = cols[from].reduce((a, b) => (Math.abs(a.hot[0] - middle) < Math.abs(b.hot[0] - middle) ? a : b));
        cols[from] = cols[from].filter((x) => x !== g); cols[to].push(g);
      }
    const out: Placed[] = [];
    const ends = { left: COL.top, right: COL.top };
    for (const side of ['left', 'right'] as const)
      for (const g of cols[side].sort((a, b) => a.hot[1] - b.hot[1])) { out.push({ group: g.group, side, y: ends[side], hot: g.hot }); ends[side] += g.h; }
    const axesSide: 'left' | 'right' = ends.left <= ends.right ? 'left' : 'right';
    return { groups: out, axesY: ends[axesSide], axesSide };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand, mount]);

  const line = (key: string) => lineOf(ed.controls, key);
  const shifts = shiftsInUse(ed.block);
  useEffect(() => { if ((layer === 1 && !shifts.shift1) || (layer === 2 && !shifts.shift2)) setLayer(0); }, [layer, shifts.shift1, shifts.shift2]);

  // "press it to select it": a control that has just closed becomes the selection
  const before = useRef<Set<number>>(new Set());
  const primed = useRef(false);
  useEffect(() => {
    if (!live) return;
    // not on the first report: whatever is closed when we start watching (the dial rests on a contact) is not a press
    if (follow && primed.current) {
      const fresh = [...live.lines].find((l) => !before.current.has(l) && ed.controls.has(l));
      if (fresh !== undefined) setSel({ kind: 'row', key: ed.controls.get(fresh)!.key });
    }
    before.current = live.lines; primed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.lines, follow]);

  const changed = (l: number) => [physicalEntry(l - 1), physicalEntry(l - 1) + 1, logicalEntry(l - 1), logicalEntry(l - 1) + 1].some((o) => ed.block[o] !== ed.original[o]);
  const x0 = (side: 'left' | 'right') => (side === 'left' ? COL.left : COL.right);
  const edge = (side: 'left' | 'right') => (side === 'left' ? COL.left + COL.w : COL.right);

  const f = (k: string) => LOGICAL_AXIS.find((d) => d.key === k)!;
  const picked = sel?.kind === 'row' ? placed.groups.find((p) => p.group.rows.some((r) => r.key === sel.key)) : undefined;

  return (
    <div className="chartwrap">
      <div className="charttools">
        <span className="seg">
          {LAYERS.map((name, i) => (
            <button key={name} className={layer === i ? 'on' : ''} disabled={(i === 1 && !shifts.shift1) || (i === 2 && !shifts.shift2)}
              title={i && !(i === 1 ? shifts.shift1 : shifts.shift2) ? 'No control is set up as this shift key yet. Select a button and make it one.' : ''}
              onClick={() => setLayer(i as Layer)}>{name}</button>
          ))}
        </span>
        {live && <label className="toggle"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Select what I press</label>}
        <span className="dim">{hand === 'left' ? 'Left-hand' : 'Right-hand'} stick{mount === 'omni' ? ' on an Omni Throttle adapter' : ''}.
          {!live && session.source === 'device' ? ' Waiting for the stick’s reports…' : ''}</span>
      </div>
      <div className="chart">
        <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label="The stick and what each of its controls sends">
          <g transform={`translate(${origin[0]} ${origin[1]}) scale(${scale})`}>
            <StickArt hand={hand} mount={mount} />
          </g>
          {/* leader lines run over the drawing, as on a paper chart */}
          {placed.groups.map(({ group, side, y, hot }) => {
            const lit = group.rows.some((r) => live?.lines.has(line(r.key) ?? -1));
            return <path key={group.id} className={`leader ${hover === group.id || picked?.group.id === group.id ? 'on' : ''} ${lit ? 'live' : ''}`}
              d={`M${edge(side)},${y + COL.title / 2} L${hot[0]},${hot[1]}`} />;
          })}
          {placed.groups.map(({ group, hot }) => {
            const lit = group.rows.some((r) => live?.lines.has(line(r.key) ?? -1));
            return <circle key={group.id} className={`spot ${lit ? 'live' : ''} ${hover === group.id || picked?.group.id === group.id ? 'on' : ''}`} cx={hot[0]} cy={hot[1]} r={6}
              onMouseEnter={() => setHover(group.id)} onMouseLeave={() => setHover(null)} onClick={() => setSel({ kind: 'row', key: group.rows[0].key })} />;
          })}
          {placed.groups.map(({ group, side, y }) => (
            <g key={group.id} className="box" onMouseEnter={() => setHover(group.id)} onMouseLeave={() => setHover(null)}>
              <rect className="title" x={x0(side)} y={y} width={COL.w} height={COL.title} />
              <text className="title" x={x0(side) + COL.w / 2} y={y + 16} textAnchor="middle">{group.title}</text>
              {group.rows.map((row, i) => renderRow(row, x0(side), y + COL.title + i * COL.row))}
            </g>
          ))}
          <g className="box">
            <rect className="title" x={x0(placed.axesSide)} y={placed.axesY} width={COL.w} height={COL.title} />
            <text className="title" x={x0(placed.axesSide) + COL.w / 2} y={placed.axesY + 16} textAnchor="middle">Axes</text>
            {SCG_AXES.map((a, i) => {
              const base = logicalAxisBase(a.slot), on = !!readField(ed.block, base, f('en'));
              const max = (1 << readField(ed.original, base, f('prec'))) - 1 || 4095;
              const v = live?.axes[a.slot] ?? 0, x = x0(placed.axesSide), y = placed.axesY + COL.title + i * COL.row;
              const dirty = [...Array(8).keys()].some((o) => ed.block[base + o] !== ed.original[base + o]);
              return (
                <g key={a.slot} className={`row axis ${on ? '' : 'off'} ${sel?.kind === 'axis' && sel.slot === a.slot ? 'sel' : ''}`} onClick={() => setSel({ kind: 'axis', slot: a.slot })}>
                  <rect x={x} y={y} width={COL.w} height={COL.row - 2} />
                  <text className="name" x={x + 10} y={y + 14.5}>{a.label}</text>
                  <rect className="track" x={x + 128} y={y + 5} width={150} height={10} />
                  {live && on && <rect className="fill" x={x + 128} y={y + 5} width={Math.min(150, (v / max) * 150)} height={10} />}
                  <text className="value" x={x + COL.w - 10} y={y + 14.5} textAnchor="end">{live && on ? v : on ? HID_USAGES[readField(ed.block, base, f('usage'))] : 'off'}</text>
                  {dirty && <circle className="dirty" cx={x + COL.w - 62} cy={y + 10} r={3.5} />}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="inspector">
          {sel?.kind === 'row' && picked && rowPanel()}
          {sel?.kind === 'axis' && axisPanel(sel.slot)}
          {!sel && (
            <p className="dim">{live ? 'Press a control on the stick, or click one here, to see what it sends and change it.'
              : 'Click a control to see what it sends and change it.'}</p>
          )}
        </div>
      </div>
    </div>
  );

  // These three are plain functions, not components: defined in here they would be a new component type on every
  // render, and the inputs inside would lose focus at each keystroke.
  function renderRow(row: RowDef, x: number, y: number) {
    const l = line(row.key);
    if (l === null) return null;
    const sends = rowSends(ed.block, l, layer);
    const same = layer !== 0 && sends.via === l && roleOf(ed.block, l) === 'button';
    const cls = `row ${live?.lines.has(l) ? 'live' : ''} ${sel?.kind === 'row' && sel.key === row.key ? 'sel' : ''} ${same ? 'same' : ''}`;
    return (
      <g key={row.key} className={cls} onClick={() => setSel({ kind: 'row', key: row.key })}>
        <rect x={x} y={y} width={COL.w} height={COL.row - 2} />
        <Glyph kind={row.glyph} x={x + 17} y={y + 10} />
        <text className="name" x={x + 40} y={y + 14.5}>{sends.text}</text>
        {changed(l) && <circle className="dirty" cx={x + COL.w - 12} cy={y + 10} r={3.5} />}
      </g>
    );
  }

  function rowPanel() {
    if (sel?.kind !== 'row' || !picked) return null;
    const row = picked.group.rows.find((r) => r.key === sel.key)!;
    const l = line(row.key)!;
    const role = roleOf(ed.block, l), sends = rowSends(ed.block, l, layer), p = physicalFunction(ed.block, l - 1);
    const out = logicalFunction(ed.block, sends.via - 1);
    const moved = layer !== 0 && sends.via !== l;
    const canSet = sends.simple && (layer === 0 || moved);
    const wired = (n: number) => ed.controls.has(n);
    return (
      <>
        <h3>{picked.group.title} <span>{row.label}</span>
          <em className={`pill ${live?.lines.has(l) ? 'ok' : ''}`}>{live?.lines.has(l) ? 'pressed' : `line ${l}`}</em></h3>
        {layer === 0 && role !== 'other' && (
          <label className="ifield"><span>This control is</span>
            <select value={role} onChange={(e) => ed.edit((b) => setRole(b, ed.original, l, e.target.value as 'button' | 'shift1' | 'shift2'))}>
              <option value="button">a button</option>
              <option value="shift1">the SHIFT1 key</option>
              <option value="shift2">the SHIFT2 key</option>
            </select></label>
        )}
        {role === 'other' && <p className="dim">{p.kind}{p.detail ? `: ${p.detail}` : ''}. This kind of control is edited under the hood for now.</p>}
        {role !== 'button' && role !== 'other' && (
          <p className="dim">While it is held, every button can send something else: switch to the “{LAYERS[role === 'shift1' ? 1 : 2]}” layer above to set that up. It sends nothing itself.</p>
        )}
        {role === 'button' && layer !== 0 && !moved && (
          <>
            <p className="dim">With {LAYERS[layer].replace(' held', '')} held this sends the same as normal: <b>{sends.text}</b>.</p>
            <button className="btn" onClick={() => ed.edit((b) => {
              const spare = freeLine(b, wired);
              if (spare) { setLayered(b, l, layer as 1 | 2, spare); setLogical(b, spare - 1, 'auto'); }
            })}>Send something else on this layer</button>
          </>
        )}
        {role === 'button' && canSet && (
          <label className="ifield"><span>{layer ? `With ${LAYERS[layer].replace(' held', '')} it sends` : 'It sends'}</span>
            <span className="sends">
              <select value={out.auto ? 'auto' : out.kind === 'Button' ? 'button' : 'none'}
                onChange={(e) => ed.edit((b) => setLogical(b, sends.via - 1, e.target.value as LogicalChoice, out.button ?? sends.via))}>
                <option value="button">button</option>
                {!moved && <option value="auto">button {sends.via} (its line number)</option>}
                <option value="none">nothing</option>
              </select>
              {out.kind !== 'No function' && <input type="number" min={1} max={127} disabled={out.auto && !moved} value={out.button ?? ''}
                onChange={(e) => e.target.value !== '' && ed.edit((b) => setLogical(b, sends.via - 1, 'button', Math.max(1, Math.min(127, +e.target.value))))} />}
            </span></label>
        )}
        {role === 'button' && !sends.simple && <p className="dim">Sends <b>{sends.text}</b>. Outputs other than joystick buttons are edited under the hood for now.</p>}
        {moved && <button className="btn ghost" onClick={() => ed.edit((b) => setLayered(b, l, layer as 1 | 2, null))}>Same as normal again</button>}
        {changed(l) && layer === 0 && (
          <button className="btn ghost" onClick={() => ed.edit((b) => { for (const o of [physicalEntry(l - 1), logicalEntry(l - 1)]) b.set(ed.original.subarray(o, o + 2), o); })}>Undo changes to this control</button>
        )}
      </>
    );
  }

  function axisPanel(slot: number) {
    const base = logicalAxisBase(slot), on = !!readField(ed.block, base, f('en'));
    const sensor = Math.min(7, readField(ed.block, base, f('src')) - 1);
    const max = (1 << readField(ed.original, base, f('prec'))) - 1 || 4095;
    const v = live?.axes[slot];
    return (
      <>
        <h3>{SCG_AXES.find((a) => a.slot === slot)?.label} <span>{HID_USAGES[readField(ed.block, base, f('usage'))]} to the PC</span>
          {v !== undefined && on && <em className="pill">{Math.round((v / max) * 100)} %</em>}</h3>
        <div className="icols">
          <div>
            {['en', 'inv', 'dzlo', 'dzhi', 'rel'].map((k) => <Field key={k} ed={ed} base={base} def={f(k)} />)}
            <p className="dim small">The bar is the raw number the PC receives, not “how far forward”: by joystick
              convention Y counts down as the stick goes forward. Inverted flips it for games too.</p>
          </div>
          <CurveEditor ed={ed} n={sensor} />
        </div>
      </>
    );
  }
}


/** The mark at the start of a row. Drawn rather than typed: arrow and dot characters are missing from too many fonts. */
function Glyph({ kind, x, y }: { kind: string; x: number; y: number }) {
  const tri = (a: number) => <path className="glyph" d="M0,-5 L5,4 L-5,4 Z" transform={`translate(${x} ${y}) rotate(${a})`} />;
  if (kind === 'up') return tri(0);
  if (kind === 'right') return tri(90);
  if (kind === 'down') return tri(180);
  if (kind === 'left') return tri(270);
  if (kind === 'dot') return <circle className="glyph" cx={x} cy={y} r={4} />;
  if (kind === 'push') return <><circle className="glyph ring" cx={x} cy={y} r={5} /><circle className="glyph" cx={x} cy={y} r={2} /></>;
  if (kind === 'click') return <><circle className="glyph ring" cx={x} cy={y} r={5.5} /><circle className="glyph ring" cx={x} cy={y} r={2.5} /></>;
  return <text className="glyph" x={x} y={y + 4.5} textAnchor="middle">{kind}</text>;
}
