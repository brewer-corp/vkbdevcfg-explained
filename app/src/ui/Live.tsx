import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../App';
import { AXIS_SLOTS, HID_USAGES, LINES, LOGICAL_AXIS, logicalAxisBase, logicalFunction, physicalEntry, physicalFunction, readField } from '../core/schema';
import type { Session } from '../session';

/** The stick's live input reports: what a game sees (0x01), plus the stick's own view of its lines. */
export interface LiveState {
  axes: number[];
  /** Joystick buttons currently held, 1-based: the output side. */
  buttons: Set<number>;
  /** Up to four hats; 8 = centred. */
  hats: number[];
  /** Lines currently active, 1-based: the input side, before any function is applied. */
  lines: Set<number>;
  shift1: boolean;
  shift2: boolean;
  /** SubSHIFT numbers (1-7) currently active. */
  subShifts: number[];
  /** Lines active after their functions have run (report 0x0C). Null until the stick has sent one. */
  after: Set<number> | null;
  reports: number;
}

const bits128 = (data: Uint8Array, at: number) => {
  const out = new Set<number>();
  for (let i = 0; i < 128; i++) if (data[at + (i >> 3)] & (1 << (i & 7))) out.add(i + 1);
  return out;
};

export function parseInput(data: Uint8Array, reports: number, after: Uint8Array | null = null): LiveState {
  const axes = [...Array(8).keys()].map((i) => data[2 * i] | (data[2 * i + 1] << 8));
  // The report's tail is not padding: 0xA5 at [0x2e] marks it valid, [0x2c..0x2e) holds the shift states and
  // [0x2f..0x3f) is a 128-bit map of active lines (all confirmed on hardware).
  const tail = data[0x2e] === 0xa5;
  const subShifts = tail ? [...Array(6).keys()].filter((i) => data[0x2c] & (4 << i)).map((i) => i + 1).concat(data[0x2d] & 0x80 ? [7] : []) : [];
  return {
    axes, buttons: bits128(data, 16), hats: [0, 1, 2, 3].map((i) => data[32 + 2 * i] & 0x0f),
    lines: tail ? bits128(data, 0x2f) : new Set(), shift1: tail && !!(data[0x2c] & 1), shift2: tail && !!(data[0x2c] & 2), subShifts,
    after: after ? parseAfter(after) : null, reports,
  };
}

/** Report 0x0C, sent whenever a line changes: [0..16) is the line map after each line's function. */
export const parseAfter = (data: Uint8Array) => bits128(data, 0);

