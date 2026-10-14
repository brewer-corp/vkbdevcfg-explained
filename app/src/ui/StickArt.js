import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { OMNI_LEFT, OMNI_RIGHT, STANDARD_LEFT, STANDARD_RIGHT } from './stickart.paths';
const DRAWN = {
    standard: { left: STANDARD_LEFT, right: STANDARD_RIGHT },
    omni: { left: OMNI_LEFT, right: OMNI_RIGHT },
};
/** The drawing's size; its coordinates run from 0,0 to this. */
export const artSize = (hand, mount) => ({ w: DRAWN[mount][hand].box[2], h: DRAWN[mount][hand].box[3] });
/** Position of a control in its drawing's coordinates. */
export function spot(id, hand, mount) {
    const art = DRAWN[mount][hand], edge = 8;
    // a chart's leader can stop just short of the stick (the side button's does); keep the marker on the drawing
    const within = (v, size) => Math.max(edge, Math.min(size - edge, v));
    return [within(art.spots[id][0] - art.box[0], art.box[2]), within(art.spots[id][1] - art.box[1], art.box[3])];
}
/** The drawing, in its own coordinates (see `artSize`). `children` are drawn on top. */
export function StickArt({ hand, mount, children }) {
    const art = DRAWN[mount][hand];
    return (_jsxs("g", { className: "stickart", children: [_jsxs("g", { transform: `translate(${-art.box[0]} ${-art.box[1]})`, children: [_jsx("defs", { children: _jsx("pattern", { id: "stick-scan", width: "8", height: "5", patternUnits: "userSpaceOnUse", children: _jsx("rect", { width: "8", height: "1.6" }) }) }), _jsx("path", { className: "body", d: art.body }), _jsx("path", { className: "scan", d: art.body, fill: "url(#stick-scan)" }), art.reds.map((d) => _jsx("path", { className: "red", d: d }, d.length)), _jsx("path", { className: "lines", d: art.lines }), _jsx("path", { className: "outline", d: art.body })] }), children] }));
}
