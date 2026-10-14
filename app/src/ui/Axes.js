import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AXIS_SLOTS, HID_USAGES, LOGICAL_AXIS, PHYSICAL_AXIS, inputType, logicalAxisBase, physicalAxisBase, physicalAxisUnused, readField } from '../core/schema';
import { CurveEditor } from './CurveEditor';
import { Field } from './Field';
export function Axes({ ed }) {
    const f = (k) => LOGICAL_AXIS.find((d) => d.key === k);
    return (_jsxs(_Fragment, { children: [_jsxs("p", { className: "intro", children: ["Each axis has two halves. The ", _jsx("b", { children: "sensor" }), " is the hardware: how it is filtered and calibrated. The ", _jsx("b", { children: "output" }), " is what the PC sees: which sensor feeds it, what it is called, its deadzones."] }), _jsx("div", { className: "cards", children: [...Array(AXIS_SLOTS).keys()].map((n) => {
                    const lb = logicalAxisBase(n);
                    const src = readField(ed.block, lb, f('src')) - 1;
                    const on = !!readField(ed.block, lb, f('en'));
                    const sensor = src < AXIS_SLOTS ? src : n;
                    return (_jsxs("section", { className: `panel axis ${on ? '' : 'off'}`, children: [_jsxs("h2", { children: [_jsx("span", { className: "n", children: n + 1 }), HID_USAGES[readField(ed.block, lb, f('usage'))], !on && _jsx("em", { className: "pill", children: "disabled" })] }), _jsxs("div", { className: "cols", children: [_jsxs("div", { children: [_jsx("h3", { children: "Output" }), LOGICAL_AXIS.map((d) => _jsx(Field, { ed: ed, base: lb, def: d }, d.key))] }), _jsxs("div", { children: [_jsxs("h3", { children: ["Sensor ", sensor + 1, " ", _jsx("small", { children: physicalAxisUnused(ed.block, sensor) ? 'no sensor fitted' : inputType(ed.block, sensor) })] }), PHYSICAL_AXIS.filter((d) => d.key !== 'eq').map((d) => _jsx(Field, { ed: ed, base: physicalAxisBase(sensor), def: d }, d.key)), _jsx("h3", { children: "Response curve" }), _jsx(CurveEditor, { ed: ed, n: sensor })] })] })] }, n));
                }) })] }));
}