/** Subscribe to input reports while a stick is connected; updates at most once per animation frame. */
export function useLive(session: Session | null): LiveState | null {
  const [state, setState] = useState<LiveState | null>(null);
  const latest = useRef<Uint8Array | null>(null);
  const after = useRef<Uint8Array | null>(null);
  const count = useRef(0);
  useEffect(() => {
    setState(null); latest.current = null; after.current = null; count.current = 0;
    const t = session?.transport;
    if (!t?.onInput) return;
    const off = t.onInput((id, data) => {
      if (id === 1) { latest.current = data; count.current++; }
      else if (id === 0x0c) { after.current = data; count.current++; }
    });
    let raf = 0, shown = 0;
    const tick = () => {
      if (latest.current && count.current !== shown) { shown = count.current; setState(parseInput(latest.current, shown, after.current)); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { off(); cancelAnimationFrame(raf); };
    // the transport object is replaced after a restart, so re-subscribe when it changes
  }, [session, session?.transport]);
  return state;
}

const HAT = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

export function Live({ ed, live }: { ed: Editor; live: LiveState | null }) {
  if (!live)
    return <p className="intro">Live input needs a stick connected over USB. Move the stick or press a button if it is connected and nothing shows.</p>;
  const f = (k: string) => LOGICAL_AXIS.find((d) => d.key === k)!;
  // which line sends each button: lines left on auto first, so that explicit entries win
  const lineFor = new Map<number, number>();
  for (const auto of [true, false])
    for (let l = 0; l < LINES; l++) { const fn = logicalFunction(ed.original, l); if (fn.button !== null && fn.auto === auto) lineFor.set(fn.button, l + 1); }
  const named = (line: number) => (ed.controls.has(line) ? `${line} ${ed.controls.get(line)!.name}` : String(line));
  const hats = Math.max(1, Math.min(4, ed.original[0x1e] & 7));
  const wired = (i: number) => physicalFunction(ed.original, i).kind !== 'Button' || ed.original[physicalEntry(i)] !== 0xff || ed.original[physicalEntry(i) + 1] !== 0xff || ed.controls.has(i + 1);
  return (
    <>
      <p className="intro">
        What the stick is sending right now — the same report a game reads. Use it to check a change did
        what you meant: press the control, see which button lights, and which line it comes from.
      </p>
      <section className="panel">
        <h2>Axes <small className="dim">{live.reports} reports</small></h2>
        {live.axes.map((v, i) => {
          const base = logicalAxisBase(i);
          const on = i < AXIS_SLOTS && !!readField(ed.original, base, f('en'));
          const max = (1 << readField(ed.original, base, f('prec'))) - 1 || 4095;
          return (
            <div key={i} className={`bar ${on ? '' : 'off'}`}>
              <span className="name">{i + 1} · {HID_USAGES[readField(ed.original, base, f('usage'))]}</span>
              <span className="track"><i style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></span>
              <span className="mono">{v}</span>
            </div>
          );
        })}
        <div className="bar"><span className="name">{hats > 1 ? 'Hats' : 'Hat'}</span>
          <span className="hat">{live.hats.slice(0, hats).map((h, i) => <span key={i}>{h < 8 ? HAT[h] : '·'} </span>)}</span></div>
        <div className="bar"><span className="name">Shift</span>
          <span><em className={`pill ${live.shift1 ? 'ok' : ''}`}>SHIFT1</em><em className={`pill ${live.shift2 ? 'ok' : ''}`}>SHIFT2</em>
            {live.subShifts.map((n) => <em key={n} className="pill ok">SubSHIFT {n}</em>)}</span></div>
      </section>
      <section className="panel">
        <h2>Lines <small className="dim">{live.lines.size ? `active: ${[...live.lines].map(named).join(', ')}` : 'none active'}</small></h2>
        <p className="dim">The input side: one cell per wired line, lit while its contact is closed — whatever the line is set up to do.
          Press a control to find its line number.{ed.controls.size > 0 && ' Hover a cell for the name VKB gives its control.'}</p>
        <div className="btngrid">
          {[...Array(128).keys()].map((i) => (
            <span key={i} className={`${live.lines.has(i + 1) ? 'on line' : ''} ${wired(i) ? 'mapped' : ''}`}
              title={`line ${named(i + 1)}: ${physicalFunction(ed.original, i).kind}`}>{i + 1}</span>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>After each line’s job <small className="dim">{!live.after ? 'waiting for a change' : live.after.size ? `active: ${[...live.after].join(', ')}` : 'none active'}</small></h2>
        <p className="dim">The same lines once the stick has applied their jobs — a shifted button shows on the line it moved to,
          a toggle as a short pulse. The stick only sends this when something changes, so it stays blank until you press something.</p>
        <div className="btngrid">
          {[...Array(128).keys()].map((i) => <span key={i} className={live.after?.has(i + 1) ? 'on line' : ''}>{i + 1}</span>)}
        </div>
      </section>
      <section className="panel">
        <h2>Buttons sent <small className="dim">{live.buttons.size ? [...live.buttons].map((b) => `button ${b}${lineFor.has(b) ? ` (line ${named(lineFor.get(b)!)})` : ''}`).join(', ') : 'none pressed'}</small></h2>
        <div className="btngrid">
          {[...Array(128).keys()].map((i) => (
            <span key={i} className={`${live.buttons.has(i + 1) ? 'on' : ''} ${lineFor.has(i + 1) ? 'mapped' : ''}`}
              title={lineFor.has(i + 1) ? `sent by line ${named(lineFor.get(i + 1)!)}` : 'not mapped'}>{i + 1}</span>
          ))}
        </div>
      </section>
    </>
  );
}
