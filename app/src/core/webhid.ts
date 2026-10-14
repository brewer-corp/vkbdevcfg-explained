// WebHID transport (Chrome, Edge). The only place that touches the browser's device API.
import { FRAME, REPORT_ID, Transport } from './protocol';

export const VKB_VENDOR_ID = 0x231d;
export const webHidAvailable = () => typeof navigator !== 'undefined' && 'hid' in navigator;

/** Whether this browser can reach a stick: `not-chromium` (Firefox, Safari, anything on an iPhone), or Chromium without WebHID. */
export type BrowserFit = 'ok' | 'not-chromium' | 'no-webhid';

interface Nav { userAgent: string; userAgentData?: { brands?: { brand: string }[] } }

/**
 * Only browsers built on Chromium (Chrome, Edge, Opera, Vivaldi, Brave) have WebHID. Chromium names itself in
 * `navigator.userAgentData`, which no other engine has; failing that, the user-agent string, where Firefox and Safari
 * never write "Chrome/" (nor does Chrome on iOS, which is Safari underneath).
 */
export function browserFit(nav: Nav = navigator as Nav, hid = webHidAvailable()): BrowserFit {
  const brands = nav.userAgentData?.brands;
  const chromium = brands?.length ? brands.some((b) => b.brand === 'Chromium') : /\b(Chrome|Chromium)\/\d/.test(nav.userAgent);
  return !chromium ? 'not-chromium' : hid ? 'ok' : 'no-webhid';
}

const ANSWER_MS = 1500;

/**
 * Chrome leaves a call on a stick that has gone away pending for ever: it neither resolves nor rejects, and the
 * device object goes on saying it is open. (Seen with a stick that restarted behind the page.) So nothing here waits
 * without a limit; an exchange with a live stick takes a few milliseconds.
 */
function bounded<T>(work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The stick stopped answering. It may have been unplugged, or restarted by another program.')), ANSWER_MS);
    work.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

export class WebHidTransport implements Transport {
  readonly pace = 5;
  private gone = false;
  private readonly onGone = (e: HIDConnectionEvent) => { if (e.device === this.device) this.gone = true; };

  constructor(readonly device: HIDDevice) {
    navigator.hid.addEventListener('disconnect', this.onGone);
  }

  get name() { return this.device.productName.trim(); }
  get productId() { return this.device.productId; }

  private live() {
    if (this.gone) throw new Error('The stick was disconnected.');
  }

  async send(data: Uint8Array): Promise<void> {
    this.live();
    await bounded(this.device.sendFeatureReport(REPORT_ID, data as BufferSource));
  }

  async receive(): Promise<Uint8Array> {
    this.live();
    const view = await bounded(this.device.receiveFeatureReport(REPORT_ID));
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    // Chrome includes the report id as the first byte; the spec says it should not.
    return bytes.length > FRAME ? bytes.subarray(bytes.length - FRAME) : bytes;
  }

  onInput(listener: (reportId: number, data: Uint8Array) => void): () => void {
    const handler = (e: HIDInputReportEvent) =>
      listener(e.reportId, new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength));
    this.device.addEventListener('inputreport', handler);
    return () => this.device.removeEventListener('inputreport', handler);
  }

  async close(): Promise<void> {
    navigator.hid.removeEventListener('disconnect', this.onGone);
    if (this.device.opened && !this.gone) await bounded(this.device.close()).catch(() => {});
  }
}

async function open(device: HIDDevice): Promise<WebHidTransport> {
  if (!device.opened) await bounded(device.open());
  return new WebHidTransport(device);
}

/** Sticks this page has already been allowed to use. */
export async function grantedSticks(): Promise<HIDDevice[]> {
  if (!webHidAvailable()) return [];
  return (await navigator.hid.getDevices()).filter((d) => d.vendorId === VKB_VENDOR_ID);
}

/** Ask the user to pick a stick. Must be called from a click. Null if they dismissed the chooser. */
export async function requestStick(): Promise<WebHidTransport | null> {
  const [device] = await navigator.hid.requestDevice({ filters: [{ vendorId: VKB_VENDOR_ID }] });
  return device ? open(device) : null;
}

export const openGranted = open;
