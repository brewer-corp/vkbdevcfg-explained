import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { REGIONS, regionOf } from '../core/schema';
/** The raw 4096 bytes, coloured by region, with changed bytes marked. */
export function BlockMap({ ed }) {
    const [hover, setHover] = useState(null);
    const region = hover === null ? null : regionOf(hover);
    const rows = [];
    for (let row = 0; row < ed.block.length; row += 32) {
        const cells = [];
        for (let i = row; i < row + 32; i++) {
            const r = regionOf(i);
            cells.push(_jsx("span", { className: `byte g-${r.group} ${ed.block[i] !== ed.original[i] ? 'chg' : ''} ${region === r ? 'hl' : ''}`, onMouseEnter: () => setHover(i), children: ed.block[i].toString(16).padStart(2, '0') }, i));
        }
        rows.push(_jsxs("div", { className: "hexrow", children: [_jsx("span", { className: "off", children: row.toString(16).padStart(3, '0') }), cells] }, row));
    }
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "intro", children: "Everything on the other tabs is a view of these 4096 bytes. Colours show what each part is for; hover for detail. Bytes you have changed are outlined." }), _jsx("div", { className: "legend", children: ['header', 'options', 'axes', 'buttons', 'ext', 'leds', 'detents', 'unknown', 'unused'].map((g) => (_jsx("span", { className: `g-${g}`, children: { ext: 'external devices', unknown: 'not decoded' }[g] ?? g }, g))) }), _jsx("div", { className: "where", children: hover === null ? 'Hover a byte.' : _jsxs(_Fragment, { children: [_jsxs("b", { children: ["0x", hover.toString(16).padStart(3, '0')] }), " \u00B7 ", region.name, " ", _jsxs("span", { className: "dim", children: ["(0x", region.start.toString(16), "\u20130x", region.end.toString(16), ")"] })] }) }), _jsx("div", { className: "hexdump", onMouseLeave: () => setHover(null), children: rows }), _jsxs("p", { className: "dim", children: [REGIONS.length, " regions. The first eight bytes belong to the stick: it keeps its own model ID and computes its own checksum, whatever is sent."] })] }));
}
