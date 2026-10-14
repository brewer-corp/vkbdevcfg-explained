import type { Editor } from '../App';
import { AXIS_SLOTS, HID_USAGES, LOGICAL_AXIS, PHYSICAL_AXIS, inputType, logicalAxisBase,
  physicalAxisBase, physicalAxisUnused, readField } from '../core/schema';
import { CurveEditor } from './CurveEditor';
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
                  {PHYSICAL_AXIS.filter((d) => d.key !== 'eq').map((d) => <Field key={d.key} ed={ed} base={physicalAxisBase(sensor)} def={d} />)}
                  <h3>Response curve</h3>
                  <CurveEditor ed={ed} n={sensor} />
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
