import { useState } from 'react';
import type { Editor } from '../App';
import { blockCrcOk, firmwareText, typeId } from '../core/block';
import { AXIS_SLOTS, HID_USAGES, LED_EVENT_MAX, LINES, LOGICAL_AXIS, extDevice, ledEvent, logicalAxisBase,
  logicalFunction, readField } from '../core/schema';
import { Session, forgetUnchecked } from '../session';
import { extRegisters } from '../core/wiring';

export function Overview({ session, ed, go, changed }: { session: Session; ed: Editor; go: () => void; changed: number }) {
  const b = ed.block;
  const f = (k: string) => LOGICAL_AXIS.find((d) => d.key === k)!;
  const axes = [...Array(AXIS_SLOTS).keys()].filter((n) => readField(b, logicalAxisBase(n), f('en')))
    .map((n) => HID_USAGES[readField(b, logicalAxisBase(n), f('usage'))]);
  const buttons = [...Array(LINES).keys()].filter((l) => { const f = logicalFunction(b, l); return f.button !== null && !f.auto; }).length;
  const leds = [...Array(LED_EVENT_MAX).keys()].filter((i) => !ledEvent(b, i).empty).length;
  const ext = [...Array(8).keys()].map((i) => extDevice(b, i)).filter((d) => d.type !== 0);

  const [late, setLate] = useState(session.late);
  return (
    <>
      {late && (
        <div className={`note ${late.ok ? 'ok' : 'warn'}`}>
          {late.ok
            ? <><b>The earlier write lasted.</b> A configuration written at {late.writtenAt.toLocaleTimeString()} was never read back at the time. This stick holds it.</>
            : <><b>An earlier write is unaccounted for.</b> A configuration written at {late.writtenAt.toLocaleTimeString()} was never read back, and this
                stick does not hold it. If this is a different stick, connect the one you wrote to. Otherwise the write did not last.
                <div className="row"><button className="btn" onClick={() => { forgetUnchecked(); setLate(undefined); }}>Dismiss</button></div></>}
        </div>
      )}
      <div className="stats">
        <Stat k="Model type" v={`0x${typeId(b).toString(16)}`} />
        {session.productId !== undefined && <Stat k="USB ID" v={`231d:${session.productId.toString(16).padStart(4, '0')}`} />}
        <Stat k="Firmware" v={firmwareText(b)} />
        <Stat k="Checksum" v={blockCrcOk(ed.original) ? 'OK' : 'BAD'} bad={!blockCrcOk(ed.original)} />
        <Stat k="Axes in use" v={String(axes.length)} />
        <Stat k="Buttons mapped" v={String(buttons)} />
        <Stat k="LED events" v={String(leds)} />
      </div>

      <section className="panel">
        <h2>What this stick is set up to do</h2>
        <p><b>Axes:</b> {axes.join(' · ') || 'none enabled'}</p>
        <p><b>Attached:</b> {ext.length ? ext.map((d) => { const r = extRegisters(b, d.index); return `${d.name} (lines ${8 * (r.first - 1) + 1}–${8 * (r.first - 1 + r.count)}, ${d.leds} LEDs)`; }).join(' · ') : 'no grip or module records'}</p>
        <p><b>Source:</b> {session.source === 'device' ? 'read from the stick over USB' : session.source === 'demo' ? 'a simulated stick' : `the file ${session.name}`}</p>
      </section>

      <section className="panel">
        <h2>How editing works here</h2>
        <ol>
          <li>Change settings on the other tabs. Nothing is sent while you edit.</li>
          <li><b>Review &amp; apply</b> shows exactly which bytes will change, saves a backup, and writes once.</li>
          <li>The stick restarts for about three seconds, then the tool reads it back to check.</li>
        </ol>
        <p className="dim">
          Fields marked <em className="pill ok">verified</em> have been changed on a real stick and read back.
          Everything else comes from reading the vendor tool’s code and is locked unless you turn on
          <b> Experimental fields</b>. The stick does not check what it is given — this tool is the only guard.
        </p>
        {changed > 0 && <button className="btn" onClick={go}>Review {changed} changed byte{changed > 1 ? 's' : ''}</button>}
      </section>
    </>
  );
}

function Stat({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return <div className={`stat ${bad ? 'bad' : ''}`}><div className="v">{v}</div><div className="k">{k}</div></div>;
}
