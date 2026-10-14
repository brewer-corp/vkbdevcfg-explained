import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef } from 'react';
import { CURVE_PRESETS, curveOutput, curvePoints, curveState, setCurvePoint, setCurveShape } from '../core/curve';
import { CURVE_POINTS } from '../core/schema';
/**
 * A response curve for physical axis `n`: pick a shape, tune how strong it is, or drag the dots.
 * The graph is input (across) against output (up); the dotted line is no curve at all.
 */
export function CurveEditor({ ed, n }) {
    const now = curveState(ed.block, n), was = curveState(ed.original, n);
    const locked = !ed.canEdit('verified'); // points, the enable bit and the curve number are all confirmed
    const svg = useRef(null);
    const shown = now.on ? now.points : curvePoints(0);
    const path = (pts) => 'M0,100 ' + [...Array(51).keys()].slice(1).map((i) => `L${i * 2},${100 - curveOutput(pts, i / 50) * 100}`).join(' ');
    const preset = CURVE_PRESETS.find((p) => p.shape === now.shape);
    const drag = (i) => (e) => {
        if (locked)
            return;
        const box = svg.current.getBoundingClientRect();
        const move = (ev) => ed.edit((b) => setCurvePoint(b, n, i, Math.max(0, Math.min(1, 1 - (ev.clientY - box.top) / box.height))));
        const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
        e.preventDefault();
    };
    return (_jsxs("div", { className: "curve", children: [_jsxs("label", { className: "ifield", children: [_jsx("span", { children: "Response" }), _jsxs("select", { disabled: locked, value: preset ? preset.shape : now.shape === null ? 'custom' : now.shape, onChange: (e) => e.target.value !== 'custom' && ed.edit((b) => setCurveShape(b, n, +e.target.value)), children: [CURVE_PRESETS.map((p) => _jsx("option", { value: p.shape, children: p.name }, p.shape)), !preset && now.shape !== null && _jsxs("option", { value: now.shape, children: [now.shape > 0 ? 'Soft' : 'Sharp', " centre, ", Math.abs(now.shape), " %"] }), now.shape === null && _jsx("option", { value: "custom", children: "Custom" })] })] }), _jsxs("label", { className: "ifield", title: "Left: more sensitive around the centre. Right: less sensitive around the centre. Full travel always gives full output.", children: [_jsx("span", { children: "Sharper \u2013 softer" }), _jsx("input", { type: "range", min: -100, max: 100, step: 5, disabled: locked, value: now.shape ?? 0, onChange: (e) => ed.edit((b) => setCurveShape(b, n, +e.target.value)) })] }), _jsxs("svg", { ref: svg, viewBox: "-4 -4 108 108", preserveAspectRatio: "none", children: [_jsx("rect", { className: "frame", x: "0", y: "0", width: "100", height: "100" }), _jsx("path", { className: "grid", d: "M0,50 H100 M50,0 V100" }), _jsx("path", { className: "straight", d: "M0,100 L100,0" }), was.on !== now.on || was.points.some((v, i) => v !== now.points[i]) ? _jsx("path", { className: "was", d: path(was.on ? was.points : curvePoints(0)) }) : null, _jsx("path", { className: "now", d: path(shown) }), !locked && shown.map((_, i) => {
                        const x = ((i + 1) / CURVE_POINTS) * 100;
                        return _jsx("circle", { className: "dot", cx: x, cy: 100 - curveOutput(shown, (i + 1) / CURVE_POINTS) * 100, r: 2.6, onPointerDown: drag(i) }, i);
                    })] }), _jsx("p", { className: "dim small", children: "Across: how far the axis is moved. Up: what the PC gets. Drag a dot to shape it by hand." })] }));
}
