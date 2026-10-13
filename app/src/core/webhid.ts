// WebHID transport (Chrome, Edge). The only place that touches the browser's device API.
import { FRAME, REPORT_ID, Transport } from './protocol';

export const VKB_VENDOR_ID = 0x231d;
export const webHidAvailable = () => typeof navigator !== 'undefined' && 'hid' in navigator;

export class WebHidTransport implements Transport {
  readonly pace = 5;
  constructor(readonly device: HIDDevice) {}

  get name() { return this.device.productName.trim(); }
  get productId() { return this.device.productId; }

  async send(data: Uint8Array): Promise<void> {
    await this.device.sendFeatureReport(REPORT_ID, data as BufferSource);
  }

  async receive(): Promise<Uint8Array> {
    const view = await this.device.receiveFeatureReport(REPORT_ID);
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
    if (this.device.opened) await this.device.close();
  }
}

async function open(device: HIDDevice): Promise<WebHidTransport> {
  if (!device.opened) await device.open();
  return new WebHidTransport(device);
}

/** Sticks this page has already been allowed to use. */
export async function grantedSticks(): Promise<HIDDevice[]> {
  if (!webHidAvailable()) return [];
  return (await navigator.hid.getDevices()).filter((d) => d.vendorId === VKB_VENDOR_ID);
}

/** Ask the user to pick a stick. Must be called from a click. */
export async function requestStick(): Promise<WebHidTransport | null> {
  const [device] = await navigator.hid.requestDevice({ filters: [{ vendorId: VKB_VENDOR_ID }] });
  return device ? open(device) : null;
}

export const openGranted = open;
