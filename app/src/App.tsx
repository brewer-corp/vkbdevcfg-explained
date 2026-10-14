import { useEffect, useMemo, useRef, useState } from 'react';
import { diffBlocks } from './core/block';
import { webHidAvailable } from './core/webhid';
import { Control, wiring } from './core/wiring';
import { Session, connectDemo, connectDevice, grantedSticks, openFile } from './session';
import { Overview } from './ui/Overview';
import { Axes } from './ui/Axes';
import { Buttons } from './ui/Buttons';
import { Leds } from './ui/Leds';
import { BlockMap } from './ui/BlockMap';
import { Changes, Foreign } from './ui/Changes';
import { foreignSigns } from './core/identity';
import { Live, useLive } from './ui/Live';
import { Chart } from './ui/Chart';
import { chartFits } from './core/chart';

// The chart is the app; the rest are the same settings as tables, for what the chart does not cover.
const TABS = ['Stick', 'Overview', 'Axes', 'Buttons', 'LEDs', 'Live', 'Block'] as const;
type Tab = (typeof TABS)[number];

/** ?tab=axes opens on that tab (used by tests and for deep links). */
function initialTab(): Tab {
  const t = new URLSearchParams(location.search).get('tab');
  return (t && TABS.find((x) => x.toLowerCase().startsWith(t.toLowerCase()))) || 'Stick';
}

