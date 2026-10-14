import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { MINI_STICK, SCG_AXES, SCG_CHART, freeLine, hatIncludes, lineOf, miniStick, roleOf, rowSends, setLayered, setMiniStick, setRole, shiftsInUse } from '../core/chart';
import { stickModel } from '../core/identity';
import { HID_USAGES, LOGICAL_AXIS, logicalAxisBase, logicalEntry, logicalFunction, physicalEntry, physicalFunction, readField, setLogical } from '../core/schema';
import { CurveEditor } from './CurveEditor';
import { Field } from './Field';
import { StickArt, artSize, spot } from './StickArt';
// Everything is laid out in one coordinate system so the picture, the boxes and the lines between them scale together.
const VIEW = { w: 1280, h: 792 };
/** The box the drawing is fitted into. */
const DRAW = { x: 384, y: 6, w: 512, h: 650 };
const COL = { left: 16, right: 912, w: 352, title: 24, row: 22, gap: 8, top: 6 };
const LAYERS = ['Normal', 'SHIFT1 held', 'SHIFT2 held'];
export function Chart({ session, ed, live }) {
    const [sel, setSel] = useState(null);
    const [hover, setHover] = useState(null);
    const [layer, setLayer] = useState(0);
    const [follow, setFollow] = useState(true);
    // ?look=left-omni forces a variant, for looking at the drawings without owning all four sticks
    const look = new URLSearchParams(location.search).get('look');
    const model = stickModel(ed.original, session.productId);
    const hand = look?.includes('left') ? 'left' : look?.includes('right') ? 'right' : model.hand ?? 'right';
    const mount = look?.includes('omni') ? 'omni' : look?.includes('standard') ? 'standard' : model.mount ?? 'standard';
    const art = artSize(hand, mount), scale = Math.min(DRAW.w / art.w, DRAW.h / art.h);
    const origin = [DRAW.x + (DRAW.w - art.w * scale) / 2, DRAW.y + (DRAW.h - art.h * scale) / 2];
    const at = (id) => { const [x, y] = spot(id, hand, mount); return [origin[0] + scale * x, origin[1] + scale * y]; };
    const placed = useMemo(() => {
        // Each box goes on the side of the picture its control is on, and boxes run top to bottom in the order their
        // controls do, so the lines between them cross as little as possible.
        const height = (rows) => COL.title + rows * COL.row + COL.gap;
        const middle = origin[0] + (art.w * scale) / 2, room = VIEW.h - COL.top;
        const all = [...SCG_CHART.inner, ...SCG_CHART.outer].map((group) => ({ group, hot: at(group.id), h: height(group.rows.length) }));
        const cols = { left: all.filter((g) => g.hot[0] < middle), right: all.filter((g) => g.hot[0] >= middle) };
        const tall = (side) => cols[side].reduce((n, g) => n + g.h, 0);
        for (const [from, to] of [['left', 'right'], ['right', 'left']])
            while (tall(from) > room && cols[from].length > 1) { // too many on one side: hand over the most central
                const g = cols[from].reduce((a, b) => (Math.abs(a.hot[0] - middle) < Math.abs(b.hot[0] - middle) ? a : b));
                cols[from] = cols[from].filter((x) => x !== g);
                cols[to].push(g);
            }
        const out = [];
        const ends = { left: COL.top, right: COL.top };
        for (const side of ['left', 'right'])
            for (const g of cols[side].sort((a, b) => a.hot[1] - b.hot[1])) {
                out.push({ group: g.group, side, y: ends[side], hot: g.hot });
                ends[side] += g.h;
            }
        const axesSide = ends.left <= ends.right ? 'left' : 'right';
        return { groups: out, axesY: ends[axesSide], axesSide };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hand, mount]);
    const line = (key) => lineOf(ed.controls, key);
    // A row is lit while its switch is closed, or, for a hat direction, while the stick reports that hat pointing that
    // way. The second matters for an analogue mini-stick acting as a hat: it closes no switch at all.
    const lit = (key) => {
        const l = line(key);
        if (l === null || !live)
            return false;
        if (live.lines.has(l))
            return true;
        const hat = rowSends(ed.original, l, 0).hat;
        return !!hat && hatIncludes(live.hats[hat.n - 1] ?? 8, hat.dir);
    };
    const shifts = shiftsInUse(ed.block);
    useEffect(() => { if ((layer === 1 && !shifts.shift1) || (layer === 2 && !shifts.shift2))
        setLayer(0); }, [layer, shifts.shift1, shifts.shift2]);
    // "press it to select it": a control that has just closed becomes the selection
    const before = useRef(new Set());
    const primed = useRef(false);
    useEffect(() => {
        if (!live)
            return;
        // not on the first report: whatever is closed when we start watching (the dial rests on a contact) is not a press
        if (follow && primed.current) {
            const fresh = [...live.lines].find((l) => !before.current.has(l) && ed.controls.has(l));
            if (fresh !== undefined)
                setSel({ kind: 'row', key: ed.controls.get(fresh).key });
        }
        before.current = live.lines;
        primed.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [live?.lines, follow]);
    const changed = (l) => [physicalEntry(l - 1), physicalEntry(l - 1) + 1, logicalEntry(l - 1), logicalEntry(l - 1) + 1].some((o) => ed.block[o] !== ed.original[o]);
    const x0 = (side) => (side === 'left' ? COL.left : COL.right);
    const edge = (side) => (side === 'left' ? COL.left + COL.w : COL.right);
    const f = (k) => LOGICAL_AXIS.find((d) => d.key === k);
    const picked = sel?.kind === 'row' ? placed.groups.find((p) => p.group.rows.some((r) => r.key === sel.key)) : undefined;
    return (_jsxs("div", { className: "chartwrap", children: [_jsxs("div", { className: "charttools", children: [_jsx("span", { className: "seg", children: LAYERS.map((name, i) => (_jsx("button", { className: layer === i ? 'on' : '', disabled: (i === 1 && !shifts.shift1) || (i === 2 && !shifts.shift2), title: i && !(i === 1 ? shifts.shift1 : shifts.shift2) ? 'No control is set up as this shift key yet. Select a button and make it one.' : '', onClick: () => setLayer(i), children: name }, name))) }), live && _jsxs("label", { className: "toggle", children: [_jsx("input", { type: "checkbox", checked: follow, onChange: (e) => setFollow(e.target.checked) }), " Select what I press"] }), _jsxs("span", { className: "dim", children: [hand === 'left' ? 'Left-hand' : 'Right-hand', " stick", mount === 'omni' ? ' on an Omni Throttle adapter' : '', ".", !live && session.source === 'device' ? ' Waiting for the stick’s reports…' : ''] })] }), _jsxs("div", { className: "chart", children: [_jsxs("svg", { viewBox: `0 0 ${VIEW.w} ${VIEW.h}`, role: "img", "aria-label": "The stick and what each of its controls sends", children: [_jsx("g", { transform: `translate(${origin[0]} ${origin[1]}) scale(${scale})`, children: _jsx(StickArt, { hand: hand, mount: mount }) }), placed.groups.map(({ group, side, y, hot }) => {
                                const on = group.rows.some((r) => lit(r.key));
                                return _jsx("path", { className: `leader ${hover === group.id || picked?.group.id === group.id ? 'on' : ''} ${on ? 'live' : ''}`, d: `M${edge(side)},${y + COL.title / 2} L${hot[0]},${hot[1]}` }, group.id);
                            }), placed.groups.map(({ group, hot }) => {
                                const on = group.rows.some((r) => lit(r.key));
                                return _jsx("circle", { className: `spot ${on ? 'live' : ''} ${hover === group.id || picked?.group.id === group.id ? 'on' : ''}`, cx: hot[0], cy: hot[1], r: 6, onMouseEnter: () => setHover(group.id), onMouseLeave: () => setHover(null), onClick: () => setSel({ kind: 'row', key: group.rows[0].key }) }, group.id);
                            }), placed.groups.map(({ group, side, y }) => (_jsxs("g", { className: "box", onMouseEnter: () => setHover(group.id), onMouseLeave: () => setHover(null), children: [_jsx("rect", { className: "title", x: x0(side), y: y, width: COL.w, height: COL.title }), _jsx("text", { className: "title", x: x0(side) + COL.w / 2, y: y + 16, textAnchor: "middle", children: group.title }), group.rows.map((row, i) => renderRow(row, x0(side), y + COL.title + i * COL.row))] }, group.id))), _jsxs("g", { className: "box", children: [_jsx("rect", { className: "title", x: x0(placed.axesSide), y: placed.axesY, width: COL.w, height: COL.title }), _jsx("text", { className: "title", x: x0(placed.axesSide) + COL.w / 2, y: placed.axesY + 16, textAnchor: "middle", children: "Axes" }), SCG_AXES.map((a, i) => {
                                        const base = logicalAxisBase(a.slot), on = !!readField(ed.block, base, f('en'));
                                        const max = (1 << readField(ed.original, base, f('prec'))) - 1 || 4095;
                                        const v = live?.axes[a.slot] ?? 0, x = x0(placed.axesSide), y = placed.axesY + COL.title + i * COL.row;
                                        const dirty = [...Array(8).keys()].some((o) => ed.block[base + o] !== ed.original[base + o]);
                                        return (_jsxs("g", { className: `row axis ${on ? '' : 'off'} ${sel?.kind === 'axis' && sel.slot === a.slot ? 'sel' : ''}`, onClick: () => setSel({ kind: 'axis', slot: a.slot }), children: [_jsx("rect", { x: x, y: y, width: COL.w, height: COL.row - 2 }), _jsx("text", { className: "name", x: x + 10, y: y + 14.5, children: a.label }), _jsx("rect", { className: "track", x: x + 128, y: y + 5, width: 150, height: 10 }), live && on && _jsx("rect", { className: "fill", x: x + 128, y: y + 5, width: Math.min(150, (v / max) * 150), height: 10 }), _jsx("text", { className: "value", x: x + COL.w - 10, y: y + 14.5, textAnchor: "end", children: live && on ? v : on ? HID_USAGES[readField(ed.block, base, f('usage'))] : 'off' }), dirty && _jsx("circle", { className: "dirty", cx: x + COL.w - 62, cy: y + 10, r: 3.5 })] }, a.slot));
                                    })] })] }), _jsxs("div", { className: "inspector", children: [sel?.kind === 'row' && picked && rowPanel(), sel?.kind === 'axis' && axisPanel(sel.slot), !sel && (_jsx("p", { className: "dim", children: live ? 'Press a control on the stick, or click one here, to see what it sends and change it.'
                                    : 'Click a control to see what it sends and change it.' }))] })] })] }));
    // These three are plain functions, not components: defined in here they would be a new component type on every
    // render, and the inputs inside would lose focus at each keystroke.
    function renderRow(row, x, y) {
        const l = line(row.key);
        if (l === null)
            return null;
        const sends = rowSends(ed.block, l, layer);
        const same = layer !== 0 && sends.via === l && roleOf(ed.block, l) === 'button';
        const cls = `row ${lit(row.key) ? 'live' : ''} ${sel?.kind === 'row' && sel.key === row.key ? 'sel' : ''} ${same ? 'same' : ''}`;
        return (_jsxs("g", { className: cls, onClick: () => setSel({ kind: 'row', key: row.key }), children: [_jsx("rect", { x: x, y: y, width: COL.w, height: COL.row - 2 }), _jsx(Glyph, { kind: row.glyph, x: x + 17, y: y + 10 }), _jsx("text", { className: "name", x: x + 40, y: y + 14.5, children: sends.text }), changed(l) && _jsx("circle", { className: "dirty", cx: x + COL.w - 12, cy: y + 10, r: 3.5 })] }, row.key));
    }
    function rowPanel() {
        if (sel?.kind !== 'row' || !picked)
            return null;
        const row = picked.group.rows.find((r) => r.key === sel.key);
        const l = line(row.key);
        const role = roleOf(ed.block, l), sends = rowSends(ed.block, l, layer), p = physicalFunction(ed.block, l - 1);
        const out = logicalFunction(ed.block, sends.via - 1);
        const moved = layer !== 0 && sends.via !== l;
        const canSet = sends.simple && (layer === 0 || moved);
        const wired = (n) => ed.controls.has(n);
        // the mini-stick's click is special: from the factory it is what turns the mini-stick from a hat into two axes
        const mini = row.key === 'mini-stick.push' ? miniStick(ed.block, l, wired) : null;
        return (_jsxs(_Fragment, { children: [_jsxs("h3", { children: [picked.group.title, " ", _jsx("span", { children: row.label }), _jsx("em", { className: `pill ${live?.lines.has(l) ? 'ok' : ''}`, children: live?.lines.has(l) ? 'pressed' : `line ${l}` })] }), mini && layer === 0 && (_jsxs("label", { className: "ifield", children: [_jsx("span", { children: "The mini-stick is" }), _jsx("select", { value: mini, onChange: (e) => ed.edit((b) => setMiniStick(b, ed.original, l, e.target.value, wired)), children: Object.keys(MINI_STICK).map((m) => _jsx("option", { value: m, children: MINI_STICK[m] }, m)) })] })), layer === 0 && role !== 'other' && !mini && (_jsxs("label", { className: "ifield", children: [_jsx("span", { children: "This control is" }), _jsxs("select", { value: role, onChange: (e) => ed.edit((b) => setRole(b, ed.original, l, e.target.value)), children: [_jsx("option", { value: "button", children: "a button" }), _jsx("option", { value: "shift1", children: "the SHIFT1 key" }), _jsx("option", { value: "shift2", children: "the SHIFT2 key" })] })] })), role === 'other' && !mini && _jsxs("p", { className: "dim", children: [p.kind, p.detail ? `: ${p.detail}` : '', ". This kind of control is edited under the hood for now."] }), mini && layer === 0 && _jsx("p", { className: "dim", children: mini.startsWith('toggle')
                        ? 'Pressing the mini-stick in switches it between a hat and two axes. To use the press for something else, pick one of the “always” choices.'
                        : 'Pressing the mini-stick in is an ordinary button.' }), role !== 'button' && role !== 'other' && (_jsxs("p", { className: "dim", children: ["While it is held, every button can send something else: switch to the \u201C", LAYERS[role === 'shift1' ? 1 : 2], "\u201D layer above to set that up. It sends nothing itself."] })), role === 'button' && layer !== 0 && !moved && (_jsxs(_Fragment, { children: [_jsxs("p", { className: "dim", children: ["With ", LAYERS[layer].replace(' held', ''), " held this sends the same as normal: ", _jsx("b", { children: sends.text }), "."] }), _jsx("button", { className: "btn", onClick: () => ed.edit((b) => {
                                const spare = freeLine(b, wired);
                                if (spare) {
                                    setLayered(b, l, layer, spare);
                                    setLogical(b, spare - 1, 'auto');
                                }
                            }), children: "Send something else on this layer" })] })), role === 'button' && canSet && (_jsxs("label", { className: "ifield", children: [_jsx("span", { children: layer ? `With ${LAYERS[layer].replace(' held', '')} it sends` : 'It sends' }), _jsxs("span", { className: "sends", children: [_jsxs("select", { value: out.auto ? 'auto' : out.kind === 'Button' ? 'button' : 'none', onChange: (e) => ed.edit((b) => setLogical(b, sends.via - 1, e.target.value, out.button ?? sends.via)), children: [_jsx("option", { value: "button", children: "button" }), !moved && _jsxs("option", { value: "auto", children: ["button ", sends.via, " (its line number)"] }), _jsx("option", { value: "none", children: "nothing" })] }), out.kind !== 'No function' && _jsx("input", { type: "number", min: 1, max: 127, disabled: out.auto && !moved, value: out.button ?? '', onChange: (e) => e.target.value !== '' && ed.edit((b) => setLogical(b, sends.via - 1, 'button', Math.max(1, Math.min(127, +e.target.value)))) })] })] })), role === 'button' && !sends.simple && _jsxs("p", { className: "dim", children: ["Sends ", _jsx("b", { children: sends.text }), ". Outputs other than joystick buttons are edited under the hood for now."] }), moved && _jsx("button", { className: "btn ghost", onClick: () => ed.edit((b) => setLayered(b, l, layer, null)), children: "Same as normal again" }), changed(l) && layer === 0 && !mini && (_jsx("button", { className: "btn ghost", onClick: () => ed.edit((b) => { for (const o of [physicalEntry(l - 1), logicalEntry(l - 1)])
                        b.set(ed.original.subarray(o, o + 2), o); }), children: "Undo changes to this control" }))] }));
    }
    function axisPanel(slot) {
        const base = logicalAxisBase(slot), on = !!readField(ed.block, base, f('en'));
        const sensor = Math.min(7, readField(ed.block, base, f('src')) - 1);
        const max = (1 << readField(ed.original, base, f('prec'))) - 1 || 4095;
        const v = live?.axes[slot], axis = SCG_AXES.find((a) => a.slot === slot);
        return (_jsxs(_Fragment, { children: [_jsxs("h3", { children: [axis?.label, " ", _jsxs("span", { children: [HID_USAGES[readField(ed.block, base, f('usage'))], " to the PC"] }), v !== undefined && on && _jsxs("em", { className: "pill", children: [Math.round((v / max) * 100), " %"] })] }), _jsxs("div", { className: "icols", children: [_jsxs("div", { children: [['en', 'inv', 'dzlo', 'dzhi', 'rel'].map((k) => _jsx(Field, { ed: ed, base: base, def: f(k) }, k)), axis?.note && _jsx("p", { className: "dim small", children: axis.note })] }), _jsx(CurveEditor, { ed: ed, n: sensor })] })] }));
    }
}
/** The mark at the start of a row. Drawn rather than typed: arrow and dot characters are missing from too many fonts. */
function Glyph({ kind, x, y }) {
    const tri = (a) => _jsx("path", { className: "glyph", d: "M0,-5 L5,4 L-5,4 Z", transform: `translate(${x} ${y}) rotate(${a})` });
    if (kind === 'up')
        return tri(0);
    if (kind === 'right')
        return tri(90);
    if (kind === 'down')
        return tri(180);
    if (kind === 'left')
        return tri(270);
    if (kind === 'dot')
        return _jsx("circle", { className: "glyph", cx: x, cy: y, r: 4 });
    if (kind === 'push')
        return _jsxs(_Fragment, { children: [_jsx("circle", { className: "glyph ring", cx: x, cy: y, r: 5 }), _jsx("circle", { className: "glyph", cx: x, cy: y, r: 2 })] });
    if (kind === 'click')
        return _jsxs(_Fragment, { children: [_jsx("circle", { className: "glyph ring", cx: x, cy: y, r: 5.5 }), _jsx("circle", { className: "glyph ring", cx: x, cy: y, r: 2.5 })] });
    return _jsx("text", { className: "glyph", x: x, y: y + 4.5, textAnchor: "middle", children: kind });
}
