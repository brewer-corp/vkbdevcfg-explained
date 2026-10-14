import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { diffBlocks } from './core/block';
import { webHidAvailable } from './core/webhid';
import { wiring } from './core/wiring';
import { connectDemo, connectDevice, grantedSticks, openFile } from './session';
import { Overview } from './ui/Overview';
import { Axes } from './ui/Axes';
import { Buttons } from './ui/Buttons';
import { Leds } from './ui/Leds';
import { BlockMap } from './ui/BlockMap';
import { Changes } from './ui/Changes';
import { foreignSigns } from './core/identity';
import { Live, useLive } from './ui/Live';
import { Chart } from './ui/Chart';
import { chartFits } from './core/chart';
// The chart is the app; the rest are the same settings as tables, for what the chart does not cover.
const TABS = ['Stick', 'Overview', 'Axes', 'Buttons', 'LEDs', 'Live', 'Block'];
/** ?tab=axes opens on that tab (used by tests and for deep links). */
function initialTab() {
    const t = new URLSearchParams(location.search).get('tab');
    return (t && TABS.find((x) => x.toLowerCase().startsWith(t.toLowerCase()))) || 'Stick';
}
export function App() {
    const [session, setSession] = useState(null);
    const [block, setBlock] = useState(null);
    const [tab, setTab] = useState('Overview');
    const [experimental, setExperimental] = useState(false);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [known, setKnown] = useState([]);
    const [foreign, setForeign] = useState(null);
    const [review, setReview] = useState(() => new URLSearchParams(location.search).has('review'));
    const fileInput = useRef(null);
    useEffect(() => { grantedSticks().then(setKnown).catch(() => { }); }, []);
    async function start(make, what) {
        setError('');
        setBusy(what);
        try {
            const s = await make();
            if (s) {
                setSession(s);
                setBlock(new Uint8Array(s.original));
                setForeign(null);
                setTab(initialTab());
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        setBusy('');
    }
    // Test hook: ?auto connects to a stick this page was already granted, ?demo opens the demo.
    useEffect(() => {
        const q = new URLSearchParams(location.search);
        if (q.has('demo'))
            start(() => connectDemo(q.has('forget')), 'Opening the demo…');
        else if (q.has('auto'))
            grantedSticks().then((d) => d[0] && start(() => connectDevice(d[0]), 'Reading the stick…'));
        if (q.has('experimental'))
            setExperimental(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const live = useLive(session);
    const changes = useMemo(() => (session && block ? diffBlocks(session.original, block) : []), [session, block]);
    const changedBytes = changes.reduce((n, r) => n + r.end - r.start + 1, 0);
    if (!session || !block) {
        return (_jsxs("div", { className: "shell", children: [_jsx(Top, {}), _jsxs("main", { className: "connect", children: [_jsx("p", { className: "eyebrow", children: "An open configuration tool for VKB sticks" }), _jsxs("h1", { children: ["Connect ", _jsx("span", { children: "a stick" })] }), _jsx("p", { className: "lede", children: "Reads the whole configuration straight from the stick, lets you change it, and writes it back. Nothing to install, and no vendor software involved. Reading never changes anything." }), error && _jsxs("div", { className: "note warn", children: [_jsx("b", { children: "That did not work." }), " ", error] }), _jsxs("div", { className: "choices", children: [_jsxs("button", { className: "choice primary", disabled: !webHidAvailable() || !!busy, onClick: () => start(() => connectDevice(), 'Reading the stick…'), children: [_jsx("b", { children: "Connect over USB" }), _jsx("span", { children: webHidAvailable() ? 'Pick your stick from the browser’s list.' : 'Needs Chrome or Edge: this browser has no WebHID.' })] }), known.map((d) => (_jsxs("button", { className: "choice", disabled: !!busy, onClick: () => start(() => connectDevice(d), 'Reading the stick…'), children: [_jsx("b", { children: "Reconnect" }), _jsx("span", { children: d.productName.trim() })] }, d.productId))), _jsxs("button", { className: "choice", disabled: !!busy, onClick: () => fileInput.current?.click(), children: [_jsx("b", { children: "Open a profile" }), _jsxs("span", { children: ["A ", _jsx("code", { children: ".cfg" }), " saved by VKBDevCfg or by this tool. No stick needed."] })] }), _jsxs("button", { className: "choice", disabled: !!busy, onClick: () => start(() => connectDemo(), 'Opening the demo…'), children: [_jsx("b", { children: "Try the demo" }), _jsx("span", { children: "A simulated Gladiator EVO. Safe to break." })] })] }), _jsx("input", { ref: fileInput, type: "file", accept: ".cfg,.bin", hidden: true, onChange: async (e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (f)
                                    start(async () => openFile(f.name, new Uint8Array(await f.arrayBuffer())), 'Opening…');
                            } }), busy && _jsx("p", { className: "busy", children: busy }), _jsxs("p", { className: "fine", children: ["Used on two sticks so far, a Gladiator EVO R and a Gladiator Omni L, both on firmware 2.20.C. On Linux the browser needs permission to the device (a udev rule). ", _jsx("a", { href: "../", children: "How this works, and how we know." })] })] })] }));
    }
    const editor = {
        block, original: session.original, experimental, controls: wiring(block, session.productId),
        edit: (mutate) => { const next = new Uint8Array(block); mutate(next); setBlock(next); },
        canEdit: (conf) => conf === 'verified' || experimental,
    };
    const charted = chartFits(editor.controls);
    return (_jsxs("div", { className: "shell", children: [_jsxs(Top, { children: [_jsx("span", { className: `src src-${session.source}`, children: session.source === 'device' ? 'Connected' : session.source === 'demo' ? 'Demo' : 'File' }), _jsx("span", { className: "devname", children: session.name }), _jsxs("label", { className: "toggle", title: "Allow editing fields whose meaning comes only from reading the vendor tool's code", children: [_jsx("input", { type: "checkbox", checked: experimental, onChange: (e) => setExperimental(e.target.checked) }), "Experimental fields"] }), _jsx("button", { className: "btn ghost", onClick: () => { session.transport?.close(); setSession(null); setBlock(null); }, children: "Disconnect" })] }), _jsx("nav", { className: "tabs", children: TABS.map((t) => (_jsx("button", { className: t === tab ? 'on' : '', onClick: () => setTab(t), children: t }, t))) }), _jsxs("main", { className: `page ${tab === 'Stick' ? 'wide' : ''}`, children: [tab === 'Stick' && (charted
                        ? _jsx(Chart, { session: session, ed: editor, live: live })
                        : _jsx("p", { className: "intro", children: "There is no drawing for this hardware yet: the chart covers a Gladiator EVO with an SCG grip. Everything is still editable on the other tabs." })), tab === 'Overview' && _jsx(Overview, { session: session, ed: editor, go: () => setReview(true), changed: changedBytes }), tab === 'Axes' && _jsx(Axes, { ed: editor }), tab === 'Buttons' && _jsx(Buttons, { ed: editor, live: live }), tab === 'Live' && _jsx(Live, { ed: editor, live: live }), tab === 'LEDs' && _jsx(Leds, { ed: editor }), tab === 'Block' && _jsx(BlockMap, { ed: editor })] }), _jsxs("aside", { className: `drawer ${review ? 'open' : ''}`, "aria-hidden": !review, children: [_jsxs("div", { className: "drawerhead", children: [_jsx("b", { children: changedBytes ? 'Review and write' : 'The stick and its profiles' }), _jsx("button", { className: "btn ghost", onClick: () => setReview(false), children: "Close" })] }), _jsx(Changes, { session: session, ed: editor, runs: changes, foreign: foreign, onDiscard: () => { setBlock(new Uint8Array(session.original)); setForeign(null); }, onLoad: (name, b) => {
                            // Sticks of one family share a type id, so a profile from the other hand's stick loads without complaint.
                            const signs = session.source === 'file' ? [] : foreignSigns(session.original, b);
                            setBlock(b);
                            setForeign(signs.length ? { name, signs } : null);
                        }, onApplied: (stored) => { session.original = stored; setSession({ ...session }); setBlock(new Uint8Array(stored)); setForeign(null); }, onChecked: () => setSession({ ...session }) })] }), _jsxs("footer", { className: `applybar ${changedBytes ? 'dirty' : ''}`, children: [_jsxs("span", { children: [changedBytes ? _jsxs(_Fragment, { children: [_jsxs("b", { children: [changedBytes, " byte", changedBytes > 1 ? 's' : '', " changed"] }), " \u2014 nothing is sent until you write."] })
                                : session.source === 'file' ? 'Opened from a file.'
                                    : session.checked?.how === 'write' ? `Written and read back at ${session.checked.at.toLocaleTimeString()}.`
                                        : 'The stick holds what is on screen.', foreign && _jsx("em", { className: "pill warn", children: "from another stick" })] }), _jsxs("span", { className: "row", children: [changedBytes > 0 && _jsx("button", { className: "btn ghost", onClick: () => { setBlock(new Uint8Array(session.original)); setForeign(null); }, children: "Discard" }), _jsx("button", { className: `btn ${changedBytes ? 'primary' : ''}`, onClick: () => setReview(!review), children: changedBytes ? 'Review & write' : 'Check & profiles' })] })] })] }));
}
function Top({ children }) {
    return (_jsxs("header", { className: "top", children: [_jsxs("a", { className: "mark", href: "../", children: ["VKB ", _jsx("b", { children: "// Config" })] }), _jsx("div", { className: "topright", children: children })] }));
}
