import type { Editor } from '../App';
import { AXIS_SLOTS, CURVE_POINTS, HID_USAGES, LOGICAL_AXIS, PHYSICAL_AXIS, curveBase, inputType, logicalAxisBase,
  physicalAxisBase, physicalAxisUnused, readField } from '../core/schema';
import { Field } from './Field';

export function Axes({ ed }: { ed: Editor }) {
  const f = (k: string) => LOGICAL_AXIS.find((d) => d.key === k)!;
  return (
    <>
      <p className="intro">
        Each axis has two halves. The <b>sensor</b> is the hardware: how it is filtered and calibrated.
        The <b>output</b> is what the PC sees: which sensor feeds it, what it is called, its deadzones.
      </p>
      <div className="cards">
        {[...Array(AXIS_SLOTS).keys()].map((n) => {
          const lb = logicalAxisBase(n);
          const src = readField(ed.block, lb, f('src')) - 1;
          const on = !!readField(ed.block, lb, f('en'));
          const sensor = src < AXIS_SLOTS ? src : n;
          return (
            <section key={n} className={`panel axis ${on ? '' : 'off'}`}>
              <h2><span className="n">{n + 1}</span>{HID_USAGES[readField(ed.block, lb, f('usage'))]}
                {!on && <em className="pill">disabled</em>}</h2>
              <div className="cols">
                <div>
                  <h3>Output</h3>
                  {LOGICAL_AXIS.map((d) => <Field key={d.key} ed={ed} base={lb} def={d} />)}
                </div>
                <div>
                  <h3>Sensor {sensor + 1} <small>{physicalAxisUnused(ed.block, sensor) ? 'no sensor fitted' : inputType(ed.block, sensor)}</small></h3>
                  {PHYSICAL_AXIS.map((d) => <Field key={d.key} ed={ed} base={physicalAxisBase(sensor)} def={d} />)}
                  <Curve ed={ed} n={sensor} />
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/** A response curve: ten points, one per 10 % of travel. 0x80 means output = input. */
function Curve({ ed, n }: { ed: Editor; n: number }) {
  const at = curveBase(n);
  const pts = [...ed.block.subarray(at, at + CURVE_POINTS)];
  const y = (x: number, v: number) => Math.min(1, (x * v) / 128);
  const path = (vals: number[]) => 'M0,100 ' + vals.map((v, i) => `L${(i + 1) * 10},${100 - y((i + 1) / 10, v) * 100}`).join(' ');
  const locked = !ed.canEdit('verified');   // curve points and the enable bit were confirmed on hardware
  return (
    <div className="curve">
      <h3>Response curve</h3>
      <svg viewBox="-2 -2 104 104" preserveAspectRatio="none">
        <path className="grid" d="M0,100 L100,0 M0,50 H100 M50,0 V100" />
        <rect className="frame" x="0" y="0" width="100" height="100" />
        <path className="was" d={path([...ed.original.subarray(at, at + CURVE_POINTS)])} />
        <path className="now" d={path(pts)} />
      </svg>
      {!locked && (
        <div className="pts">
          {pts.map((v, i) => (
            <input key={i} type="range" min={0} max={255} value={v}
              title={`${(i + 1) * 10} % of travel: ${v}`}
              onChange={(e) => ed.edit((b) => { b[at + i] = +e.target.value; })} />
          ))}
        </div>
      )}
    </div>
  );
}
