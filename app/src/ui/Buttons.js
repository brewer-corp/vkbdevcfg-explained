import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { LINES, logicalEntry, logicalFunction, physicalEntry, physicalFunction, setLogical } from '../core/schema';
import { hex } from '../core/bytes';
export function Buttons({ ed, live }) {
    const [all, setAll] = useState(false);
    // The entry encoding (line -> joystick button) was confirmed on hardware; which physical control
    // is wired to which line was not, so the live highlight is the way to find a line.
    const locked = !ed.canEdit('verified');
    const rows = [];
    let skip = false;
    for (let line = 0; line < LINES; line++) {
        const p = physicalFunction(ed.block, line);
        const l = logicalFunction(ed.block, line);
        const pe = physicalEntry(line), le = logicalEntry(line);
        const unused = ed.block[pe] === 0xff && ed.block[pe + 1] === 0xff && l.auto;
        const continuation = skip;
        skip = !continuation && p.wide;
        const control = ed.controls.get(line + 1);
        if (unused && !control && !all)
            continue;
        const changed = [pe, pe + 1, le, le + 1].some((o) => ed.block[o] !== ed.original[o]);
        rows.push(_jsxs("tr", { className: `${changed ? 'changed' : ''} ${unused ? 'unused' : ''} ${live?.lines.has(line + 1) ? 'pressed' : ''}`, children: [_jsx("td", { className: "num", children: line + 1 }), _jsx("td", { children: control ? _jsxs(_Fragment, { children: [control.name, " ", _jsx("span", { className: "dim", children: control.owner })] }) : _jsx("span", { className: "dim", children: "\u2014" }) }), _jsx("td", { children: continuation ? _jsxs("span", { className: "dim", children: ["\u21B3 part of line ", line] }) : _jsx("b", { children: p.kind }) }), _jsx("td", { className: "dim", children: continuation ? '' : p.detail }), _jsx("td", { children: l.kind === 'Button' || l.kind === 'Auto' || l.kind === 'No function'
                        ? _jsxs("span", { className: "sends", children: [_jsxs("select", { disabled: locked, value: l.auto ? 'auto' : l.kind === 'Button' ? 'button' : 'none', onChange: (e) => ed.edit((b) => setLogical(b, line, e.target.value, l.button ?? line + 1)), children: [_jsx("option", { value: "button", children: "button" }), _jsx("option", { value: "auto", children: "same as line" }), _jsx("option", { value: "none", children: "nothing" })] }), l.kind !== 'No function' && _jsx("input", { type: "number", min: 1, max: 127, disabled: locked || l.auto, value: l.button ?? '', onChange: (e) => e.target.value !== '' && ed.edit((b) => setLogical(b, line, 'button', Math.max(1, Math.min(127, +e.target.value)))) }), l.detail && _jsxs("span", { className: "dim", children: [" ", l.detail] })] })
                        : _jsxs("span", { children: [l.kind, " ", _jsx("span", { className: "dim", children: l.detail })] }) }), _jsxs("td", { className: "mono dim", children: [hex(ed.block.subarray(pe, pe + 2)), " \u00B7 ", hex(ed.block.subarray(le, le + 2))] })] }, line));
    }
    return (_jsxs(_Fragment, { children: [_jsxs("p", { className: "intro", children: ["The stick has up to 128 wired ", _jsx("b", { children: "lines" }), ". Each has a job (what kind of control it is) and something it sends to the PC. Here you can change which joystick button a line sends; left alone, a line sends the button with its own number."] }), _jsxs("label", { className: "toggle", children: [_jsx("input", { type: "checkbox", checked: all, onChange: (e) => setAll(e.target.checked) }), " Show all 128 lines"] }), ed.controls.size > 0 && _jsx("p", { className: "note", children: "Control names are VKB\u2019s, taken from the diagram in their own tool. They match this stick\u2019s factory setup but have not been checked by pressing each control \u2014 the live highlight is the test." }), live && _jsx("p", { className: "note ok", children: "Live: press a control on the stick and its line lights up here, whatever it is set to do." }), _jsxs("table", { className: "lines", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Line" }), _jsx("th", { children: "Control" }), _jsx("th", { children: "It is a" }), _jsx("th", {}), _jsx("th", { children: "Sends" }), _jsx("th", { children: "Raw (job \u00B7 output)" })] }) }), _jsx("tbody", { children: rows })] })] }));
}
