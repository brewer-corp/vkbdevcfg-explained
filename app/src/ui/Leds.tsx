import type { Editor } from '../App';
import { LED_COLOR_MODES, LED_EVENT_MAX, LED_MODES, ledCss, ledEvent } from '../core/schema';

export function Leds({ ed }: { ed: Editor }) {
  const events = [...Array(LED_EVENT_MAX).keys()].map((i) => ledEvent(ed.block, i)).filter((e) => !e.empty);
  return (
    <>
      <p className="intro">
        An LED event is a rule: <i>when this happens, light that LED like so</i>. Later rules win over earlier ones.
        Read-only for now — these fields have not been confirmed on hardware.
      </p>
      <table className="lines">
        <thead><tr><th>#</th><th>LED</th><th>When</th><th>Colours</th><th>How</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.index}>
              <td className="num">{e.index + 1}</td>
              <td>{e.led === 0 ? 'Base (system)' : `LED ${e.led}`}</td>
              <td><b>{e.typeName}</b>{e.inverted && ' (inverted)'}{e.param ? <span className="dim"> · {e.param}</span> : null}</td>
              <td>
                <span className="swatch" style={{ background: ledCss(e.c1) }} title={`colour 1: ${e.c1.join(' ')}`} />
                <span className="swatch" style={{ background: ledCss(e.c2) }} title={`colour 2: ${e.c2.join(' ')}`} />
              </td>
              <td>{LED_MODES[e.mode]} <span className="dim">· {LED_COLOR_MODES[e.colorMode]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {events.length === 0 && <p className="dim">No LED events are defined.</p>}
    </>
  );
}
