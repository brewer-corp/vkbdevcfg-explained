# The parameter block

The 4096 bytes that are a VKB NJoy32 device's entire configuration: what
VKBDevCfg's **Get** reads, **Set** writes, and **Save** puts in a `.cfg`.

This page is the index and the region map. The fields are in three companion
documents:

| Document | Covers |
|---|---|
| [`BLOCK-GLOBAL.md`](BLOCK-GLOBAL.md) | header, global options, mouse, POV, external devices, LEDs, LED gauges, detents |
| [`BLOCK-AXES.md`](BLOCK-AXES.md) | logical and physical axis records, curves, calibration |
| [`BLOCK-BUTTONS.md`](BLOCK-BUTTONS.md) | the physical and logical button tables, shift, Boolean functions |

How the block gets on and off a device is [`PROTOCOL.md`](PROTOCOL.md); how it
is stored in a file is [`CFG-FILE-FORMAT.md`](CFG-FILE-FORMAT.md).

---

## How much to trust this

**The layout is from static analysis of `VKBDevCfg-C.exe` v0.93.89**, checked
for plausibility against one real block (a Gladiator EVO R, firmware 2.20.C)
and two real profiles saved from another unit of the same model.

"Checked for plausibility" means: decoded with these tables, the real blocks
read as a sensible stick — X and Y on the contactless sensors, twist on Rz, a
four-way hat wired as four lines, thirty buttons each used once, a system LED
that blinks on calibration. That is good evidence the map is broadly right. It
is not proof that any particular bit is.

What has actually been confirmed on a device:

| Field | Where | How |
|---|---|---|
| CRC-32 of `block[8:]` | `0x004` | Verified on every read. The device recomputes it on every write, whatever the host sends. |
| Firmware version | `0x008` | Matches the USB `bcdDevice`. |
| Filter grade, physical axis 7 | `0x0B5` bits 5–7 | Changed from 6 to 5, written, read back before and after the stick restarted, restored. |

And what real profiles show by difference:

| Offset | Difference | Reading |
|---|---|---|
| `0x080`–`0x0AB`, bytes 4–7 of each physical-axis record | differ between two units | per-unit calibration |
| `0x330`, `0x332` | differ between two units | a different grip: SCG on one, SCG-L on the other |
| `0x084` bit 2 | differs between two saves from one unit | inversion of physical axis 1 |
| `0x15D` bit 7 | differs between two saves from one unit | a "no shift" marker rewritten; effect in firmware unknown |

Everything else is a reading of the vendor tool's code. Before relying on a
field, check it the cheap way: save a profile, change that one setting in
VKBDevCfg, save again, and run `tools/vkb_cfg.py diff` on the two files.

## Scope

- This is the layout for devices the tool treats as the current generation:
  product string tagged `XT2`, block size `0x1000`. The tool also handles
  `0x400`- and `0x800`-byte blocks for older generations, and an entirely
  different "profile" layout (`0xC00` bytes per profile) for another device
  family. None of those is described here.
- Macros are not in the block. They travel by their own commands
  ([`COMMANDS.md`](COMMANDS.md)).

---

## Region map

| Start | End | Contents | Detail |
|---|---|---|---|
| `0x000` | `0x003` | `FF FF`, device type id, marker byte | [global](BLOCK-GLOBAL.md) |
| `0x004` | `0x007` | CRC-32 of `0x008`–`0xFFF` | [global](BLOCK-GLOBAL.md) |
| `0x008` | `0x009` | firmware version | [global](BLOCK-GLOBAL.md) |
| `0x00A` | `0x01F` | global options | [global](BLOCK-GLOBAL.md) |
| `0x020` | `0x021` | register-enable mask | [global](BLOCK-GLOBAL.md), [buttons](BLOCK-BUTTONS.md) |
| `0x022` | `0x024` | serial-port mode bytes | [global](BLOCK-GLOBAL.md) |
| `0x025` | `0x029` | unused in the sample | — |
| `0x02A` | `0x033` | mouse | [global](BLOCK-GLOBAL.md) |
| `0x034` | `0x03B` | POV 0 and 1, 4 bytes each | [global](BLOCK-GLOBAL.md) |
| `0x03C` | `0x07B` | logical axes 0–7, 8 bytes each | [axes](BLOCK-AXES.md) |
| `0x07C` | `0x0BB` | physical axes 0–7, 8 bytes each | [axes](BLOCK-AXES.md) |
| `0x0BC` | `0x10B` | response curves, 8 × 10 bytes | [axes](BLOCK-AXES.md) |
| `0x10C` | `0x20B` | physical button table, 128 × 2 bytes | [buttons](BLOCK-BUTTONS.md) |
| `0x20C` | `0x30B` | logical button table, 128 × 2 bytes | [buttons](BLOCK-BUTTONS.md) |
| `0x30C` | `0x31B` | axis-to-buttons records, 8 × 2 bytes | [axes](BLOCK-AXES.md) |
| `0x31C` | `0x32B` | virtual-button trigger and brake settings | [global](BLOCK-GLOBAL.md) |
| `0x32C` | `0x32F` | system address, serial number | [global](BLOCK-GLOBAL.md) |
| `0x330` | `0x3AF` | external devices, 8 × 16 bytes | [global](BLOCK-GLOBAL.md) |
| `0x3B0` | `0x3B7` | LED channel masks | [global](BLOCK-GLOBAL.md) |
| `0x3B8` | `0x4EF` | LED events, up to 52 × 6 bytes | [global](BLOCK-GLOBAL.md) |
| `0x4F0` | `0x5DF` | Boolean function records | [buttons](BLOCK-BUTTONS.md) |
| `0x5E0` | `0x5EF` | more global options (brightness, release time) | [global](BLOCK-GLOBAL.md) |
| `0x5F0` | `0x619` | POV 2 and 3 at `0x600`/`0x604`; the rest not decoded | [global](BLOCK-GLOBAL.md) |
| `0x61A` | `0x659` | logical axes 8–15 | [axes](BLOCK-AXES.md) |
| `0x65A` | `0x699` | physical axes 8–15 | [axes](BLOCK-AXES.md) |
| `0x69A` | `0x6B9` | per-axis curve number and anti-deadzone, 16 × 2 bytes | [axes](BLOCK-AXES.md) |
| `0x6BA` | `0x78F` | referenced by button code; not decoded; zero in the sample | — |
| `0x790` | `0x7CF` | per-axis trimmer and virtual-input source, 16 × 4 bytes | [axes](BLOCK-AXES.md) |
| `0x7D0` | `0x7FF` | LED gauge records, 4 × 12 bytes | [global](BLOCK-GLOBAL.md) |
| `0x800` | `0x8FF` | extension of the physical button table, 128 × 2 bytes | [buttons](BLOCK-BUTTONS.md) |
| `0x900` | `0xAFF` | virtual layer for "Advanced Mapping"; format not decoded | [buttons](BLOCK-BUTTONS.md) |
| `0xB00` | `0xDB1` | detents: header, 10 sets × 24 bytes, extended area | [global](BLOCK-GLOBAL.md) |
| `0xDB2` | `0xFFF` | zero in the sample; no references found | — |

