// Telling one stick's configuration from another's.
//
// A profile carries no name or serial number, and sticks of one family share a type id. Two things in the
// block do belong to a particular stick: the calibration its sensors were measured with, and the grip or
// module it has attached.
import { extDevice, physicalAxisBase } from './schema';
/** KdHi, KdLo and the 13-bit bias of a physical axis: the per-unit calibration values. */
const calibration = (b, n) => {
    const at = physicalAxisBase(n);
    return [b[at + 4], b[at + 5], (b[at + 6] | (b[at + 7] << 8)) & 0x1fff];
};
const calibrated = (c) => c[0] !== 0xff || c[1] !== 0xff; // an unused slot holds FF FF
const attached = (b) => [...Array(8).keys()].map((k) => extDevice(b, k)).filter((d) => d.type !== 0).map((d) => d.name).join(' + ') || 'nothing attached';
/** Reasons to think `incoming` was not saved from the stick that holds `stick`. Empty when nothing says so. */
export function foreignSigns(stick, incoming) {
    const signs = [];
    const [here, there] = [attached(stick), attached(incoming)];
    if (here !== there)
        signs.push(`It is set up for a different grip: ${there}, where this stick has ${here}.`);
    let axes = 0;
    for (let n = 0; n < 16; n++) {
        const a = calibration(stick, n), b = calibration(incoming, n);
        if ((calibrated(a) || calibrated(b)) && a.some((v, i) => v !== b[i]))
            axes++;
    }
    if (axes)
        signs.push(`Its calibration differs from this stick’s on ${axes} ${axes === 1 ? 'axis' : 'axes'}. Calibration is measured for each stick, ` +
            'so the profile was saved from another one — or from this one before it was last calibrated.');
    return signs;
}
/**
 * Which hand a Gladiator is built for, and whether it sits on an Omni Throttle adapter.
 * The hand is a setting: the stick names itself after the grip type in its first external-device record (confirmed on
 * hardware), so a profile file tells us too. The mount is the firmware, and only shows in the USB product id:
 * 0x0200 / 0x0201 for a standard stick, 0x3200 / 0x3201 with Omni firmware.
 */
export function stickModel(block, productId) {
    const grip = extDevice(block, 0).type;
    const gladiator = productId !== undefined && (productId < 0x600 || productId === 0x3200 || productId === 0x3201) && productId >= 0x200;
    const hand = grip === 8 ? 'right' : grip === 9 ? 'left' : gladiator ? (productId & 1 ? 'left' : 'right') : null;
    const mount = productId === 0x3200 || productId === 0x3201 ? 'omni' : gladiator ? 'standard' : null;
    return { hand, mount };
}