/** Passed to every editor: the working block, a way to change it, and whether a field may be edited. */
export interface Editor {
  block: Uint8Array;
  original: Uint8Array;
  edit: (mutate: (b: Uint8Array) => void) => void;
  canEdit: (conf: 'verified' | 'static') => boolean;
  experimental: boolean;
  /** The vendor's name for the control on each line (1-based), where it has one. */
  controls: Map<number, Control>;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [block, setBlock] = useState<Uint8Array | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [experimental, setExperimental] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [known, setKnown] = useState<HIDDevice[]>([]);
  const [foreign, setForeign] = useState<Foreign | null>(null);
  const [review, setReview] = useState(() => new URLSearchParams(location.search).has('review'));
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { grantedSticks().then(setKnown).catch(() => {}); }, []);

  async function start(make: () => Promise<Session | null>, what: string) {
    setError(''); setBusy(what);
    try {
      const s = await make();
      if (s) { setSession(s); setBlock(new Uint8Array(s.original)); setForeign(null); setTab(initialTab()); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy('');
  }

  // Test hook: ?auto connects to a stick this page was already granted, ?demo opens the demo.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.has('demo')) start(() => connectDemo(q.has('forget')), 'Opening the demo…');
    else if (q.has('auto')) grantedSticks().then((d) => d[0] && start(() => connectDevice(d[0]), 'Reading the stick…'));
    if (q.has('experimental')) setExperimental(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = useLive(session);
  const changes = useMemo(() => (session && block ? diffBlocks(session.original, block) : []), [session, block]);
  const changedBytes = changes.reduce((n, r) => n + r.end - r.start + 1, 0);

  if (!session || !block) {
    return (
      <div className="shell">
        <Top />
        <main className="connect">
          <p className="eyebrow">An open configuration tool for VKB sticks</p>
          <h1>Connect <span>a stick</span></h1>
          <p className="lede">
            Reads the whole configuration straight from the stick, lets you change it, and writes it back.
            Nothing to install, and no vendor software involved. Reading never changes anything.
          </p>
          {error && <div className="note warn"><b>That did not work.</b> {error}</div>}
          <div className="choices">
            <button className="choice primary" disabled={!webHidAvailable() || !!busy}
              onClick={() => start(() => connectDevice(), 'Reading the stick…')}>
              <b>Connect over USB</b>
              <span>{webHidAvailable() ? 'Pick your stick from the browser’s list.' : 'Needs Chrome or Edge: this browser has no WebHID.'}</span>
            </button>
            {known.map((d) => (
              <button key={d.productId} className="choice" disabled={!!busy}
                onClick={() => start(() => connectDevice(d), 'Reading the stick…')}>
                <b>Reconnect</b><span>{d.productName.trim()}</span>
              </button>
            ))}
            <button className="choice" disabled={!!busy} onClick={() => fileInput.current?.click()}>
              <b>Open a profile</b><span>A <code>.cfg</code> saved by VKBDevCfg or by this tool. No stick needed.</span>
            </button>
            <button className="choice" disabled={!!busy} onClick={() => start(() => connectDemo(), 'Opening the demo…')}>
              <b>Try the demo</b><span>A simulated Gladiator EVO. Safe to break.</span>
            </button>
          </div>
          <input ref={fileInput} type="file" accept=".cfg,.bin" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (f) start(async () => openFile(f.name, new Uint8Array(await f.arrayBuffer())), 'Opening…');
          }} />
          {busy && <p className="busy">{busy}</p>}
          <p className="fine">
            Used on two sticks so far, a Gladiator EVO R and a Gladiator Omni L, both on firmware 2.20.C. On Linux the browser needs
            permission to the device (a udev rule). <a href="../">How this works, and how we know.</a>
          </p>
        </main>
      </div>
    );
  }

  const editor: Editor = {
    block, original: session.original, experimental, controls: wiring(block, session.productId),
    edit: (mutate) => { const next = new Uint8Array(block); mutate(next); setBlock(next); },
    canEdit: (conf) => conf === 'verified' || experimental,
  };

  const charted = chartFits(editor.controls);

  return (
    <div className="shell">
      <Top>
        <span className={`src src-${session.source}`}>{session.source === 'device' ? 'Connected' : session.source === 'demo' ? 'Demo' : 'File'}</span>
        <span className="devname">{session.name}</span>
        <label className="toggle" title="Allow editing fields whose meaning comes only from reading the vendor tool's code">
          <input type="checkbox" checked={experimental} onChange={(e) => setExperimental(e.target.checked)} />
          Experimental fields
        </label>
        <button className="btn ghost" onClick={() => { session.transport?.close(); setSession(null); setBlock(null); }}>Disconnect</button>
      </Top>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <main className={`page ${tab === 'Stick' ? 'wide' : ''}`}>
        {tab === 'Stick' && (charted
          ? <Chart session={session} ed={editor} live={live} />
          : <p className="intro">There is no drawing for this hardware yet: the chart covers a Gladiator EVO with an SCG grip.
              Everything is still editable on the other tabs.</p>)}
        {tab === 'Overview' && <Overview session={session} ed={editor} go={() => setReview(true)} changed={changedBytes} />}
        {tab === 'Axes' && <Axes ed={editor} />}
        {tab === 'Buttons' && <Buttons ed={editor} live={live} />}
        {tab === 'Live' && <Live ed={editor} live={live} />}
        {tab === 'LEDs' && <Leds ed={editor} />}
        {tab === 'Block' && <BlockMap ed={editor} />}
      </main>
      {/* Review, write, check and profiles live in a drawer over whichever tab is open. It stays mounted while closed:
          a write in progress keeps its state. */}
      <aside className={`drawer ${review ? 'open' : ''}`} aria-hidden={!review}>
        <div className="drawerhead">
          <b>{changedBytes ? 'Review and write' : 'The stick and its profiles'}</b>
          <button className="btn ghost" onClick={() => setReview(false)}>Close</button>
        </div>
        <Changes session={session} ed={editor} runs={changes} foreign={foreign}
          onDiscard={() => { setBlock(new Uint8Array(session.original)); setForeign(null); }}
          onLoad={(name, b) => {
            // Sticks of one family share a type id, so a profile from the other hand's stick loads without complaint.
            const signs = session.source === 'file' ? [] : foreignSigns(session.original, b);
            setBlock(b); setForeign(signs.length ? { name, signs } : null);
          }}
          onApplied={(stored) => { session.original = stored; setSession({ ...session }); setBlock(new Uint8Array(stored)); setForeign(null); }}
          onChecked={() => setSession({ ...session })} />
      </aside>
      <footer className={`applybar ${changedBytes ? 'dirty' : ''}`}>
        <span>
          {changedBytes ? <><b>{changedBytes} byte{changedBytes > 1 ? 's' : ''} changed</b> — nothing is sent until you write.</>
            : session.source === 'file' ? 'Opened from a file.'
            : session.checked?.how === 'write' ? `Written and read back at ${session.checked.at.toLocaleTimeString()}.`
            : 'The stick holds what is on screen.'}
          {foreign && <em className="pill warn">from another stick</em>}
        </span>
        <span className="row">
          {changedBytes > 0 && <button className="btn ghost" onClick={() => { setBlock(new Uint8Array(session.original)); setForeign(null); }}>Discard</button>}
          <button className={`btn ${changedBytes ? 'primary' : ''}`} onClick={() => setReview(!review)}>{changedBytes ? 'Review & write' : 'Check & profiles'}</button>
        </span>
      </footer>
    </div>
  );
}

function Top({ children }: { children?: React.ReactNode }) {
  return (
    <header className="top">
      <a className="mark" href="../">VKB <b>// Config</b></a>
      <div className="topright">{children}</div>
    </header>
  );
}
