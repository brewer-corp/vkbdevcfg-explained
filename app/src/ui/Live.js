import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { AXIS_SLOTS, HID_USAGES, LINES, LOGICAL_AXIS, logicalAxisBase, logicalFunction, physicalEntry, physicalFunction, readField } from '../core/schema';
const bits128 = (data, at) => {
    const out = new Set();
    for (let i = 0; i < 128; i++)
        if (data[at + (i >> 3)] & (1 << (i & 7)))
            out.add(i + 1);
    return out;
};
export function parseInput(data, reports, after = null) {
    const axes = [...Array(8).keys()].map((i) => data[2 * i] | (data[2 * i + 1] << 8));
    // The report's tail is not padding: 0xA5 at [0x2e] marks it valid, [0x2c..0x2e) holds the shift states and
    // [0x2f..0x3f) is a 128-bit map of active lines (all confirmed on hardware).
    const tail = data[0x2e] === 0xa5;
    const subShifts = tail ? [...Array(6).keys()].filter((i) => data[0x2c] & (4 << i)).map((i) => i + 1).concat(data[0x2d] & 0x80 ? [7] : []) : [];
    return {
        axes, buttons: bits128(data, 16), hats: [0, 1, 2, 3].map((i) => data[32 + 2 * i] & 0x0f),
        lines: tail ? bits128(data, 0x2f) : new Set(), shift1: tail && !!(data[0x2c] & 1), shift2: tail && !!(data[0x2c] & 2), subShifts,
        after: after ? parseAfter(after) : null, reports,
    };
}
/** Report 0x0C, sent whenever a line changes: [0..16) is the line map after each line's function. */
export const parseAfter = (data) => bits128(data, 0);
/** Subscribe to input reports while a stick is connected; updates at most once per animation frame. */
export function useLive(session) {
    const [state, setState] = useState(null);
    const latest = useRef(null);
    const after = useRef(null);
    const count = useRef(0);
    useEffect(() => {
        setState(null);
        latest.current = null;
        after.current = null;
        count.current = 0;
        const t = session?.transport;
        if (!t?.onInput)
            return;
        const off = t.onInput((id, data) => {
            if (id === 1) {
                latest.current = data;
                count.current++;
            }
            else if (id === 0x0c) {
                after.current = data;
                count.current++;
            }
        });
        let raf = 0, shown = 0;
        const tick = () => {
            if (latest.current && count.current !== shown) {
                shown = count.current;
                setState(parseInput(latest.current, shown, after.current));
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { off(); cancelAnimationFrame(raf); };
        // the transport object is replaced after a restart, so re-subscribe when it changes
    }, [session, session?.transport]);
    return state;
}
const HAT = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
export function Live({ ed, live }) {
    if (!live)
        return _jsx("p", { className: "intro", children: "Live input needs a stick connected over USB. Move the stick or press a button if it is connected and nothing shows." });
    const f = (k) => LOGICAL_AXIS.find((d) => d.key === k);
    // which line sends each button: lines left on auto first, so that explicit entries win
    const lineFor = new Map();
    for (const auto of [true, false])
        for (let l = 0; l < LINES; l++) {
            const fn = logicalFunction(ed.original, l);
            if (fn.button !== null && fn.auto === auto)
                lineFor.set(fn.button, l + 1);
        }
    const named = (line) => (ed.controls.has(line) ? `${line} ${ed.controls.get(line).name}` : String(line));
    const hats = Math.max(1, Math.min(4, ed.original[0x1e] & 7));
    const wired = (i) => physicalFunction(ed.original, i).kind !== 'Button' || ed.original[physicalEntry(i)] !== 0xff || ed.original[physicalEntry(i) + 1] !== 0xff || ed.controls.has(i + 1);
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "intro", children: "What the stick is sending right now \u2014 the same report a game reads. Use it to check a change did what you meant: press the control, see which button lights, and which line it comes from." }), _jsxs("section", { className: "panel", children: [_jsxs("h2", { children: ["Axes ", _jsxs("small", { className: "dim", children: [live.reports, " reports"] })] }), live.axes.map((v, i) => {
                        const base = logicalAxisBase(i);
                        const on = i < AXIS_SLOTS && !!readField(ed.original, base, f('en'));
                        const max = (1 << readField(ed.original, base, f('prec'))) - 1 || 4095;
                        return (_jsxs("div", { className: `bar ${on ? '' : 'off'}`, children: [_jsxs("span", { className: "name", children: [i + 1, " \u00B7 ", HID_USAGES[readField(ed.original, base, f('usage'))]] }), _jsx("span", { className: "track", children: _jsx("i", { style: { width: `${Math.min(100, (v / max) * 100)}%` } }) }), _jsx("span", { className: "mono", children: v })] }, i));
                    }), _jsxs("div", { className: "bar", children: [_jsx("span", { className: "name", children: hats > 1 ? 'Hats' : 'Hat' }), _jsx("span", { className: "hat", children: live.hats.slice(0, hats).map((h, i) => _jsxs("span", { children: [h < 8 ? HAT[h] : '·', " "] }, i)) })] }), _jsxs("div", { className: "bar", children: [_jsx("span", { className: "name", children: "Shift" }), _jsxs("span", { children: [_jsx("em", { className: `pill ${live.shift1 ? 'ok' : ''}`, children: "SHIFT1" }), _jsx("em", { className: `pill ${live.shift2 ? 'ok' : ''}`, children: "SHIFT2" }), live.subShifts.map((n) => _jsxs("em", { className: "pill ok", children: ["SubSHIFT ", n] }, n))] })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("h2", { children: ["Lines ", _jsx("small", { className: "dim", children: live.lines.size ? `active: ${[...live.lines].map(named).join(', ')}` : 'none active' })] }), _jsxs("p", { className: "dim", children: ["The input side: one cell per wired line, lit while its contact is closed \u2014 whatever the line is set up to do. Press a control to find its line number.", ed.controls.size > 0 && ' Hover a cell for the name VKB gives its control.'] }), _jsx("div", { className: "btngrid", children: [...Array(128).keys()].map((i) => (_jsx("span", { className: `${live.lines.has(i + 1) ? 'on line' : ''} ${wired(i) ? 'mapped' : ''}`, title: `line ${named(i + 1)}: ${physicalFunction(ed.original, i).kind}`, children: i + 1 }, i))) })] }), _jsxs("section", { className: "panel", children: [_jsxs("h2", { children: ["After each line\u2019s job ", _jsx("small", { className: "dim", children: !live.after ? 'waiting for a change' : live.after.size ? `active: ${[...live.after].join(', ')}` : 'none active' })] }), _jsx("p", { className: "dim", children: "The same lines once the stick has applied their jobs \u2014 a shifted button shows on the line it moved to, a toggle as a short pulse. The stick only sends this when something changes, so it stays blank until you press something." }), _jsx("div", { className: "btngrid", children: [...Array(128).keys()].map((i) => _jsx("span", { className: live.after?.has(i + 1) ? 'on line' : '', children: i + 1 }, i)) })] }), _jsxs("section", { className: "panel", children: [_jsxs("h2", { children: ["Buttons sent ", _jsx("small", { className: "dim", children: live.buttons.size ? [...live.buttons].map((b) => `button ${b}${lineFor.has(b) ? ` (line ${named(lineFor.get(b))})` : ''}`).join(', ') : 'none pressed' })] }), _jsx("div", { className: "btngrid", children: [...Array(128).keys()].map((i) => (_jsx("span", { className: `${live.buttons.has(i + 1) ? 'on' : ''} ${lineFor.has(i + 1) ? 'mapped' : ''}`, title: lineFor.has(i + 1) ? `sent by line ${named(lineFor.get(i + 1))}` : 'not mapped', children: i + 1 }, i))) })] })] }));
}
