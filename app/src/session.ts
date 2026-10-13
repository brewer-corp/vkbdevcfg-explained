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
}

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

export async function connectDemo(): Promise<Session> {
  const transport = new MockStick({ restartMs: 1500 });
  return { source: 'demo', name: 'Demo stick (nothing real is connected)', original: await readFrom(transport), transport };
}

export function openFile(name: string, data: Uint8Array): Session {
  return { source: 'file', name, original: loadBlockFile(data) };
}

export { grantedSticks };

export type Progress = (step: string) => void;

/** Write `next` to the stick, wait out its restart, read it back and compare. Returns the block now stored. */
export async function applyToStick(session: Session, next: Uint8Array, progress: Progress): Promise<Uint8Array> {
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
  session.transport = await reopen(session);
  progress('Reading back to verify…');
  stick = new Stick(session.transport);
  token = await stick.readToken();
  const stored = await stick.readBlock(token);
  if (!sameConfig(stored, wanted))
    throw new Error('The stick restarted but does not hold the new configuration. Use your backup to restore it.');
  return stored;
}

/** Equal apart from the device-owned header word. */
export const sameConfig = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.subarray(8).every((x, i) => x === b[8 + i]);

async function reopen(session: Session): Promise<Transport> {
  const old = session.transport!;
  if (!(old instanceof WebHidTransport)) {              // the mock: just wait for it to come back
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      try { await old.receive(); return old; } catch { /* still restarting */ }
    }
    throw new Error('The stick did not come back.');
  }
  await sleep(1500);
  try { await old.close(); } catch { /* already gone */ }
  for (let i = 0; i < 50; i++) {
    const found = (await grantedSticks()).find((d) => d.productId === session.productId);
    if (found) {
      try { return await openGranted(found); } catch { /* not ready yet */ }
    }
    await sleep(300);
  }
  throw new Error('The stick did not reappear within 15 seconds. Check it, then reconnect.');
}

export function download(name: string, data: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/octet-stream' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const backupName = () => `vkb-backup-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.cfg`;
export const asCfg = cfgEncrypt;
