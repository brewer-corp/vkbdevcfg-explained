import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../App';
import { AXIS_SLOTS, HID_USAGES, LINES, LOGICAL_AXIS, logicalAxisBase, logicalFunction, physicalEntry, physicalFunction, readField } from '../core/schema';
import type { Session } from '../session';

/** The stick's live input report (id 0x01): what a game sees, plus the stick's own view of its lines. */
export interface LiveState {
  axes: number[];
  /** Joystick buttons currently held, 1-based: the output side. */
  buttons: Set<number>;
  hat: number;
  /** Lines currently active, 1-based: the input side, before any function is applied. */
  lines: Set<number>;
  shift1: boolean;
  shift2: boolean;
  reports: number;
}

export function parseInput(data: Uint8Array, reports: number): LiveState {
  const axes = [...Array(8).keys()].map((i) => data[2 * i] | (data[2 * i + 1] << 8));
  const buttons = new Set<number>();
  for (let b = 0; b < 128; b++) if (data[16 + (b >> 3)] & (1 << (b & 7))) buttons.add(b + 1);
  // The report's tail is not padding: 0xA5 at [0x2e] marks it valid, [0x2c] holds the shift state and
  // [0x2f..0x3f) is a 128-bit map of active lines (confirmed on hardware with held virtual lines).
  const lines = new Set<number>();
  const tail = data[0x2e] === 0xa5;
  if (tail) for (let l = 0; l < 128; l++) if (data[0x2f + (l >> 3)] & (1 << (l & 7))) lines.add(l + 1);
  return { axes, buttons, hat: data[32] & 0x0f, lines, shift1: tail && !!(data[0x2c] & 1), shift2: tail && !!(data[0x2c] & 2), reports };
}

/** Subscribe to input reports while a stick is connected; updates at most once per animation frame. */
export function useLive(session: Session | null): LiveState | null {
  const [state, setState] = useState<LiveState | null>(null);
  const latest = useRef<Uint8Array | null>(null);
  const count = useRef(0);
  useEffect(() => {
    setState(null); latest.current = null; count.current = 0;
    const t = session?.transport;
    if (!t?.onInput) return;
    const off = t.onInput((id, data) => { if (id === 1) { latest.current = data; count.current++; } });
    let raf = 0, shown = 0;
    const tick = () => {
      if (latest.current && count.current !== shown) { shown = count.current; setState(parseInput(latest.current, shown)); }
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
  const lineFor = new Map<number, number>();
  for (let l = 0; l < LINES; l++) { const b = logicalFunction(ed.original, l).button; if (b !== null) lineFor.set(b, l + 1); }
  const named = (line: number) => (ed.controls.has(line) ? `${line} ${ed.controls.get(line)!.name}` : String(line));
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
        <div className="bar"><span className="name">Hat</span><span className="hat">{live.hat < 8 ? HAT[live.hat] : '·'}</span></div>
        <div className="bar"><span className="name">Shift</span>
          <span><em className={`pill ${live.shift1 ? 'ok' : ''}`}>SHIFT1</em><em className={`pill ${live.shift2 ? 'ok' : ''}`}>SHIFT2</em></span></div>
      </section>
      <section className="panel">
        <h2>Lines <small className="dim">{live.lines.size ? `active: ${[...live.lines].map(named).join(', ')}` : 'none active'}</small></h2>
        <p className="dim">The input side: one cell per wired line, lit while its contact is closed — whatever the line is set up to do.
          Press a control to find its line number.{ed.controls.size > 0 && ' Hover a cell for the name VKB gives its control.'}</p>
        <div className="btngrid">
          {[...Array(128).keys()].map((i) => (
            <span key={i} className={`${live.lines.has(i + 1) ? 'on line' : ''} ${physicalFunction(ed.original, i).kind !== 'Button' || ed.original[physicalEntry(i)] !== 0xff || ed.original[physicalEntry(i) + 1] !== 0xff ? 'mapped' : ''}`}
              title={`line ${named(i + 1)}: ${physicalFunction(ed.original, i).kind}`}>{i + 1}</span>
          ))}
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
