import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../App';
import { DiffRun, loadBlockFile, withFixedCrc, writeRefusal } from '../core/block';
import { hex } from '../core/bytes';
import type { Transport } from '../core/protocol';
import { regionOf } from '../core/schema';
import { Session, applyToStick, asCfg, backupName, checkStick, download, pickAgain, profileName } from '../session';

/** A profile loaded into the editor that does not look like it was saved from the connected stick. */
export interface Foreign { name: string; signs: string[] }

const time = (d: Date) => d.toLocaleTimeString();

export function Changes({ session, ed, runs, foreign, focus, onDiscard, onLoad, onApplied, onChecked }: {
  session: Session; ed: Editor; runs: DiffRun[]; foreign: Foreign | null;
  /** Which part the drawer was opened for: "profiles" scrolls to them. */
  focus: null | 'review' | 'profiles';
  onDiscard: () => void; onLoad: (name: string, b: Uint8Array) => void;
  /** The stick now holds `stored`: take it as both the stored and the edited configuration. */
  onApplied: (stored: Uint8Array) => void;
  /** The session's check record changed. */
  onChecked: () => void;
}) {
  const [step, setStep] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  // set while a write is waiting for the user to hand the stick back to the page
  const [picked, setPicked] = useState<null | ((t: Transport) => void)>(null);
  const [anyway, setAnyway] = useState(false);
  const [checking, setChecking] = useState(false);
  const [drift, setDrift] = useState<{ stored: Uint8Array; runs: DiffRun[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const profiles = useRef<HTMLElement>(null);
  const refusal = writeRefusal(session.original, ed.block);
  const busy = !!step || checking;
  const canWrite = session.source !== 'file' && runs.length > 0 && !refusal && !busy && (!foreign || anyway);

  useEffect(() => setAnyway(false), [foreign]);
  useEffect(() => { if (focus === 'profiles') profiles.current?.scrollIntoView({ block: 'start' }); }, [focus]);

  function backup() {
    download(backupName(session), asCfg(session.original));
    setBackedUp(true);
  }

  async function apply() {
    setResult(null); setDrift(null);
    if (!backedUp) backup();
    try {
      const stored = await applyToStick(session, ed.block, setStep, () => new Promise<Transport>((resolve) => setPicked(() => resolve)));
      onApplied(stored);
      setResult({ ok: true, text: 'Written, then read back after the stick restarted: it holds this configuration.' });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
      onChecked();
    }
    setStep(''); setPicked(null);
  }

  async function pick() {
    try {
      const t = await pickAgain(session);
      if (t && picked) { setPicked(null); picked(t); }
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  async function check() {
    setChecking(true); setResult(null);
    try {
      const r = await checkStick(session);
      setDrift(r.drift.length ? { stored: r.stored, runs: r.drift } : null);
    } catch (e) {
      setResult({ ok: false, text: `The stick could not be read: ${e instanceof Error ? e.message : String(e)}` });
    }
    setChecking(false); onChecked();
  }

  const c = session.checked;
  // nothing to review and nothing going on: the drawer is only for the stick and its profiles
  const quiet = !runs.length && !refusal && !foreign && !step && !picked && !result;
  return (
    <>
      {!quiet && <section className="panel">
        <h2>{runs.length ? `${runs.reduce((n, r) => n + r.end - r.start + 1, 0)} byte(s) will change` : 'No changes'}</h2>
        {/* warnings first: a long list of changes must not push them out of sight */}
        {refusal && <div className="note warn"><b>This cannot be written.</b> {refusal}</div>}
        {foreign && !refusal && (
          <div className="note warn">
            <b>{foreign.name} looks like it came from a different stick.</b>
            <ul>{foreign.signs.map((s) => <li key={s}>{s}</li>)}</ul>
            Writing it would make this stick behave like that one, and replace its calibration.
            <label className="toggle"><input type="checkbox" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} /> Write it to this stick anyway</label>
          </div>
        )}
        {runs.length > 0 && <Runs runs={runs} was={ed.original} now={ed.block} heads={['Now on the stick', 'Will become']} />}
        <div className="row">
          <button className="btn primary" disabled={!canWrite} onClick={apply}>
            {session.source === 'demo' ? 'Write to the demo stick' : 'Write to the stick'}
          </button>
          <button className="btn" disabled={!runs.length || busy} onClick={() => { setResult(null); onDiscard(); }}>Discard changes</button>
          {session.source === 'file' && <span className="dim">Opened from a file — connect a stick to write.</span>}
        </div>
        {step && !picked && <p className="busy">{step}</p>}
        {picked && (
          <div className="note">
            <b>Written — one more click.</b> The stick accepted the configuration and restarted. The browser only
            remembers a stick like this one while it stays connected, so it has to be picked again before the result
            can be read back and checked.
            <div className="row"><button className="btn primary" onClick={pick}>Pick the stick again</button></div>
          </div>
        )}
        {result && <div className={`note ${result.ok ? 'ok' : 'warn'}`}>{result.text}</div>}
        {canWrite && (
          <p className="dim">
            Writing replaces the stick’s whole configuration and restarts it for about three seconds.
            A backup of the current configuration is downloaded first{backedUp && ' (already saved)'}.
          </p>
        )}
      </section>}

      {session.source !== 'file' && (
        <section className="panel">
          <h2>On the stick</h2>
          {c && (
            <p className={c.ok ? '' : 'dim'}>
              {c.how === 'read' && `Read at ${time(c.at)}. Nothing has been written from this page since.`}
              {c.how === 'write' && (c.ok ? `Written and read back at ${time(c.at)}. Every byte matched.` : `Written at ${time(c.at)}, but the read-back did not match.`)}
              {c.how === 'check' && (c.ok ? `Checked at ${time(c.at)}: the stick still holds exactly what this page last read or wrote.`
                : `Checked at ${time(c.at)}: the stick no longer holds what this page last read or wrote.`)}
            </p>
          )}
          {drift && (
            <div className="note warn">
              <b>{drift.runs.reduce((n, r) => n + r.end - r.start + 1, 0)} byte(s) on the stick have changed</b> since this page last read or
              wrote it — by another program, or because a write did not last.
              <Runs runs={drift.runs} was={session.original} now={drift.stored} heads={['This page has', 'On the stick']} />
              <div className="row">
                <button className="btn" onClick={() => { const s = drift.stored; setDrift(null); onApplied(s); }}>
                  Use what is on the stick{runs.length > 0 && ' (drops your changes)'}
                </button>
              </div>
            </div>
          )}
          <div className="row">
            <button className="btn" disabled={busy} onClick={check}>{checking ? 'Reading…' : 'Check the stick now'}</button>
            <span className="dim">Reads the whole configuration again and compares it. Try it after unplugging the stick and plugging it back in.</span>
          </div>
        </section>
      )}

      <section className="panel" ref={profiles}>
        <h2>Profiles</h2>
        <p className="dim">Profiles are ordinary <code>.cfg</code> files, interchangeable with VKBDevCfg. A profile does not record which
          stick it came from, so the file names here do.</p>
        <div className="row">
          <button className="btn" onClick={backup}>Save backup of the stick</button>
          <button className="btn" onClick={() => download(profileName(session), asCfg(withFixedCrc(ed.block)))}>Save what is on screen</button>
          <button className="btn" disabled={busy} onClick={() => file.current?.click()}>Load a profile…</button>
        </div>
        <input ref={file} type="file" accept=".cfg,.bin" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          try { onLoad(f.name, loadBlockFile(new Uint8Array(await f.arrayBuffer()))); setResult({ ok: true, text: `Loaded ${f.name}. Review the changes above before writing.` }); }
          catch (err) { setResult({ ok: false, text: err instanceof Error ? err.message : String(err) }); }
        }} />
      </section>
    </>
  );
}

function Runs({ runs, was, now, heads }: { runs: DiffRun[]; was: Uint8Array; now: Uint8Array; heads: [string, string] }) {
  return (
    <table className="lines">
      <thead><tr><th>Offset</th><th>Part of</th><th>{heads[0]}</th><th>{heads[1]}</th></tr></thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.start}>
            <td className="mono">0x{r.start.toString(16).padStart(3, '0')}{r.end > r.start && `–${r.end.toString(16).padStart(3, '0')}`}</td>
            <td>{regionOf(r.start).name}</td>
            <td className="mono dim">{hex(was.subarray(r.start, Math.min(r.end + 1, r.start + 16)))}{r.end - r.start >= 16 && ' …'}</td>
            <td className="mono">{hex(now.subarray(r.start, Math.min(r.end + 1, r.start + 16)))}{r.end - r.start >= 16 && ' …'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
