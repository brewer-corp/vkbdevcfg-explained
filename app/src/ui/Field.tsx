import type { Editor } from '../App';
import { FieldDef, readField, writeField } from '../core/schema';

/** One setting, rendered from its schema entry. Static fields are locked unless experimental mode is on. */
export function Field({ ed, base, def }: { ed: Editor; base: number; def: FieldDef }) {
  const value = readField(ed.block, base, def);
  const before = readField(ed.original, base, def);
  const locked = !ed.canEdit(def.conf);
  const set = (v: number) => ed.edit((b) => writeField(b, base, def, v));
  const max = def.max ?? (1 << def.width) - 1 + (def.offset ?? 0);

  let control;
  if (def.kind === 'bool')
    control = <input type="checkbox" checked={!!value} disabled={locked} onChange={(e) => set(e.target.checked ? 1 : 0)} />;
  else if (def.kind === 'enum')
    control = (
      <select value={value} disabled={locked} onChange={(e) => set(+e.target.value)}>
        {def.options!.slice(0, 1 << def.width).map((o, i) => <option key={i} value={i}>{o}</option>)}
      </select>
    );
  else if (def.kind === 'tenths')
    control = <input type="number" step="0.1" min={0} max={25.5} value={value / 10} disabled={locked}
      onChange={(e) => set(Math.round(+e.target.value * 10))} />;
  else
    control = <input type="number" min={def.min ?? 0} max={max} value={value} disabled={locked}
      onChange={(e) => set(+e.target.value)} />;

  return (
    <label className={`field ${value !== before ? 'changed' : ''} ${locked ? 'locked' : ''}`} title={def.hint}>
      <span>{def.label}{def.conf !== 'verified' && <em className="pill unsure" title="Read from the vendor tool's code; its effect has not been seen on a stick. Locked unless Experimental fields is on.">unverified</em>}</span>
      {control}
    </label>
  );
}
