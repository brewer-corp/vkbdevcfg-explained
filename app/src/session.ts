// Everything the UI needs from a stick, behind one small async interface.
// Components never touch WebHID or the protocol directly.
import { blockCrcOk, cfgEncrypt, DiffRun, diffBlocks, loadBlockFile, withFixedCrc, writeRefusal } from './core/block';
import { fromHex, hex } from './core/bytes';
import { MockStick } from './core/mock';
import { STATUS_OK, Stick, Transport, WRITE_STATUS } from './core/protocol';
import { grantedSticks, openGranted, requestStick, WebHidTransport } from './core/webhid';

export type Source = 'device' | 'demo' | 'file';

export interface Session {
  source: Source;
  name: string;
  /** The configuration as last read from the stick (or loaded from a file). */
  original: Uint8Array;
  /** Reopen-and-read, used after the restart that follows a write. Absent for files. */
  transport?: Transport;
  productId?: number;
  /** Demo only: act like a browser that forgets the stick when it restarts. */
  forgets?: boolean;
  /** When the stick's stored configuration was last compared with what this page holds, and how. */
  checked?: Checked;
  /** Set at connect if an earlier write was never read back: whether this stick holds what was written. */
  late?: { ok: boolean; writtenAt: Date };
}

export interface Checked { at: Date; how: 'read' | 'write' | 'check'; ok: boolean }

/**
 * Called when the browser no longer offers the stick after its restart; resolves once the user has picked it again.
 * Chrome keeps a permission across a disconnect only for devices with a USB serial number, and these sticks have none.
 */
export type Repick = () => Promise<Transport>;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function readFrom(transport: Transport): Promise<Uint8Array> {
  const stick = new Stick(transport);
  const block = await stick.readBlock(await stick.readToken());
  if (!blockCrcOk(block)) throw new Error('The configuration read from the stick failed its checksum. Nothing was changed.');
  return block;
}

export async function connectDevice(existing?: HIDDevice): Promise<Session | null> {
  const transport = existing ? await openGranted(existing) : await requestStick();
  if (!transport) return null;
  const original = await readFrom(transport);
  return { source: 'device', name: transport.name, original, transport, productId: transport.productId,
    checked: { at: new Date(), how: 'read', ok: true }, late: settleUnchecked(original) };
}

export async function connectDemo(forgets = false): Promise<Session> {
  const transport = new MockStick({ restartMs: 1500 });
  return { source: 'demo', name: 'Demo stick (nothing real is connected)', original: await readFrom(transport), transport, forgets,
    checked: { at: new Date(), how: 'read', ok: true } };
}

export function openFile(name: string, data: Uint8Array): Session {
  return { source: 'file', name, original: loadBlockFile(data) };
}

export { grantedSticks };

export type Progress = (step: string) => void;

/** Write `next` to the stick, wait out its restart, read it back and compare. Returns the block now stored. */
export async function applyToStick(session: Session, next: Uint8Array, progress: Progress, repick?: Repick): Promise<Uint8Array> {
  if (!session.transport) throw new Error('No stick is connected.');
  const refusal = writeRefusal(session.original, next);
  if (refusal) throw new Error(refusal);
  const wanted = withFixedCrc(next);

  progress('Checking the stick still holds what we read…');
  // Reading first also makes sure the write is not the request straight after READ_CPUID.
  let { stick, token, now } = await withStick(session, async (t) => {
    const stick = new Stick(t), token = await stick.readToken();
    return { stick, token, now: await stick.readBlock(token) };
  });
  if (!sameConfig(now, session.original))
    throw new Error('The stick’s configuration changed since it was read. Read it again before writing.');

  progress('Writing 4096 bytes…');
  const status = await stick.writeBlock(token, wanted);
  if (status !== STATUS_OK)
    throw new Error(`The stick did not accept the configuration (${WRITE_STATUS[status] ?? 'status 0x' + status.toString(16)}). Nothing was changed.`);

  // From here the stick holds something this page has not seen. Remember what, in case the read-back never happens
  // (the tab is closed, the stick is not picked again): the next connect can then say whether the write lasted.
  if (session.source === 'device') noteUnchecked({ wanted, at: Date.now() });
  progress('The stick is restarting…');
  let picked = false;
  session.transport = await reopen(session, progress, repick && (() => { picked = true; return repick(); }));
  adopt(session, session.transport);
  progress('Reading back to verify…');
  stick = new Stick(session.transport);
  token = await stick.readToken();
  const stored = await stick.readBlock(token);
  noteUnchecked(null);
  session.checked = { at: new Date(), how: 'write', ok: sameConfig(stored, wanted) };
  if (!sameConfig(stored, wanted))
    throw new Error(picked
      ? 'The stick that was picked does not hold the new configuration. If you have more than one VKB device, reconnect and pick the one you wrote to; otherwise use your backup to restore it.'
      : 'The stick restarted but does not hold the new configuration. Use your backup to restore it.');
  return stored;
}

