import { useRef } from 'react';
import type { Editor } from '../App';
import { CURVE_PRESETS, curveOutput, curvePoints, curveState, setCurvePoint, setCurveShape } from '../core/curve';
import { CURVE_POINTS } from '../core/schema';

/**
 * A response curve for physical axis `n`: pick a shape, tune how strong it is, or drag the dots.
 * The graph is input (across) against output (up); the dotted line is no curve at all.
 */
export function CurveEditor({ ed, n }: { ed: Editor; n: number }) {
  const now = curveState(ed.block, n), was = curveState(ed.original, n);
  const svg = useRef<SVGSVGElement>(null);
  const shown = now.on ? now.points : curvePoints(0);
  const path = (pts: number[]) => 'M0,100 ' + [...Array(51).keys()].slice(1).map((i) => `L${i * 2},${100 - curveOutput(pts, i / 50) * 100}`).join(' ');
  const preset = CURVE_PRESETS.find((p) => p.shape === now.shape);

  const drag = (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    const box = svg.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => ed.edit((b) => setCurvePoint(b, n, i, Math.max(0, Math.min(1, 1 - (ev.clientY - box.top) / box.height))));
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
    e.preventDefault();
  };

  return (
    <div className="curve">
      <label className="ifield"><span>Response</span>
        <select value={preset ? preset.shape : now.shape === null ? 'custom' : now.shape}
          onChange={(e) => e.target.value !== 'custom' && ed.edit((b) => setCurveShape(b, n, +e.target.value))}>
          {CURVE_PRESETS.map((p) => <option key={p.shape} value={p.shape}>{p.name}</option>)}
          {!preset && now.shape !== null && <option value={now.shape}>{now.shape > 0 ? 'Soft' : 'Sharp'} centre, {Math.abs(now.shape)} %</option>}
          {now.shape === null && <option value="custom">Custom</option>}
        </select></label>
      <label className="ifield" title="Left: more sensitive around the centre. Right: less sensitive around the centre. Full travel always gives full output.">
        <span>Sharper – softer</span>
        <input type="range" min={-100} max={100} step={5} value={now.shape ?? 0}
          onChange={(e) => ed.edit((b) => setCurveShape(b, n, +e.target.value))} /></label>
      <svg ref={svg} viewBox="-4 -4 108 108" preserveAspectRatio="none">
        <rect className="frame" x="0" y="0" width="100" height="100" />
        <path className="grid" d="M0,50 H100 M50,0 V100" />
        <path className="straight" d="M0,100 L100,0" />
        {was.on !== now.on || was.points.some((v, i) => v !== now.points[i]) ? <path className="was" d={path(was.on ? was.points : curvePoints(0))} /> : null}
        <path className="now" d={path(shown)} />
        {shown.map((_, i) => {
          const x = ((i + 1) / CURVE_POINTS) * 100;
          return <circle key={i} className="dot" cx={x} cy={100 - curveOutput(shown, (i + 1) / CURVE_POINTS) * 100} r={2.6} onPointerDown={drag(i)} />;
        })}
      </svg>
      <p className="dim small">Across: how far the axis is moved. Up: what the PC gets. Drag a dot to shape it by hand.</p>
    </div>
  );
}