Roughly four fifths of the block is accounted for, at least by purpose. In a
near-default configuration most of it holds `0x00`, `0xFF` or `0x80`.

### Reading the block by eye

A few patterns make a hex dump legible:

- **`FF FF`** in the button tables is an unused line.
- **`80`** runs at `0x0BC` are flat response curves: a curve is ten bytes, one
  per 10 % of travel, and `0x80` means "output = input".
- **Logical-axis records** start with a byte whose low nibble counts up —
  `B0 B1 B2 …` — because it names the physical axis the logical axis is bound
  to. The high nibble holds its enable, visible, invert and centre flags.
- **Physical button entries** with the top bit of the first byte set are plain
  buttons; the remaining seven bits name the line to use under a shift.

---

## How the map was made

VKBDevCfg does not describe its configuration anywhere as a structure. The
layout has to be recovered from how the UI is wired to the block.

1. **Settings controls are created at run time**, not in the form resources.
   Each is registered under a numeric ID, and its caption comes from a
   localisation table — 872 English strings, loaded from a language file with
   compiled-in defaults.
2. **Giant `switch` functions copy between a control and the block**, one case
   per ID: one family for "UI → block", one for "block → UI", plus a pair per
   kind of record (axis, POV, LED event, external device, …).
3. Reading a case gives an offset, a mask and a shift. Reading the creation
   site for the same ID gives the caption. Together: *this bit field is the
   checkbox labelled "Invert"*.

Step 2 is the hard part. Eighteen functions defeat the decompiler — it times
out, or grows past several gigabytes — and sixteen of them belong to this
family. The ones that were needed were read as assembly, following the
compiler's compare trees and jump tables case by case.

| Address | Role |
|---|---|
| `0x005462D4` | UI → block: global options and external devices |
| `0x005151B8`, `0x0056F444` | block → UI: the same |
| `0x0059D18C` | UI → block, alternate "profile" layout |
| `0x005D2970` | logical-axis record |
| `0x0067A55C` | POV record |
| `0x00655800` | detents |
| `0x006DAA74` | virtual-button record |
| `0x005C4B4C`, `0x005E644C`, `0x005FA7E4`, `0x006193F8`, `0x006476B4`, `0x006610B8`, `0x006A51BC`, `0x006EB86C` | the same family — each is reached from a routine that walks a list of control IDs — but not individually attributed here |

The other two that will not decompile are the start-up routine that reads
`zconfig.ini` (`0x00406EA4`) and the localisation loader (`0x004B517C`).

Supporting evidence came from the per-setting event handlers that do
decompile — `FILTERChange`, `POVChange`, `LabelRegNClick` — and from the vendor
manual, which says what each setting is for.

## What is not known

The companion documents each end with their own list. The ones that matter
most for building an editor:

- **Whether the device validates field values.** It checks the transfer and
  recomputes the CRC. Nothing observed says it rejects a configuration that
  makes no sense, and the vendor tool warns that an incompatible profile can
  leave a device inoperable.
- **Parameters of the less common button functions** — Generator, Tempo,
  Trimmer, the Boolean operand layout — and the names in the System,
  Multimedia, Audio and Application lists.
- **The "Advanced Mapping" virtual layer** at `0x900`–`0xAFF`.
- **Detent sets**, beyond their position and size.
- **How calibration values are computed.** The block holds the results; the
  arithmetic is in the firmware.
- **Bytes `0x000`, `0x001`, `0x003` and `0x00A`.**
