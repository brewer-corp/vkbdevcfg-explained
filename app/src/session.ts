// Everything the UI needs from a stick, behind one small async interface.
// Components never touch WebHID or the protocol directly.
import { blockCrcOk, cfgEncrypt, loadBlockFile, withFixedCrc, writeRefusal } from './core/block';
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
}

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
  return { source: 'device', name: transport.name, original: await readFrom(transport), transport, productId: transport.productId };
}

export async function connectDemo(forgets = false): Promise<Session> {
  const transport = new MockStick({ restartMs: 1500 });
  return { source: 'demo', name: 'Demo stick (nothing real is connected)', original: await readFrom(transport), transport, forgets };
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
  let stick = new Stick(session.transport);
  let token = await stick.readToken();
  const now = await stick.readBlock(token);            // also makes sure the write is not the request after READ_CPUID
  if (!sameConfig(now, session.original))
    throw new Error('The stick’s configuration changed since it was read. Read it again before writing.');

  progress('Writing 4096 bytes…');
  const status = await stick.writeBlock(token, wanted);
  if (status !== STATUS_OK)
    throw new Error(`The stick did not accept the configuration (${WRITE_STATUS[status] ?? 'status 0x' + status.toString(16)}). Nothing was changed.`);

  progress('The stick is restarting…');
  let picked = false;
  session.transport = await reopen(session, progress, repick && (() => { picked = true; return repick(); }));
  if (session.transport instanceof WebHidTransport) { session.productId = session.transport.productId; session.name = session.transport.name; }
  progress('Reading back to verify…');
  stick = new Stick(session.transport);
  token = await stick.readToken();
  const stored = await stick.readBlock(token);
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

export function download(name: string, data: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/octet-stream' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const backupName = () => `vkb-backup-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.cfg`;
export const asCfg = cfgEncrypt;
