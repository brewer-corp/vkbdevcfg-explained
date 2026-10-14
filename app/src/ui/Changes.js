import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { loadBlockFile, withFixedCrc, writeRefusal } from '../core/block';
import { hex } from '../core/bytes';
import { regionOf } from '../core/schema';
import { applyToStick, asCfg, backupName, checkStick, download, pickAgain, profileName } from '../session';
const time = (d) => d.toLocaleTimeString();
export function Changes({ session, ed, runs, foreign, onDiscard, onLoad, onApplied, onChecked }) {
    const [step, setStep] = useState('');
    const [result, setResult] = useState(null);
    const [backedUp, setBackedUp] = useState(false);
    // set while a write is waiting for the user to hand the stick back to the page
    const [picked, setPicked] = useState(null);
    const [anyway, setAnyway] = useState(false);
    const [checking, setChecking] = useState(false);
    const [drift, setDrift] = useState(null);
    const file = useRef(null);
    const refusal = writeRefusal(session.original, ed.block);
    const busy = !!step || checking;
    const canWrite = session.source !== 'file' && runs.length > 0 && !refusal && !busy && (!foreign || anyway);
    useEffect(() => setAnyway(false), [foreign]);
    function backup() {
        download(backupName(session), asCfg(session.original));
        setBackedUp(true);
    }
    async function apply() {
        setResult(null);
        setDrift(null);
        if (!backedUp)
            backup();
        try {
            const stored = await applyToStick(session, ed.block, setStep, () => new Promise((resolve) => setPicked(() => resolve)));
            onApplied(stored);
            setResult({ ok: true, text: 'Written, then read back after the stick restarted: it holds this configuration.' });
        }
        catch (e) {
            setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
            onChecked();
        }
        setStep('');
        setPicked(null);
    }
    async function pick() {
        try {
            const t = await pickAgain(session);
            if (t && picked) {
                setPicked(null);
                picked(t);
            }
        }
        catch (e) {
            setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
        }
    }
    async function check() {
        setChecking(true);
        setResult(null);
        try {
            const r = await checkStick(session);
            setDrift(r.drift.length ? { stored: r.stored, runs: r.drift } : null);
        }
        catch (e) {
            setResult({ ok: false, text: `The stick could not be read: ${e instanceof Error ? e.message : String(e)}` });
        }
        setChecking(false);
        onChecked();
    }
    const c = session.checked;
    return (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel", children: [_jsx("h2", { children: runs.length ? `${runs.reduce((n, r) => n + r.end - r.start + 1, 0)} byte(s) will change` : 'No changes' }), refusal && _jsxs("div", { className: "note warn", children: [_jsx("b", { children: "This cannot be written." }), " ", refusal] }), foreign && !refusal && (_jsxs("div", { className: "note warn", children: [_jsxs("b", { children: [foreign.name, " looks like it came from a different stick."] }), _jsx("ul", { children: foreign.signs.map((s) => _jsx("li", { children: s }, s)) }), "Writing it would make this stick behave like that one, and replace its calibration.", _jsxs("label", { className: "toggle", children: [_jsx("input", { type: "checkbox", checked: anyway, onChange: (e) => setAnyway(e.target.checked) }), " Write it to this stick anyway"] })] })), runs.length > 0 && _jsx(Runs, { runs: runs, was: ed.original, now: ed.block, heads: ['Now on the stick', 'Will become'] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "btn primary", disabled: !canWrite, onClick: apply, children: session.source === 'demo' ? 'Write to the demo stick' : 'Write to the stick' }), _jsx("button", { className: "btn", disabled: !runs.length || busy, onClick: () => { setResult(null); onDiscard(); }, children: "Discard changes" }), session.source === 'file' && _jsx("span", { className: "dim", children: "Opened from a file \u2014 connect a stick to write." })] }), step && !picked && _jsx("p", { className: "busy", children: step }), picked && (_jsxs("div", { className: "note", children: [_jsx("b", { children: "Written \u2014 one more click." }), " The stick accepted the configuration and restarted. The browser only remembers a stick like this one while it stays connected, so it has to be picked again before the result can be read back and checked.", _jsx("div", { className: "row", children: _jsx("button", { className: "btn primary", onClick: pick, children: "Pick the stick again" }) })] })), result && _jsx("div", { className: `note ${result.ok ? 'ok' : 'warn'}`, children: result.text }), canWrite && (_jsxs("p", { className: "dim", children: ["Writing replaces the stick\u2019s whole configuration and restarts it for about three seconds. A backup of the current configuration is downloaded first", backedUp && ' (already saved)', "."] }))] }), session.source !== 'file' && (_jsxs("section", { className: "panel", children: [_jsx("h2", { children: "On the stick" }), c && (_jsxs("p", { className: c.ok ? '' : 'dim', children: [c.how === 'read' && `Read at ${time(c.at)}. Nothing has been written from this page since.`, c.how === 'write' && (c.ok ? `Written and read back at ${time(c.at)}. Every byte matched.` : `Written at ${time(c.at)}, but the read-back did not match.`), c.how === 'check' && (c.ok ? `Checked at ${time(c.at)}: the stick still holds exactly what this page last read or wrote.`
                                : `Checked at ${time(c.at)}: the stick no longer holds what this page last read or wrote.`)] })), drift && (_jsxs("div", { className: "note warn", children: [_jsxs("b", { children: [drift.runs.reduce((n, r) => n + r.end - r.start + 1, 0), " byte(s) on the stick have changed"] }), " since this page last read or wrote it \u2014 by another program, or because a write did not last.", _jsx(Runs, { runs: drift.runs, was: session.original, now: drift.stored, heads: ['This page has', 'On the stick'] }), _jsx("div", { className: "row", children: _jsxs("button", { className: "btn", onClick: () => { const s = drift.stored; setDrift(null); onApplied(s); }, children: ["Use what is on the stick", runs.length > 0 && ' (drops your changes)'] }) })] })), _jsxs("div", { className: "row", children: [_jsx("button", { className: "btn", disabled: busy, onClick: check, children: checking ? 'Reading…' : 'Check the stick now' }), _jsx("span", { className: "dim", children: "Reads the whole configuration again and compares it. Try it after unplugging the stick and plugging it back in." })] })] })), _jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Profiles" }), _jsxs("p", { className: "dim", children: ["Profiles are ordinary ", _jsx("code", { children: ".cfg" }), " files, interchangeable with VKBDevCfg. A profile does not record which stick it came from, so the file names here do."] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "btn", onClick: backup, children: "Save backup of the stick" }), _jsx("button", { className: "btn", onClick: () => download(profileName(session), asCfg(withFixedCrc(ed.block))), children: "Save what is on screen" }), _jsx("button", { className: "btn", disabled: busy, onClick: () => file.current?.click(), children: "Load a profile\u2026" })] }), _jsx("input", { ref: file, type: "file", accept: ".cfg,.bin", hidden: true, onChange: async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f)
                                return;
                            try {
                                onLoad(f.name, loadBlockFile(new Uint8Array(await f.arrayBuffer())));
                                setResult({ ok: true, text: `Loaded ${f.name}. Review the changes above before writing.` });
                            }
                            catch (err) {
                                setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
                            }
                        } })] })] }));
}
function Runs({ runs, was, now, heads }) {
    return (_jsxs("table", { className: "lines", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Offset" }), _jsx("th", { children: "Part of" }), _jsx("th", { children: heads[0] }), _jsx("th", { children: heads[1] })] }) }), _jsx("tbody", { children: runs.map((r) => (_jsxs("tr", { children: [_jsxs("td", { className: "mono", children: ["0x", r.start.toString(16).padStart(3, '0'), r.end > r.start && `–${r.end.toString(16).padStart(3, '0')}`] }), _jsx("td", { children: regionOf(r.start).name }), _jsxs("td", { className: "mono dim", children: [hex(was.subarray(r.start, Math.min(r.end + 1, r.start + 16))), r.end - r.start >= 16 && ' …'] }), _jsxs("td", { className: "mono", children: [hex(now.subarray(r.start, Math.min(r.end + 1, r.start + 16))), r.end - r.start >= 16 && ' …'] })] }, r.start))) })] }));
}
