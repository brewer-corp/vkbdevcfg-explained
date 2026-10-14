import { useEffect, useMemo, useRef, useState } from 'react';
import { diffBlocks } from './core/block';
import { browserFit, webHidAvailable } from './core/webhid';
import { Control, wiring } from './core/wiring';
import { Session, connectDemo, connectDevice, grantedSticks, openFile } from './session';
import { LateWrite, Overview } from './ui/Overview';
import { Axes } from './ui/Axes';
import { Buttons } from './ui/Buttons';
import { Leds } from './ui/Leds';
import { BlockMap } from './ui/BlockMap';
import { Changes, Foreign } from './ui/Changes';
import { foreignSigns } from './core/identity';
import { Live, useLive } from './ui/Live';
import { Chart } from './ui/Chart';
import { chartFits } from './core/chart';
import type { Confidence } from './core/schema';

// The chart is the app; the rest are the same settings as tables, for what the chart does not cover.
const TABS = ['Stick', 'Axes', 'Buttons', 'LEDs', 'Live', 'Block'] as const;
type Tab = (typeof TABS)[number];

/** ?tab=axes opens on that tab (used by tests and for deep links). */
function initialTab(): Tab {
  const t = new URLSearchParams(location.search).get('tab');
  return (t && TABS.find((x) => x.toLowerCase().startsWith(t.toLowerCase()))) || 'Stick';
}

/** Passed to every editor: the working block and a way to change it. */
export interface Editor {
  block: Uint8Array;
  original: Uint8Array;
  /** Change the working block. A change to an unverified field (`static`) asks first, once per page load. */
  edit: (mutate: (b: Uint8Array) => void, conf?: Confidence) => void;
  /** The vendor's name for the control on each line (1-based), where it has one. */
  controls: Map<number, Control>;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [block, setBlock] = useState<Uint8Array | null>(null);
  const [tab, setTab] = useState<Tab>('Stick');
  // ?experimental skips the question, for tests
  const [unlocked, setUnlocked] = useState(() => new URLSearchParams(location.search).has('experimental'));
  const [asking, setAsking] = useState<null | ((b: Uint8Array) => void)>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [known, setKnown] = useState<HIDDevice[]>([]);
  const [foreign, setForeign] = useState<Foreign | null>(null);
  const [drawer, setDrawer] = useState<null | 'review' | 'profiles'>(() => (new URLSearchParams(location.search).has('review') ? 'review' : null));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = useLive(session);
  const changes = useMemo(() => (session && block ? diffBlocks(session.original, block) : []), [session, block]);
  const changedBytes = changes.reduce((n, r) => n + r.end - r.start + 1, 0);