/** Equal apart from the device-owned header word. */
export const sameConfig = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.subarray(8).every((x, i) => x === b[8 + i]);

const WRITTEN_UNCHECKED = 'The configuration was written and the stick restarted, but it did not reappear, so the result could not be checked. Reconnect it and compare.';

async function reopen(session: Session, progress: Progress, repick?: Repick): Promise<Transport> {
  const old = session.transport!;
  const ask = () => {
    if (!repick) throw new Error(WRITTEN_UNCHECKED);
    progress('Written. Waiting for the stick to be picked again…');
    return repick();
  };
  if (!(old instanceof WebHidTransport)) {              // the mock
    // It answers for a moment before it goes down, so wait for it to leave first (or to show it is not going to).
    const t0 = Date.now(); let gone = false, back = false;
    while (!back && Date.now() - t0 < 15000) {
      await sleep(100);
      try { await old.receive(); back = gone || Date.now() - t0 > 1000; } catch { gone = true; }
    }
    if (!back) throw new Error('The stick did not come back.');
    return session.forgets ? ask() : old;
  }
  await sleep(1500);
  try { await old.close(); } catch { /* already gone */ }
  // A stick the browser still knows shows up here within about three seconds.
  for (let i = 0; i < 20; i++) {
    const found = (await grantedSticks()).find((d) => d.productId === session.productId);
    if (found) {
      try { return await openGranted(found); } catch { /* not ready yet */ }
    }
    await sleep(300);
  }
  return ask();
}

/** Ask for the stick again after a restart. Must be called from a click; null if the chooser was dismissed. */
export async function pickAgain(session: Session): Promise<Transport | null> {
  return session.source === 'demo' ? session.transport ?? null : requestStick();
}

/**
 * Run `use` against the stick. If that fails the connection may simply be stale — the stick was unplugged, or restarted
 * by another program — so look for it again and retry once: first among the sticks the browser still offers, then by
 * asking the user (which only works from a click).
 */
async function withStick<T>(session: Session, use: (t: Transport) => Promise<T>): Promise<T> {
  if (!session.transport) throw new Error('No stick is connected.');
  try {
    return await use(session.transport);
  } catch (first) {
    let again: Transport | null = null;
    if (session.transport instanceof WebHidTransport) {
      const known = (await grantedSticks()).find((d) => d.productId === session.productId);
      if (known) again = await openGranted(known).catch(() => null);
    }
    if (again) {
      try { const r = await use(again); adopt(session, again); return r; } catch { again = null; }
    }
    again = await pickAgain(session).catch(() => null);
    if (!again || again === session.transport) throw first;
    const r = await use(again);
    adopt(session, again);
    return r;
  }
}

function adopt(session: Session, t: Transport): void {
  session.transport = t;
  if (t instanceof WebHidTransport) { session.productId = t.productId; session.name = t.name; }
}

const readAgain = (session: Session) => withStick(session, readFrom);

/** Read the stick again and compare it with what this page last read or wrote. `drift` is empty when they agree. */
export async function checkStick(session: Session): Promise<{ stored: Uint8Array; drift: DiffRun[] }> {
  const stored = await readAgain(session);
  const drift = diffBlocks(session.original, stored);
  session.checked = { at: new Date(), how: 'check', ok: drift.length === 0 };
  return { stored, drift };
}

// ---------------------------------------------- a write that was never read back ---

const UNCHECKED = 'vkb-config:unchecked-write';
const DAY = 24 * 3600 * 1000;
const store = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

export function noteUnchecked(w: { wanted: Uint8Array; at: number } | null): void {
  try {
    if (w) store()?.setItem(UNCHECKED, JSON.stringify({ at: w.at, wanted: hex(w.wanted, '') }));
    else store()?.removeItem(UNCHECKED);
  } catch { /* storage is a convenience */ }
}

/** If an earlier write was accepted but never read back, say whether `block` is what was written. */
export function settleUnchecked(block: Uint8Array): Session['late'] {
  try {
    const raw = store()?.getItem(UNCHECKED);
    if (!raw) return undefined;
    const { at, wanted } = JSON.parse(raw) as { at: number; wanted: string };
    if (Date.now() - at > DAY) { noteUnchecked(null); return undefined; }
    const ok = sameConfig(block, fromHex(wanted));
    if (ok) noteUnchecked(null);                         // settled; a mismatch may just be a different stick, so keep it
    return { ok, writtenAt: new Date(at) };
  } catch { return undefined; }
}

export const forgetUnchecked = () => noteUnchecked(null);

export function download(name: string, data: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/octet-stream' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File names carry the stick's name: a profile says nothing itself about which stick it came from. */
const slug = (name: string) => name.replace(/vkb-?sim/gi, '').replace(/\(.*?\)/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stick';
export const backupName = (session: Session) => `vkb-${slug(session.name)}-backup-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.cfg`;
export const profileName = (session: Session) => `vkb-${slug(session.name)}-profile.cfg`;
export const asCfg = cfgEncrypt;
