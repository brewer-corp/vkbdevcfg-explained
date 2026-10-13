import { useRef, useState } from 'react';
import type { Editor } from '../App';
import { DiffRun, loadBlockFile, withFixedCrc, writeRefusal } from '../core/block';
import { hex } from '../core/bytes';
import { regionOf } from '../core/schema';
import type { Transport } from '../core/protocol';
import { Session, applyToStick, asCfg, backupName, download, pickAgain } from '../session';

export function Changes({ session, ed, runs, onReplace, onApplied }: {
  session: Session; ed: Editor; runs: DiffRun[];
  onReplace: (b: Uint8Array) => void; onApplied: (stored: Uint8Array) => void;
}) {
  const [step, setStep] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  // set while a write is waiting for the user to hand the stick back to the page
  const [picked, setPicked] = useState<null | ((t: Transport) => void)>(null);
  const file = useRef<HTMLInputElement>(null);
  const refusal = writeRefusal(session.original, ed.block);
  const canWrite = session.source !== 'file' && runs.length > 0 && !refusal && !step;

  function backup() {
    download(backupName(), asCfg(session.original));
    setBackedUp(true);
  }

  async function apply() {
    setResult(null);
    if (!backedUp) backup();
    try {
      const stored = await applyToStick(session, ed.block, setStep, () => new Promise<Transport>((resolve) => setPicked(() => resolve)));
      onApplied(stored);
      setResult({ ok: true, text: 'Written and verified: the stick now holds this configuration.' });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
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

  return (
    <>
      <section className="panel">
        <h2>{runs.length ? `${runs.reduce((n, r) => n + r.end - r.start + 1, 0)} byte(s) will change` : 'No changes'}</h2>
        {runs.length > 0 && (
          <table className="lines">
            <thead><tr><th>Offset</th><th>Part of</th><th>Now on the stick</th><th>Will become</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.start}>
                  <td className="mono">0x{r.start.toString(16).padStart(3, '0')}{r.end > r.start && `–${r.end.toString(16).padStart(3, '0')}`}</td>
                  <td>{regionOf(r.start).name}</td>
                  <td className="mono dim">{hex(ed.original.subarray(r.start, Math.min(r.end + 1, r.start + 16)))}{r.end - r.start >= 16 && ' …'}</td>
                  <td className="mono">{hex(ed.block.subarray(r.start, Math.min(r.end + 1, r.start + 16)))}{r.end - r.start >= 16 && ' …'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {refusal && <div className="note warn"><b>This cannot be written.</b> {refusal}</div>}
        <div className="row">
          <button className="btn primary" disabled={!canWrite} onClick={apply}>
            {session.source === 'demo' ? 'Write to the demo stick' : 'Write to the stick'}
          </button>
          <button className="btn" disabled={!runs.length || !!step} onClick={() => onReplace(new Uint8Array(session.original))}>Discard changes</button>
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
      </section>

      <section className="panel">
        <h2>Profiles</h2>
        <p className="dim">Profiles are ordinary <code>.cfg</code> files, interchangeable with VKBDevCfg.</p>
        <div className="row">
          <button className="btn" onClick={backup}>Save backup of the stick</button>
          <button className="btn" onClick={() => download('vkb-profile.cfg', asCfg(withFixedCrc(ed.block)))}>Save what is on screen</button>
          <button className="btn" onClick={() => file.current?.click()}>Load a profile…</button>
        </div>
        <input ref={file} type="file" accept=".cfg,.bin" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          try { onReplace(loadBlockFile(new Uint8Array(await f.arrayBuffer()))); setResult({ ok: true, text: `Loaded ${f.name}. Review the changes above before writing.` }); }
          catch (err) { setResult({ ok: false, text: err instanceof Error ? err.message : String(err) }); }
        }} />
      </section>
    </>
  );
}
