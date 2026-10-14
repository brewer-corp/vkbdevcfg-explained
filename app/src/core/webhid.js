// WebHID transport (Chrome, Edge). The only place that touches the browser's device API.
import { FRAME, REPORT_ID } from './protocol';
export const VKB_VENDOR_ID = 0x231d;
export const webHidAvailable = () => typeof navigator !== 'undefined' && 'hid' in navigator;
const ANSWER_MS = 1500;
/**
 * Chrome leaves a call on a stick that has gone away pending for ever: it neither resolves nor rejects, and the
 * device object goes on saying it is open. (Seen with a stick that restarted behind the page.) So nothing here waits
 * without a limit; an exchange with a live stick takes a few milliseconds.
 */
function bounded(work) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The stick stopped answering. It may have been unplugged, or restarted by another program.')), ANSWER_MS);
        work.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
}
export class WebHidTransport {
    device;
    pace = 5;
    gone = false;
    onGone = (e) => { if (e.device === this.device)
        this.gone = true; };
    constructor(device) {
        this.device = device;
        navigator.hid.addEventListener('disconnect', this.onGone);
    }
    get name() { return this.device.productName.trim(); }
    get productId() { return this.device.productId; }
    live() {
        if (this.gone)
            throw new Error('The stick was disconnected.');
    }
    async send(data) {
        this.live();
        await bounded(this.device.sendFeatureReport(REPORT_ID, data));
    }
    async receive() {
        this.live();
        const view = await bounded(this.device.receiveFeatureReport(REPORT_ID));
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        // Chrome includes the report id as the first byte; the spec says it should not.
        return bytes.length > FRAME ? bytes.subarray(bytes.length - FRAME) : bytes;
    }
    onInput(listener) {
        const handler = (e) => listener(e.reportId, new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength));
        this.device.addEventListener('inputreport', handler);
        return () => this.device.removeEventListener('inputreport', handler);
    }
    async close() {
        navigator.hid.removeEventListener('disconnect', this.onGone);
        if (this.device.opened && !this.gone)
            await bounded(this.device.close()).catch(() => { });
    }
}
async function open(device) {
    if (!device.opened)
        await bounded(device.open());
    return new WebHidTransport(device);
}
/** Sticks this page has already been allowed to use. */
export async function grantedSticks() {
    if (!webHidAvailable())
        return [];
    return (await navigator.hid.getDevices()).filter((d) => d.vendorId === VKB_VENDOR_ID);
}
/** Ask the user to pick a stick. Must be called from a click. Null if they dismissed the chooser. */
export async function requestStick() {
    const [device] = await navigator.hid.requestDevice({ filters: [{ vendorId: VKB_VENDOR_ID }] });
    return device ? open(device) : null;
}
export const openGranted = open;
