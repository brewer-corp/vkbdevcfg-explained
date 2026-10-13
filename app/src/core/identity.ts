// Telling one stick's configuration from another's.
//
// A profile carries no name or serial number, and sticks of one family share a type id. Two things in the
// block do belong to a particular stick: the calibration its sensors were measured with, and the grip or
// module it has attached.
import { extDevice, physicalAxisBase } from './schema';

/** KdHi, KdLo and the 13-bit bias of a physical axis: the per-unit calibration values. */
const calibration = (b: Uint8Array, n: number) => {
  const at = physicalAxisBase(n);
  return [b[at + 4], b[at + 5], (b[at + 6] | (b[at + 7] << 8)) & 0x1fff];
};
const calibrated = (c: number[]) => c[0] !== 0xff || c[1] !== 0xff;          // an unused slot holds FF FF

const attached = (b: Uint8Array) =>
  [...Array(8).keys()].map((k) => extDevice(b, k)).filter((d) => d.type !== 0).map((d) => d.name).join(' + ') || 'nothing attached';

/** Reasons to think `incoming` was not saved from the stick that holds `stick`. Empty when nothing says so. */
export function foreignSigns(stick: Uint8Array, incoming: Uint8Array): string[] {
  const signs: string[] = [];
  const [here, there] = [attached(stick), attached(incoming)];
  if (here !== there) signs.push(`It is set up for a different grip: ${there}, where this stick has ${here}.`);
  let axes = 0;
  for (let n = 0; n < 16; n++) {
    const a = calibration(stick, n), b = calibration(incoming, n);
    if ((calibrated(a) || calibrated(b)) && a.some((v, i) => v !== b[i])) axes++;
  }
  if (axes)
    signs.push(`Its calibration differs from this stick’s on ${axes} ${axes === 1 ? 'axis' : 'axes'}. Calibration is measured for each stick, ` +
      'so the profile was saved from another one — or from this one before it was last calibrated.');
  return signs;
}
