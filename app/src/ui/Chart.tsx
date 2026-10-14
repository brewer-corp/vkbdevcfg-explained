import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '../App';
import { Choice, GroupDef, Layer, MINI_CLICK, MINI_STICK, MiniStick, RowDef, SCG_AXES, SCG_CHART, choiceOf, hatIncludes, lineOf, miniStick, miniStickWay, roleOf,
  rowSends, setButton, setChoice, setMiniStick, shiftsInUse } from '../core/chart';
import { stickModel } from '../core/identity';
import { HID_USAGES, LOGICAL_AXIS, logicalAxisBase, logicalEntry, logicalFunction, physicalEntry, physicalFunction, readField } from '../core/schema';
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
  const wired = (n: number) => ed.controls.has(n);
  const click = line(MINI_CLICK), mode = click === null ? null : miniStick(ed.block, click, wired);
  /** A direction of the mini-stick: no switch, just a position the stick turns into a hat direction or an axis. */
  const stickWay = (group: GroupDef, row: RowDef) => group.id === 'a1' && row.key !== MINI_CLICK;
  // A row is lit while its switch is closed, or, for a hat direction, while the stick reports that hat pointing that
  // way. The second matters for an analogue mini-stick acting as a hat: it closes no switch at all.
  const lit = (key: string) => {
    const l = line(key);
    if (l === null || !live) return false;
    if (live.lines.has(l)) return true;
    const hat = rowSends(ed.original, l, 0).hat;
    return !!hat && hatIncludes(live.hats[hat.n - 1] ?? 8, hat.dir);
  };
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
            const on = group.rows.some((r) => lit(r.key));
            return <path key={group.id} className={`leader ${hover === group.id || picked?.group.id === group.id ? 'on' : ''} ${on ? 'live' : ''}`}
              d={`M${edge(side)},${y + COL.title / 2} L${hot[0]},${hot[1]}`} />;
          })}
          {placed.groups.map(({ group, hot }) => {
            const on = group.rows.some((r) => lit(r.key));
            return <circle key={group.id} className={`spot ${on ? 'live' : ''} ${hover === group.id || picked?.group.id === group.id ? 'on' : ''}`} cx={hot[0]} cy={hot[1]} r={6}
              onMouseEnter={() => setHover(group.id)} onMouseLeave={() => setHover(null)} onClick={() => setSel({ kind: 'row', key: group.rows[0].key })} />;
          })}
          {placed.groups.map(({ group, side, y }) => {
            // the box lights with its circle on the drawing: selected or pointed at, or pressed
            const on = hover === group.id || picked?.group.id === group.id, pressed = group.rows.some((r) => lit(r.key));
            return (
              <g key={group.id} className={`box ${on ? 'on' : ''} ${pressed ? 'live' : ''}`} onMouseEnter={() => setHover(group.id)} onMouseLeave={() => setHover(null)}>
                <rect className="frame" x={x0(side) - 3} y={y - 3} width={COL.w + 6} height={COL.title + group.rows.length * COL.row + 4} />
                <rect className="title" x={x0(side)} y={y} width={COL.w} height={COL.title} />
                <text className="title" x={x0(side) + COL.w / 2} y={y + 16} textAnchor="middle">{group.title}</text>
                {group.rows.map((row, i) => renderRow(group, row, x0(side), y + COL.title + i * COL.row))}
              </g>
            );
          })}
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
  function renderRow(group: GroupDef, row: RowDef, x: number, y: number) {
    const l = line(row.key);
    if (l === null) return null;
    const sends = rowSends(ed.block, l, layer);
    const text = stickWay(group, row) ? miniStickWay(row.label, mode, sends.text) : sends.text;
    const same = layer !== 0 && sends.via === l && roleOf(ed.block, l) === 'button';
    const cls = `row ${lit(row.key) ? 'live' : ''} ${sel?.kind === 'row' && sel.key === row.key ? 'sel' : ''} ${same ? 'same' : ''}`;
    return (
      <g key={row.key} className={cls} onClick={() => setSel({ kind: 'row', key: row.key })}>
        <rect x={x} y={y} width={COL.w} height={COL.row - 2} />
        <Glyph kind={row.glyph} x={x + 17} y={y + 10} />
        <text className="name" x={x + 40} y={y + 14.5}>{text}</text>
        {changed(l) && <circle className="dirty" cx={x + COL.w - 12} cy={y + 10} r={3.5} />}
      </g>
    );
  }

  function rowPanel() {
    if (sel?.kind !== 'row' || !picked) return null;
    const row = picked.group.rows.find((r) => r.key === sel.key)!;
    const l = line(row.key)!;
    const sends = rowSends(ed.block, l, layer), p = physicalFunction(ed.block, l - 1);
    const choice = choiceOf(ed.block, l, layer), out = logicalFunction(ed.block, sends.via - 1);
    const held = LAYERS[layer].replace(' held', '');
    // the mini-stick's click is special: from the factory it is what turns the mini-stick from a hat into two axes
    const mini = row.key === MINI_CLICK ? mode : null, way = stickWay(picked.group, row);
    const choose = (c: Choice) => ed.edit((b) => setChoice(b, ed.original, l, layer, c, wired));
    return (
      <>
        <h3>{picked.group.title} <span>{row.label}</span>
          {!way && <em className={`pill ${live?.lines.has(l) ? 'ok' : ''}`}>{live?.lines.has(l) ? 'pressed' : `line ${l}`}</em>}</h3>
        {mini && layer === 0 && (
          <label className="ifield"><span>The mini-stick is</span>
            <select value={mini} onChange={(e) => ed.edit((b) => setMiniStick(b, ed.original, l, e.target.value as MiniStick, wired))}>
              {(Object.keys(MINI_STICK) as MiniStick[]).map((m) => <option key={m} value={m}>{MINI_STICK[m]}</option>)}
            </select></label>
        )}
        {mini?.startsWith('toggle') && <p className="dim">Pressing it in switches the mini-stick between a hat and two axes, and sends nothing
          {layer ? `, whatever is held` : ''}. To use the press for something else, pick one of the “always” choices.</p>}
        {way && <p className="dim">The mini-stick closes no switch as it moves: the stick turns its position into {mode === 'axes' ? 'an axis value'
          : mode === 'hat' ? 'a hat direction' : 'a hat direction or an axis value, depending on the mode'}. Choose the mode on the mini-stick’s push.</p>}
        {choice !== null && !way && (
          <label className="ifield"><span>{layer ? `With ${held} held, it should be` : row.key === MINI_CLICK ? 'The push should be' : 'This button should be'}</span>
            <span className="sends">
              <select value={choice} onChange={(e) => choose(e.target.value as Choice)}>
                {layer !== 0 && <option value="same">as normal ({rowSends(ed.block, l, 0).text})</option>}
                <option value="button">a button</option>
                {layer === 0 && <option value="shift1">the SHIFT1 key</option>}
                {layer === 0 && <option value="shift2">the SHIFT2 key</option>}
                <option value="none">nothing</option>
              </select>
              {choice === 'button' && <input type="number" min={1} max={127} value={out.button ?? ''} aria-label="Button number"
                onChange={(e) => e.target.value !== '' && ed.edit((b) => setButton(b, ed.original, l, layer, Math.max(1, Math.min(127, +e.target.value))))} />}
            </span></label>
        )}
        {(choice === 'shift1' || choice === 'shift2') && (
          <p className="dim">It sends nothing itself. While it is held, every button can send something else: switch to the “{LAYERS[choice === 'shift1' ? 1 : 2]}” layer above to set that up.</p>
        )}
        {choice === null && !mini && !way && (
          <p className="dim">{roleOf(ed.block, l) === 'button' ? `Sends ${sends.text}.` : `${p.kind}${p.detail ? `: ${p.detail}` : ''}.`} This kind of control is edited under the hood for now.</p>
        )}
        {changed(l) && layer === 0 && !mini && !way && (
          <button className="btn ghost" onClick={() => ed.edit((b) => { for (const o of [physicalEntry(l - 1), logicalEntry(l - 1)]) b.set(ed.original.subarray(o, o + 2), o); })}>Undo changes to this control</button>
        )}
      </>
    );
  }

  function axisPanel(slot: number) {
    const base = logicalAxisBase(slot), on = !!readField(ed.block, base, f('en'));
    const sensor = Math.min(7, readField(ed.block, base, f('src')) - 1);
    const max = (1 << readField(ed.original, base, f('prec'))) - 1 || 4095;
    const v = live?.axes[slot], axis = SCG_AXES.find((a) => a.slot === slot);
    return (
      <>
        <h3>{axis?.label} <span>{HID_USAGES[readField(ed.block, base, f('usage'))]} to the PC</span>
          {v !== undefined && on && <em className="pill">{Math.round((v / max) * 100)} %</em>}</h3>
        <div className="icols">
          <div>
            {['en', 'inv', 'dzlo', 'dzhi', 'rel'].map((k) => <Field key={k} ed={ed} base={base} def={f(k)} />)}
            {axis?.note && <p className="dim small">{axis.note}</p>}
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
  return <text className="glyph" x={x} y={y + 4.5} textAnchor="middle">{kind}</text>;
}