  if (!session || !block) {
    const fit = browserFit();
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
          {fit === 'not-chromium' && (
            <div className="note warn"><b>Use Chrome, or a browser built on it: Edge, Opera, Vivaldi or Brave.</b> This one does not
              look like any of them. The tool talks to the stick through WebHID, which Firefox and Safari do not have, and neither
              does any browser on an iPhone or iPad. Opening a profile and the demo still work here.</div>
          )}
          {fit === 'no-webhid' && (
            <div className="note warn"><b>This browser is built on Chrome, but WebHID is missing or switched off.</b> Chrome on
              Android has none, and some browsers turn it off. Use Chrome or Edge on a computer to connect a stick. Opening a
              profile and the demo still work here.</div>
          )}
          {error && <div className="note warn"><b>That did not work.</b> {error}</div>}
          <div className="choices">
            <button className="choice primary" disabled={!webHidAvailable() || !!busy}
              onClick={() => start(() => connectDevice(), 'Reading the stick…')}>
              <b>Connect over USB</b>
              <span>{fit === 'ok' ? 'Pick your stick from the browser’s list.' : webHidAvailable() ? 'Untried in this browser: see above.' : 'Not in this browser: see above.'}</span>
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

  const change = (mutate: (b: Uint8Array) => void) => { const next = new Uint8Array(block); mutate(next); setBlock(next); };
  const editor: Editor = {
    block, original: session.original, controls: wiring(block, session.productId),
    edit: (mutate, conf = 'verified') => (conf === 'verified' || unlocked ? change(mutate) : setAsking(() => mutate)),
  };
  const discard = () => { setBlock(new Uint8Array(session.original)); setForeign(null); };

  const charted = chartFits(editor.controls);

  return (
    <div className="shell">
      <Top />
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <main className={`page ${tab === 'Stick' ? 'wide' : ''}`}>
        {tab === 'Stick' && <>
          <LateWrite session={session} />
          {charted
            ? <Chart session={session} ed={editor} live={live} />
            : <p className="intro">There is no drawing for this hardware yet: the chart covers a Gladiator EVO with an SCG grip.
                Everything is still editable on the other tabs.</p>}
          <Overview session={session} ed={editor} />
        </>}
        {tab === 'Axes' && <Axes ed={editor} />}
        {tab === 'Buttons' && <Buttons ed={editor} live={live} />}
        {tab === 'Live' && <Live ed={editor} live={live} />}
        {tab === 'LEDs' && <Leds ed={editor} />}
        {tab === 'Block' && <BlockMap ed={editor} />}
      </main>
      {/* Review, write, check and profiles live in a drawer over whichever tab is open. It stays mounted while closed:
          a write in progress keeps its state. */}
      <aside className={`drawer ${drawer ? 'open' : ''}`} aria-hidden={!drawer}>
        <div className="drawerhead">
          <b>{changedBytes && drawer !== 'profiles' ? 'Review and write' : 'Profiles'}</b>
          <button className="btn ghost" onClick={() => setDrawer(null)}>Close</button>
        </div>
        <Changes session={session} ed={editor} runs={changes} foreign={foreign} focus={drawer}
          onDiscard={discard}
          onLoad={(name, b) => {
            // Sticks of one family share a type id, so a profile from the other hand's stick loads without complaint.
            const signs = session.source === 'file' ? [] : foreignSigns(session.original, b);
            setBlock(b); setForeign(signs.length ? { name, signs } : null);
          }}
          onApplied={(stored) => { session.original = stored; setSession({ ...session }); setBlock(new Uint8Array(stored)); setForeign(null); }}
          onChecked={() => setSession({ ...session })} />
      </aside>
      {/* what is connected, and what has changed: everything about the stick sits down here, the site's bar on top */}
      <footer className={`applybar ${changedBytes ? 'dirty' : ''}`}>
        <span className="row">
          <span className={`src src-${session.source}`}>{session.source === 'device' ? 'Connected' : session.source === 'demo' ? 'Demo' : 'File'}</span>
          <span className="devname">{session.name}</span>
          <span>
            {changedBytes ? <><b>{changedBytes} byte{changedBytes > 1 ? 's' : ''} changed</b> — nothing is sent until you write.</>
              : session.source === 'file' ? 'Opened from a file.'
              : session.checked?.how === 'write' ? `Written and read back at ${session.checked.at.toLocaleTimeString()}.`
              : 'The stick holds what is on screen.'}
          </span>
          {foreign && <em className="pill warn">from another stick</em>}
        </span>
        <span className="row">
          <button className="btn ghost" onClick={() => { session.transport?.close(); setSession(null); setBlock(null); setDrawer(null); }}>
            {session.source === 'device' ? 'Disconnect' : 'Close'}</button>
          <button className="btn" onClick={() => setDrawer(drawer === 'profiles' ? null : 'profiles')}>Profiles</button>
          {changedBytes > 0 && <button className="btn ghost" onClick={discard}>Discard</button>}
          {changedBytes > 0 && <button className="btn primary" onClick={() => setDrawer(drawer === 'review' ? null : 'review')}>Review &amp; write</button>}
        </span>
      </footer>
      {asking && <Unverified onCancel={() => setAsking(null)} onAccept={() => { setUnlocked(true); change(asking); setAsking(null); }} />}
    </div>
  );
}

const REPO = 'https://github.com/spadaval/vkbdevcfg-explained';

/** The site's own bar, so the tool is one page of the site rather than a dead end. */
function Top() {
  return (
    <header className="topbar">
      <a className="mark" href="../">VKBDevCfg <b>// Explained</b></a>
      <nav>
        <a className="tool here" href="./">Config tool</a>
        <a href="../">Debrief</a>
        <a href="../guide.html">Pilot's guide</a>
        <a className="ext" href={`${REPO}/tree/master/docs`} target="_blank" rel="noopener">Technical docs</a>
        <a className="ext" href={REPO} target="_blank" rel="noopener">Source</a>
      </nav>
    </header>
  );
}

/** Asked before the first change to a field whose meaning was only read out of the vendor's program. */
function Unverified({ onCancel, onAccept }: { onCancel: () => void; onAccept: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [onCancel]);
  return (
    <div className="scrim" onClick={onCancel}>
      <div className="danger" role="alertdialog" aria-modal="true" aria-labelledby="danger-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="danger-title">Unverified setting</h2>
        <p><b>Nobody has changed this setting on a real stick and watched what happens.</b> What it means was worked out from
          VKB’s own program, and that reading could be wrong.</p>
        <p>The stick does not check what it is given. A wrong value can make it misbehave or stop responding, and at worst
          leave it unusable. This tool cannot undo that for you, and nobody here will be able to either.</p>
        <p>A backup of the stick is saved before every write, but a backup only helps while the stick still accepts one.</p>
        <div className="row">
          <button className="btn" autoFocus onClick={onCancel}>Leave it alone</button>
          <button className="btn risky" onClick={onAccept}>I accept the risk: unlock unverified settings</button>
        </div>
        <p className="dim">They stay unlocked until this page is reloaded.</p>
      </div>
    </div>
  );
}
