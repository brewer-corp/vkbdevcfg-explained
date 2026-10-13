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
import { Changes } from './ui/Changes';
import { Live, useLive } from './ui/Live';

const TABS = ['Overview', 'Axes', 'Buttons', 'LEDs', 'Live', 'Block', 'Review & apply'] as const;
type Tab = (typeof TABS)[number];

/** ?tab=axes opens on that tab (used by tests and for deep links). */
function initialTab(): Tab {
  const t = new URLSearchParams(location.search).get('tab');
  return (t && TABS.find((x) => x.toLowerCase().startsWith(t.toLowerCase()))) || 'Overview';
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
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { grantedSticks().then(setKnown).catch(() => {}); }, []);

  async function start(make: () => Promise<Session | null>, what: string) {
    setError(''); setBusy(what);
    try {
      const s = await make();
      if (s) { setSession(s); setBlock(new Uint8Array(s.original)); setTab(initialTab()); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy('');
  }

  // Test hook: ?auto connects to a stick this page was already granted, ?demo opens the demo.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.has('demo')) start(connectDemo, 'Opening the demo…');
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
            <button className="choice" disabled={!!busy} onClick={() => start(connectDemo, 'Opening the demo…')}>
              <b>Try the demo</b><span>A simulated Gladiator EVO. Safe to break.</span>
            </button>
          </div>
          <input ref={fileInput} type="file" accept=".cfg,.bin" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (f) start(async () => openFile(f.name, new Uint8Array(await f.arrayBuffer())), 'Opening…');
          }} />
          {busy && <p className="busy">{busy}</p>}
          <p className="fine">
            Verified on one model and firmware: a Gladiator EVO at 2.20.C. On Linux the browser needs
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
            {t}{t === 'Review & apply' && changedBytes > 0 && <i>{changedBytes}</i>}
          </button>
        ))}
      </nav>
      <main className="page">
        {tab === 'Overview' && <Overview session={session} ed={editor} go={() => setTab('Review & apply')} changed={changedBytes} />}
        {tab === 'Axes' && <Axes ed={editor} />}
        {tab === 'Buttons' && <Buttons ed={editor} live={live} />}
        {tab === 'Live' && <Live ed={editor} live={live} />}
        {tab === 'LEDs' && <Leds ed={editor} />}
        {tab === 'Block' && <BlockMap ed={editor} />}
        {tab === 'Review & apply' && (
          <Changes session={session} ed={editor} runs={changes}
            onReplace={(b) => setBlock(b)}
            onApplied={(stored) => { session.original = stored; setSession({ ...session }); setBlock(new Uint8Array(stored)); }} />
        )}
      </main>
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
