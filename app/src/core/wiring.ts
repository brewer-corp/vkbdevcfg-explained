// Which control sits on which line.
//
// The block does not say. These tables are VKBDevCfg's own: its Visual Diagram window labels a photo of
// each device from tables compiled into the program. They agree with the factory configuration of a
// Gladiator EVO (hat directions, the mini-stick switch and the spare lines all land where the tables say),
// but no line here has been confirmed by pressing the control on a real stick.

const EXT_AT = 0x330;

/** A grip's controls, numbered from 1 inside the grip. */
type Table = Record<number, string>;

const hat = (first: number, name: string, order = ['down', 'up', 'left', 'right']): Table =>
  Object.fromEntries(order.map((dir, i) => [first + i, `${name} ${dir}`]));

const SCG: Table = {
  1: 'Trigger 2', 2: 'Trigger 1', 3: 'D1 (pinky)', 4: 'A2', 5: 'Mini-stick push', 6: 'A3 push', 7: 'A4 push', 8: 'B1',
  ...hat(9, 'A1'), ...hat(13, 'A3'), ...hat(17, 'A4'), ...hat(21, 'C1'),
  25: 'C1 push', 26: 'A1 push', 27: 'Rapid fire up', 28: 'Rapid fire down',
};
// The left-hand grip is drawn with A4's left and right exchanged; everything else is the same.
const SCG_L: Table = { ...SCG, 19: 'A4 right', 20: 'A4 left' };

const F14: Table = {
  1: 'Trigger 2', 2: 'Trigger 1', 3: 'Button', 4: 'Weapon select push', 5: 'Button', 6: 'Trigger (lower)', 7: 'Pinky', 8: 'Hat push',
  9: 'Hat down', 10: 'Hat left', 11: 'Hat right', 12: 'Hat up',
  13: 'Weapon select 1', 14: 'Weapon select 2', 15: 'Weapon select 3', 16: 'Weapon select 4',
};

const KG12: Table = {
  1: 'Hat down', 2: 'Hat left', 3: 'Hat right', 4: 'Hat up', 5: 'Button', 6: 'Trigger', 7: 'Trigger (lower)', 8: 'Button',
};

const MCG_COMMON: Table = {
  ...hat(1, 'MANVR', ['up', 'down', 'left', 'right']), 5: 'MANVR push', 8: 'Ring',
  9: 'DC left', 10: 'DC right', 11: 'DC up', 12: 'DC down', 13: 'DC push',
  14: 'LVLNG', 15: 'AP OFF', 16: 'GUN',
  17: 'RESET down', 18: 'RESET up', 19: 'RESET left', 20: 'RESET right', 21: 'RESET push',
};
const MCG: Table = { ...MCG_COMMON, 6: 'Trigger 1', 7: 'Trigger 2', 22: 'GATE CONT push', 23: 'MASTER MODE push' };
const MCGU: Table = {
  ...MCG_COMMON, 6: 'Trigger', 7: 'Trigger', 22: 'MASTER MODE push', 23: 'GATE CONT push',
  25: 'GATE CONT down', 26: 'GATE CONT left', 27: 'GATE CONT up', 28: 'GATE CONT right',
  29: 'MASTER MODE down', 30: 'MASTER MODE left', 31: 'MASTER MODE up', 32: 'MASTER MODE right',
  33: 'Mini-stick push', 34: 'Mini-stick push',
};

/** External-device type (record byte 2, low five bits) to the grip table the vendor draws for it. */
const GRIPS: Record<number, { name: string; table: Table }> = {
  3: { name: 'KG12', table: KG12 }, 4: { name: 'KG12', table: KG12 },
  7: { name: 'MCG', table: MCG }, 8: { name: 'SCG', table: SCG }, 9: { name: 'SCG-L', table: SCG_L },
  11: { name: 'F14', table: F14 }, 12: { name: 'MCG Ultimate', table: MCGU },
};

/** The Gladiator NXT / EVO base keeps the first register (lines 1 to 8) for its own controls. */
const GLADIATOR_BASE: Table = {
  1: 'En2 (encoder)', 2: 'En2 (encoder)', 3: 'Sw1 up', 4: 'Sw1 down', 5: 'F3', 6: 'F1', 7: 'F2',
};
/** USB product ids the vendor tool treats as that family. */
const isGladiator = (productId: number) =>
  (productId >= 0x0200 && productId <= 0x21ff) || (productId >= 0x3200 && productId <= 0x41ff);

/** `key` is a stable handle for a control ("a3.up", "trigger.1"), whichever line it turns out to be on. */
export interface Control { key: string; name: string; owner: string }

const keyOf = (name: string) => name.replace(/\s*\(.*?\)/g, '').trim().toLowerCase().replace(/\s+/g, '.');

/** Registers an external device claims: eight lines each, the first register numbered from 1. */
export function extRegisters(block: Uint8Array, index: number): { type: number; first: number; count: number } {
  const at = EXT_AT + 16 * index;
  return { type: block[at + 2] & 0x1f, first: (block[at + 4] & 0x0f) || 16, count: ((block[at + 4] | (block[at + 5] << 8)) & 0x1f0) >> 4 };
}

/** Control names by 1-based line, for the lines this configuration's hardware is known to use. */
export function wiring(block: Uint8Array, productId?: number): Map<number, Control> {
  const out = new Map<number, Control>();
  let registerOneFree = true, gripOnTwo = false;
  for (let k = 0; k < 8; k++) {
    const { type, first, count } = extRegisters(block, k);
    if (!type) continue;
    if (first === 1) registerOneFree = false;
    const grip = GRIPS[type];
    if (!grip) continue;
    if (first === 2) gripOnTwo = true;
    const base = 8 * (first - 1), limit = base + 8 * count;
    for (const [n, name] of Object.entries(grip.table)) {
      const line = base + +n;
      if (line <= limit && line <= 128) out.set(line, { key: keyOf(name), name, owner: grip.name });
    }
  }
  // Without a product id (a file), a grip starting on register 2 is the mark of a Gladiator base.
  const base = productId === undefined ? gripOnTwo : isGladiator(productId);
  if (base && registerOneFree)
    for (const [n, name] of Object.entries(GLADIATOR_BASE)) out.set(+n, { key: +n === 1 ? 'en.a' : +n === 2 ? 'en.b' : keyOf(name), name, owner: 'Base' });
  return out;
}
