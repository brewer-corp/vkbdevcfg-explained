# Parameter block: axes

Field map of the axis structures in the 4096-byte parameter block described in
[`PARAMETER-BLOCK.md`](PARAMETER-BLOCK.md). All offsets are offsets into that
block. The layout is from **static analysis** of `VKBDevCfg-C.exe` v0.93.89:
for each field the code that writes it into the block and the code that reads it
back out were located, and the bit positions were taken from that code. The
decode was then checked for plausibility against real blocks — one block read
from a VKBsim Gladiator EVO R (firmware 2.20.C) and two saved profiles from
another unit of the same model — in the sense that it reads as a sensible
configuration. That is a consistency check, not a proof of what the firmware
does with each field.

Two labels are used, as in [`PROTOCOL.md`](PROTOCOL.md):

- ***verified*** — exercised on the test device.
- ***static*** — read out of the binary, not exercised on hardware.

**Ten fields are *verified*** — their effect was observed on the test stick, one
experiment each, recorded in §9a: the logical-axis fields En, Vs, In, Cn,
AxisID, HID usage, Precision, Dz Lo and Dz Hi, and the physical-axis inversion
bit R. **Every other row is *static*.**

Confidence is **high**, **medium** or **low**:

- **high** — read directly from the code that writes and reads the field, and
  consistent with the real blocks;
- **medium** — one piece of evidence, or an inference from interface text;
- **low** — a guess, flagged as such;
- **—** — the bits are not touched by any code found, and are unknown.

A split rating such as "high (field), medium (scale)" rates the parts separately.

Notation. Block offsets are written with at most three hex digits (`0x10C`);
addresses in the executable with eight (`0x004FFB80`). Evidence entries of the
form `ctl 0xCA` give the numeric ID of the control that edits the field: the
tool creates most of its settings controls at run time, tags each with an ID,
and routes them through large switch statements (the dispatchers below). Those
dispatchers defeat the decompiler and were read as assembly, so wherever
possible the OK handlers of the tool's dialogs (`btn_OKClick`) were used as an
independent second source for the same bits.

---

## Summary of structures

| Block offset | Record size | Count | What |
|---|---|---|---|
| `0x0C` | 1 | 1 | bitmask: axis *n* is calibrated (§7) |
| `0x0D` | 1 | 1 | bitmask: per-curve "99 % mode" flag (§5) |
| `0x3C` | 8 | 8 | **logical axis** records, slots 0–7 (§2) |
| `0x7C` | 8 | 8 | **physical axis** records, slots 0–7 (§3) |
| `0xBC` | 10 | 8 | response curves (§5) |
| `0x30C` | 2 | 8 | axis-to-buttons words (§6) |
| `0x61A` | 8 | 8 | logical axis records, slots 8–15 (§1) |
| `0x65A` | 8 | 8 | physical axis records, slots 8–15 (§1) |
| `0x69A` | 2 | 16 | per-slot curve number and anti-deadzone (§4.1) |
| `0x790` | 4 | 16 | per-slot trimmer source and virtual-input source; only the first 16 bits of each entry are used (§4.2) |

The model behind these is VKB's: a **physical axis** is a sensor front end
(sensor type, filtering, calibration); a **logical axis** is an output
(binding, deadzone, precision, HID usage, combining). A logical axis names the
physical axis it reads, and several logical axes may name the same one. See
[`MANUAL-DIGEST.md`](MANUAL-DIGEST.md) §1.3.

---

## 1. Slots and where the records are

The tool has a *Physical Axes* tab and a *Logical Axes* tab, and they edit
different records. **The 8-byte records at `0x3C` are the logical axes; the
8-byte records at `0x7C` are the physical axes.** There are **16 axis slots**,
not 8, split into two banks:

| Slot *n* | Logical record | Physical record |
|---|---|---|
| 0–7 | `0x3C + 8n` (`0x3C`–`0x7B`) | `0x7C + 8n` (`0x7C`–`0xBB`) |
| 8–15 | `0x61A + 8(n − 8)` (`0x61A`–`0x659`) | `0x65A + 8(n − 8)` (`0x65A`–`0x699`) |

Evidence: the function at `0x0040490C` returns the pointer to logical record *n*
as `0x3C + 8n` for *n* < 8 and `0x5DA + 8n` otherwise (the same address as
`0x61A + 8(n − 8)`); `TMainForm::FILTERChange` (`0x00437B04`) and
`TMainForm::RefreshParamAxes` (`0x00711A68`) apply the same two-bank rule to
both record types. ***static***, high.

The tool shows slots 8–15 only when the flags at `0x00F081A4` and `0x00F081CE`
are both non-zero (`ShowParamAxes`, `0x00710BE4`). The value of the second flag
for the test device was not determined (§10).

The bytes `0x5DA`–`0x619` are **not** axis records: that range is only the
virtual base the slot formula uses for slots 8 and up. It holds non-zero bytes
in the real block (`0x5E0`, `0x603`, `0x607`) that were not tied to any axis
dialog; `0x5F0` is referenced by encoder code (`TForm10::ENC_TNChange`,
`0x00461C20`) and `0x617` by many button handlers.

### How the fields were located

| Direction | Logical records | Physical records |
|---|---|---|
| UI → block (from `TMainForm::RefreshParam`, `0x00711BD4`, through `RefreshParamAxes`) | `0x006D828C` → dispatcher `0x005D2970` | `0x006D86F0` → dispatcher `0x00608F30` |
| block → UI (`ShowParamAxes`, `0x00710BE4`) | `0x006D8068` → `0x005C4B4C` | `0x006D84AC` → `0x005E644C` |

Tab builders: `TMainForm::TabSheetLogicalAxesActivate` (`0x004FFB80`),
`TMainForm::TabSheetPhysicalAxesActivate` (`0x004F144C`). Helpers that gather a
whole record from a dialog: `TForm37A::CollectLA` (`0x004A47F4`, logical) and
`TForm37A::CollectPA` (`0x004A45FC`, physical).

The block → UI direction independently reads back the same bit positions for
combine, absolute/relative, curve, trimmer, filters, input type and calibration
fields (§2–§3), which is a cross-check on the UI → block decode.

Dialogs named in the evidence column:

| Class | Edits |
|---|---|
| `TForm37A` | gathers a whole logical or physical record (`CollectLA`, `CollectPA`) |
| `TForm37` | trimmer: trimmer mode, trimmer enable, trimmer source |
| `TForm38` | combine |
| `TForm39` | forced limit, relative-mode multiplier and curve, absolute/relative mode |
| `TForm40` | response-curve enable and curve number |
| `TForm41` | filters: H-filter, filter grade, threshold |
| `TForm42` | axis to buttons |
| `TForm45` | calibration options |
| `TForm48` | input type |

For firmware at or above `0x2187` (the word at `0x00F08190`; the test device has
`0x220C`) combine and absolute/relative are edited through buttons that open
`TForm38` and `TForm39` instead of inline controls, and the deadzone-low value
has a wizard button. The older inline controls are not used on the test device.

### Second bank (slots 8–15) in the real block

The real block holds a pattern there that looks like template data for disabled
slots:

- **Logical `0x61A`–`0x659`:** bytes 0 = `88`…`8F`, so AxisID 9…16 (stored
  8…15), En = Vs = In = 0, Cn = 1; HID usage cycling X, Y, Z, Rot X, Rot Y,
  Rot Z, Slider, Dial; precision 10; Dz Lo 0 %; Dz Hi 1.0 %. Consistent with
  disabled template slots.
- **Physical `0x65A`–`0x699`:** eight identical records `9A C8 C8 08 .. .. .. ..`:
  ACn 0, ACl 1, R 0, input type Virtual, HF 1, trimmer mode "-2-", MPL 8,
  Ext 0, filter 6, threshold 200, trimmer OFF, with the KdHi, KdLo and Bias
  bytes at their defaults (KdHi = KdLo = 255, Bias = 0). The same as the unused
  physical slots 6 and 7 except the threshold (200 against 100). Consistent with
  unused virtual axes at defaults.

The unit effectively uses only slots 0–7. Whether the second bank is active on
it is not determined.

---

## 2. Logical axis record

`0x3C + 8n` (n = 0–7), `0x5DA + 8n` (n = 8–15); 8 bytes. Every bit is
read-modify-written into the record. Dispatcher: `0x005D2970`.

| Byte | Bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|---|
| 0 | 0–3 | **AxisID**: the bound physical axis | stored = UI value − 1 (UI spin 1–8) | high | `ctl 0xC9`, instructions `0x005D30C6`–`0x005D30D9`; `TForm37A::CollectLA` ((value − 1) AND 0xF); manual Table 3.2 "AxisID" |
| 0 | 4 | **En**: enable axis | 0/1 | high | `ctl 0xCA`; `CollectLA` (bit 4) |
| 0 | 5 | **Vs**: visible in HID | 0/1 | high | `ctl 0xCB`; `CollectLA` (bit 5) |
| 0 | 6 | **In**: logical inversion | 0/1 | high | `ctl 0xCC` ("Logical inversion of axis"); `CollectLA` (bit 6) |
| 0 | 7 | **Cn**: axis with centre | 0/1; the analysis records that analog axes must have it | high | `ctl 0xCD`; `CollectLA` (bit 7) |
| 1 | 0–3 | **HID usage** | index into the tool's name table at `0x00DAB4C8` (§2.1) | high | `ctl 0xCE` (case at `0x005D4FD4`); `CollectLA` (byte 1); the function at `0x0047B2E0` names an axis from byte 1 AND 0xF |
| 1 | 4 | **FL**: forced limit (relative mode) | 0/1 | high | `ctl 0xD3`; `TForm39::btn_OKClick` (`0x004A6570`), check box `cb_FL`, bit 4 |
| 1 | 5 | second-mode bit of the 2-D circular deadzone pair | 0/1; read only by `TMainForm::GetParDZ0` (`0x00438A04`), where byte 1 AND 0x20 selects "mode 2"; never set in the real blocks | medium | `GetParDZ0` |
| 1 | 6 | **2-D circular deadzone** flag | 0/1 (check box "2D Circular deadzone"). If set on axis *b*, the low nibble of byte 3 of record *b* is the index of the partner (primary) axis, and the primary axis's byte 3 holds the Dz Lo value | medium | `ctl 0xD4` (case at `0x005D7E7E`); `GetParDZ0`; `TMainForm::BtnDZClick` (`0x0043FEB0`); `TForm37A::CollectLA` |
| 1 | 7 | unknown | never written by either axis dispatcher; 0 in all real blocks | — | — |
| 2 | 0–3 | **Precision** of axis, in bits ("max 15 bit") | direct value | high | `ctl 0xD0`; `CollectLA` (byte 2 AND 0xF) |
| 2 | 4 | **R**: physical data inversion (shown on the Logical tab) | 0/1 | high | `ctl 0xD1`; `CollectLA` (byte 2 bit 4). The physical record has its own R bit (§3); how the two relate is not explained by the analysis |
| 2 | 5–6 | **RMpl**: relative-mode multiplier | 0–3 = 1×, 2×, 4×, 8× | high | `ctl 0xCF`; `TForm39::btn_OKClick` (combo items `[1x 2x 4x 8x]`, (value AND 3) shifted left 5) |
| 2 | 7 | **TCurve**: relative response curve | 0 = Linear, 1 = Square | high | `ctl 0xD2`; `TForm39` combo `[Linear Square]`, bit 7 |
| 3 | 0–7 | **Dz Lo**: deadzone in the centre / at the bottom | percent × 10 (0–25.5 %). For the secondary axis of a 2-D pair (byte 1 bit 6) the low nibble is the partner index instead | high (scale: medium) | written by the deadzone wizard (`TForm37A::CollectLA`, byte 3); decimal spin 0–25.5 `ctl 0xF3`: stored byte = round(value × 10.00001), instructions `0x005DCADC`–`0x005DCAF0`, constant at `0x005DDA6C`; read by `GetParDZ0` |
| 4 | 0–7 | **Dz Hi**: deadzone at the top | percent × 10 (0–25.5 %) | high | `ctl 0xD5` decimal spin, hint "Deadzone in top of axis, %", instructions `0x005D8E0B`–`0x005D8E1C`; `CollectLA` (byte 4); `TForm37A` |
| 5 | 0–2 | **Combine**: forcing axis | stored = UI value − 1. The tab offers 1–8; dialog `TForm38` accepts 1–16 but the mask is 3 bits (AND 7), so only 0–7 can be stored | high | `ctl 0xDA`; `TForm38::btn_OKClick` (`0x004A6238`); `ShowParamAxes` reads (byte 5 AND 7) + 1 |
| 5 | 3–6 | **Combine** type | code, §2.2 | high (codes), medium (names of 6–8) | `ctl 0xD9` (shift left 3); `TForm38` combo-index → code table at `0x00DDFFAC`; `ShowParamAxes` reads (byte 5 AND 0x78) shifted right 3 |
| 5 | 7 | **Combine** sign | 0 = "−", 1 = "+" | high | `ctl 0xDB` (shift left 7); `TForm38` combo `Sign` items `[- +]` |
| 6 | 0–6 | **Combine** %: maximum combining effect | 0–100 | high | `ctl 0xD7` (hint "% for axis combine operation"); `TForm38` `Percent` (AND 0x7F) |
| 6 | 7 | **Mode** | 0 = Absolute, 1 = Relative | high | `ctl 0xDC`; `TForm39` combo `Mode` items `[Absolute Relative]`, bit 7 |
| 7 | 0–7 | **FA3 val**: fixed value for the FA3 button function | 0–100 | high | `ctl 0xD8` (hint "Fixed value for FA3 mode", track edit 0–100); `CollectLA` (byte 7) |

### 2.1 HID usage names

Byte 1, bits 0–3. Table at `0x00DAB4C8`, read by the function at `0x00404154`.

| Index | Usage | Index | Usage |
|---|---|---|---|
| 0 | X | 8 | Wheel |
| 1 | Y | 9 | Rudder |
| 2 | Z | 10 | Throttle |
| 3 | Rot X | 11 | Accelerator |
| 4 | Rot Y | 12 | Flaps |
| 5 | Rot Z | 13 | Aileron |
| 6 | Slider | 14 | Ailer.Trim |
| 7 | Dial | 15 | Elevator |

Confidence high. The tool's table continues past index 15 (names from Clutch up
to Treble), but a 4-bit field cannot address them. The usage combo lists 8
entries, or 16 when the value at `0x00F086D0` shifted right by 5 is greater
than 2.

### 2.2 Combine types

Byte 5, bits 3–6.

| Code | Name | Confidence |
|---|---|---|
| 0 | OFF | high |
| 1 | Dif 1 | high |
| 2 | Dif 2 | high |
| 3 | Combi 1 | high |
| 4 | Combi 2 | high |
| 5 | BrakeV | high |
| 6, 7, 8 | three further BrakeV variants — names unresolved, see below | codes high, names medium |
| 9 | Average | high |

The Logical-tab combo (the older-firmware branch, ID `0xD9`) lists, in order:
"- OFF -", "Dif 1", "Dif 2", "Combi 1", "Combi 2", "BrakeV", "BrakeV 2",
"BrakeV 3", "BrakeV V1", "Average" (strings in
`TMainForm::TabSheetLogicalAxesActivate`). The dialog maps its combo index to
the stored code with the table `{0, 1, 2, 3, 4, 5, 8, 6, 7, 9}` at
`0x00DDFFAC`, so stored codes 6, 7 and 8 correspond to dialog items 7, 8 and 6.

The analysis gives two assignments for these three codes, and they disagree:

| Code | Summary row of the analysis | Index-to-code table applied to the Logical-tab list in order |
|---|---|---|
| 6 | BrakeV 3 (?) | BrakeV 3 |
| 7 | BrakeV 2 (?) | BrakeV V1 |
| 8 | BrakeV (?) | BrakeV 2 |

The second column assumes the dialog lists its items in the same order as the
Logical-tab combo; the analysis records that order as unverified and states that
the exact names of the middle three cannot be recovered from the strings alone.
This document therefore does not assign names to codes 6, 7 and 8.

---

## 3. Physical axis record

`0x7C + 8n` (n = 0–7), `0x65A + 8(n − 8)` (n = 8–15); 8 bytes. Dispatcher:
`0x00608F30`.

| Byte | Bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|---|
| 0 | 0 | **ACn**: AutoCentering | 0/1 | high | `ctl 0xDD` (case at `0x0060966A`); `TForm45::btn_OKClick` (`0x004AAC68`), check box "ACn", bit 0; `TForm37A::CollectPA` |
| 0 | 1 | **ACl**: AutoCalibration | 0/1 | high | `ctl 0xDE`; `TForm45` check box "ACl", bit 1 |
| 0 | 2 | **R**: physical data inversion | 0/1 | high | `ctl 0xDF`; `CollectPA` (byte 0 bit 2). The one bit that differs between the two saved profiles (§9) |
| 0 | 3 | input type, bit 0 | see §3.1 | high | instructions `0x0060B4DD`–`0x0060B52D`; `TForm48::btn_OKClick` (`0x004AB2F4`) |
| 0 | 4–6 | **HF**: H-filter | 0–7 | high | `ctl 0xE1` (AND 7, shift left 4); `TForm41::btn_OKClick` (`0x004A952C`), (value AND 7) shifted left 4. The dialog's HF spin edit has a maximum of 8 |
| 0 | 7 | **Trimmer mode** | 0 = "-1-" (Standard), 1 = "-2-" (Modified) | high | `ctl 0xE9`; `TForm37::btn_OKClick` (`0x004A3128`), combo `TrimMode` items `[-1- -2-]`, bit 7 |
| 1 | 0–3 | **MPL**: binary multiplier | 1–15 | high | `ctl 0xE3`; `TForm45` spin MPL (AND 0xF, minimum 1, maximum 15) |
| 1 | 4 | **Ext**: axis for an external device | 0/1 | high | `ctl 0xF0`; `CollectPA` (byte 1 bit 4) |
| 1 | 5–7 | **Filter** grade | 0–7; 0 = manual / off | high — ***verified*** (§3.2) | `TMainForm::FILTERChange` (`0x00437B04`): grade shifted left 5, combined with (byte AND 0x1F); `ctl 0xE5`; `TForm41`: type Manual forces 0, type Dynamic stores the range value in these bits |
| 2 | 0–7 | **Thr**: threshold of the dynamic filter | 0–255 | high | `ctl 0xE6` (track edit "Threshold of dynamic filter"); `TForm41` threshold field → byte 2 |
| 3 | 0–1 | **Base**: base quadrant (D_MaRS) | 0–3 | medium (name taken from the manual) | `ctl 0xE7` (AND 3); manual "Base" |
| 3 | 2 | **Dir**: MaRS rotation direction | 0/1 | high | `ctl 0xE8`; `TForm45` `DIR` (bit 2) |
| 3 | 3 | input type, bit 1 | see §3.1 | high | instructions `0x0060B4DD`–`0x0060B52D` |
| 3 | 4 | **Eq**: response-curve enable | 0/1 | high | `ctl 0xEA`; `TForm40::btn_OKClick` (`0x004A8C60`), combo `EQ` items `[OFF ON]`, bit 4 |
| 3 | 5–6 | **Trimmer** enable | 0 = OFF, 1 = "+", 2 = "−", 3 = "Input" | high | `ctl 0xEB`; `TForm37::btn_OKClick`, combo `Trim` items `[OFF + - Input]`, (value AND 3) shifted left 5 |
| 3 | 7 | input type, bit 2 | see §3.1 | high | instructions `0x0060B4DD`–`0x0060B52D` |
| 4 | 0–7 | **KdHi** | 1–255; per-unit calibration value; unused slots hold 255 | high | `TForm45` `KD_HI` → byte 4; `ctl 0xED` |
| 5 | 0–7 | **KdLo** | 1–255; per-unit calibration value; unused slots hold 255 | high | `TForm45` `KD_LO` → byte 5; `ctl 0xEE` |
| 6–7 | 0–12 of the little-endian 16-bit word | **Bias** (zero point) | 13-bit **signed**, sign-extended as (word shifted left 19, then arithmetic right 19); per-unit calibration value; unused slots hold 0 | high | `TForm45::Init` (`0x004AAB84`); `TForm45::btn_OKClick` (new value AND 0x1FFF combined with old value AND 0xE000); `ctl 0xEF`, instruction `0x00611246` (`and cx, 0x1FFF`) |
| 6–7 | 13–15 of the word | unknown | preserved by every writer (mask `0xE000`); 0 in all real blocks | — | `TForm45::btn_OKClick` |

The controls `ctl 0xE2` ("Pulse Filter") and `ctl 0xE4` have no field here; see
§10.

### 3.1 Input type

The input type is a 3-bit value spread over three bits of the record:

```
input type = byte0.bit3  |  byte3.bit3 << 1  |  byte3.bit7 << 2
```

| Value | Input type |
|---|---|
| 0 | D_MaRS |
| 1 | Analogue |
| 2 | A_MaRS |
| 3 | Virtual |
| 4 | V_MaRS |
| 5 | Trimmer |
| 6 | Shunt |

Confidence: high for the bit positions (instructions `0x0060B4DD`–`0x0060B52D`;
`TForm48::btn_OKClick`), medium for the order of the values, which assumes the
stored value equals the item index of the `Input` combo in `TForm48`. The order
agrees with the manual's wording for X and Y ("A_MaRS, Gladiator MaRS type") and
for twist ("V_MaRS, Gladiator yaw sensor") in the real block, which supports the
bit decode; it does not settle the order of values 3 and up (§10). Value 7 is
not listed by the combo.

When the input type is Virtual (3), the source axis is stored in the word at
`0x790 + 4n` (§4.2).

### 3.2 The filter grade, exercised on hardware ***verified***

On physical axis slot 7 the filter grade — bits 5–7 of byte 1, offset
`0x7D + 8n` = `0xB5` — was changed from 6 to 5 (`C8` → `A8`). The block was
written to the stick; the byte read back identically before and after the stick
restarted; the original value was then restored. The slot is unused on this
unit (its logical axis is disabled). The write and read procedure is in
[`PROTOCOL.md`](PROTOCOL.md) §5.

This establishes that the stick accepts the value at that position and keeps it
across a restart. It does not establish what the firmware does with the grade.
No other row in this document has been exercised on a device.

---

## 4. Per-slot side arrays

### 4.1 `0x69A + 2n` (n = 0–15; 2 bytes per slot, `0x69A`–`0x6B9`)

Passed to both axis dispatchers and to the `TForm37`, `TForm40`, `TForm41`,
`TForm45` and `TForm48` dialogs (`RefreshParamAxes`, `0x00711A68`; the
`TForm40` constructor at `0x004A87B8`).

| Byte | Bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|---|
| 0 | 0–3 | **Curve number** for physical axis *n* ("Curve N" / "Eq N") | 0 = "Auto" (use the curve with index *n*); 1–8 = curve index + 1 | high | `TForm40::btn_OKClick` (value AND 0xF); `TForm40::SetCurrentAxis` (`0x004A8B94`): 0 → axis index, otherwise value − 1; text " Auto" in `TForm40::CurveNChange` (`0x004A8CD8`); `ctl 0xEC` in `0x00608F30` |
| 0 | 4–7 | unknown | never written by any dispatcher or dialog | — | — |
| 1 | 0–7 | **Anti DZ**: anti-deadzone | percent × 10 (0–25.5 %), stored as round(value × 10.00001) | high (field), medium (that *n* is the logical slot) | `ctl 0xF5` in `0x005D2970`, instructions `0x005DD816`–`0x005DDA54` (a store into byte 1 of the third argument); Logical-tab decimal spin "Anti DZ" (hint "Anti Deadzone", 0–25.5); `TForm37A::CollectLA` |

The same 2-byte entry therefore carries a physical-axis setting (byte 0) and a
logical-axis setting (byte 1). The dispatcher that writes byte 1 is called with
the logical slot, which is the reason the index is rated medium.

Real block: all 16 entries are `00 00` — curve "Auto", anti-deadzone 0.

### 4.2 `0x790 + 4n` (n = 0–15; 4 bytes per slot, `0x790`–`0x7CF`)

Only the 16-bit word at +0 is ever used: every dialog accesses it as a 16-bit
value. Constructors: `TForm37` (`0x004A2B50`), `TForm41` (`0x004A90DC`),
`TForm45` (`0x004AA7C8`), `TForm48` (`0x004AAF54`); the base `0x00F09578` is
`0x790` into the block.

| Word bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|
| 0–3 | **Trimmer source axis** ("AxisNN") | stored = value − 1 (1–16) | high | `TForm37::btn_OKClick` ((value − 1) AND 0xF); `ShowParamAxes` (word AND 0xF) |
| 4–5 | **Trimmer source type** (combo `Src`) | 0, 1, 2 = AUX, P.Norm.Axis, Logical.Axis | high | `TForm37` ((value AND 3) shifted left 4); `ShowParamAxes` (word AND 0x30) shifted right 4 |
| 6–9 | **Virtual-input source axis** (input type Virtual; "AxisNN") | stored = value − 1 (1–16) | high | `TForm48::btn_OKClick` (((value − 1) AND 0xF) shifted left 6, combined with word AND 0xFC3F); `ShowParamAxes` (word AND 0x3C0) shifted right 6 |
| 10–15, and bytes +2, +3 | unknown | never touched | — | — |

Real block: the whole range `0x790`–`0x7CF` is `00`. A zero source for a Virtual
input therefore means axis 1.

---

## 5. Response curves

`0xBC + 10i` (i = 0–7); 10 bytes each, `0xBC`–`0x10B`.

Byte *k* (k = 0–9) is the curve value at input (k + 1) × 10 %. Which curve an
axis uses is set by the Eq bit (physical byte 3, bit 4) and the curve number
(§4.1, byte 0; 0 = the curve with the axis's own index).

| Item | Encoding | Confidence | Evidence |
|---|---|---|---|
| Curve *i*, byte *k* | one byte per point, 0–255 (the editor rejects larger values). 10 points per curve when the flag at `0x00F081A3` is 0 | high | `RefreshParam` (`0x00711BD4`) passes `0xBC + 10i` to the function at `0x006D98F0`, which reads 10 edit boxes (ID `0xFA`, labelled "10 %" … "100 %", created in `TMainForm::TabSheetEqualizerActivate`, `0x004FF244`); `TMainForm::f_AXIS_Value_Change` (`0x0041E06C`) |
| Meaning of the value | output at input *x* = *x* × value / 128, so `0x80` is unity gain at that point (identity curve); values above `0x80` are allowed and the chart rescales to 255 | medium: this is how the editor *draws* the curve | `TMainForm::f_AXIS_Show_Curve` (`0x0041C398`): pixel y = H − ((k + 1) × v × H) / (10 × 128) |
| `0x0D`, bit *i* | "99 % mode" of curve *i*, toggled by double-clicking the curve | high (bit position), low (what the device does with it) | `TMainForm::f_AXIS_DoubleClick` (`0x0041DB8C`) toggles bit *i* of the byte at `0x00F08DF5` (`0x0D` into the block); drawn in `f_AXIS_Show_Curve` |

In the real block curves 0–3, 6 and 7 are the identity (`80` ten times). Curves
4 and 5 are identical to each other and are `3A 42 4A 51 59 61 69 70 78 80`
(§8). The physical Eq bit is 0 on every axis in the real block, so these curves
are stored but not enabled.

---

## 6. Axis-to-buttons words

`0x30C + 2n` (n = 0–7); 2 bytes each, `0x30C`–`0x31B`. Evidence: the loop in
`RefreshParam` passes `0x00F090F4 + 2i` (`0x30C` into the block) to
`0x006DA3A8`; dialog `TForm42` (constructor at `0x004A966C`;
`TForm42::btn_OKClick`, `0x004A9DF0`); dispatcher `0x00631060` (IDs `0xFB`–`0xFF`);
`ShowParamAxes` (properties of the `TzA2BBtn` control).

| Byte | Bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|---|
| 0 | 0–1 | **Type of division into zones** | 0 = OFF, 1 = "Edges 1", 2 = "Edges 2", 3 = "Zones". The combo also offers "Limit Sw. Up", "Limit Sw. Dn", "Limit Sw. U/D"; these are stored as: Up = bits 0–1 = 3 and NumZ = 1; Dn = NumZ = 0 (bits 0–1 left as they were); U/D = bits 0–1 = 2 and NumZ = 1 | high for 0–3, medium for the limit-switch mapping | `TForm42::btn_OKClick`; dispatcher `0x00631060` |
| 0 | 2–5 | **Number of zones** | 0–15 | high | `ctl 0xFC` (AND 0xF, shift left 2); `TForm42` `NumZ`, maximum 15 |
| 0 | 6–7 | **Hysteresis**, % of zone | index into `[0, 1, 3, 5]` % | high | `ctl 0xFD`; `TForm42` `HIST` items `[0 1 3 5]` |
| 1 | 0 | unknown flag | written by `ctl 0xFF` as (value − 1) AND 1, in the dispatcher only; preserved by `TForm42` | low | dispatcher `0x00631060` |
| 1 | 1–7 | **1st virtual button** | stored = value − 1 (1–128) | high | `ctl 0xFE`; `TForm42` ((value − 1) × 2 combined with byte AND 1) |

The button side of the tool reads the same words as virtual-button definitions
([`BLOCK-BUTTONS.md`](BLOCK-BUTTONS.md)). Which axis index space the words use —
logical or physical — was not determined; the association is by slot number.
The "Axis" spin on the Aux tab (`ctl 0xFA`) is not in the dispatcher's table.

Real block: slots 0–5 are identical — type OFF, 0 zones, 0 % hysteresis, first
virtual button 2. Slots 6 and 7 have type OFF but non-zero zone counts (5 and
3), hysteresis 5 % and first virtual buttons 57 and 62; these read as stale
values, and slots 6 and 7 are the disabled Slider and Dial axes.

---

## 7. Calibration data and the "calibrated" mask

### Where it lives

For each physical axis *n*, in its record (`0x7C + 8n`, or `0x65A + 8(n − 8)`):

| Quantity | Location |
|---|---|
| **KdHi** | byte 4 |
| **KdLo** | byte 5 |
| **Bias** | bits 0–12 of the word at bytes 6–7, signed |
| **MPL** | byte 1, bits 0–3 |
| **Dir** | byte 3, bit 2 |
| **Base** quadrant | byte 3, bits 0–1 |
| **ACn**, **ACl** | byte 0, bits 0 and 1 |

Source: `TForm45` (the "Calibration Options" dialog; `Init`, `0x004AAB84`,
`btn_OKClick`, `0x004AAC68`) and `TForm37A::CollectPA`. ***static***, high.

| Offset | Bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|---|
| `0x0C` | *n* (0–7) | axis *n* is calibrated | 1 = calibrated | high | written by the physical-tab control `ctl 0xF1` ("Calibrated"): instructions `0x006128DC`–`0x006128FB` (shift, then `or` / `and` on the byte at `0x00F08DF4`, which is `0x0C` into the block). The real block holds `FF`: all eight axes flagged |

### What the data is

There is **no minimum / centre / maximum triplet** in the block. The stored
model is: Bias = zero offset, KdLo and KdHi = two gain coefficients, MPL = a
binary scale. By the manual's wording (Table 3.1: "KdHi/KdLo: factor specifying
(together with MPL) the upper/lower level of axis response; Bias: zero point")
the raw sensor value is offset by Bias and scaled separately below and above
centre; this reading comes from that wording and the field layout, and is
medium. The exact arithmetic is in the firmware and was not recovered.

KdHi, KdLo and Bias are **per-unit values**, not defaults: the unused axes
(slots 6 and 7 here, and slots 8–15) hold KdHi = KdLo = 255 and Bias = 0 (the
manual gives 255 as the analog default Kd), while the used axes hold values
that differ between units (§9) and are read as measured calibration results.

Calibration is carried out by the device. The tool contains no code that derives
Kd or Bias; it sends short commands and reads the block back. The commands are
catalogued in [`COMMANDS.md`](COMMANDS.md); none was sent to a device. Whether
starting or ending a calibration also changes ACn, ACl or the calibrated mask is
not visible in the binary (low).

---

## 8. Worked example

From the real block (Gladiator EVO R, firmware 2.20.C), slots 0–2 and curve 4.
Bytes 4–7 of the physical records are per-unit calibration (KdHi, KdLo, Bias) and
are shown as `..`.

**Logical records** (`0x3C`, `0x44`, `0x4C`):

| Slot | Bytes | Decoded |
|---|---|---|
| 0 | `B0 00 0C 1E 0A 00 00 00` | AxisID 1; En 1, Vs 1, In 0, Cn 1; HID usage 0 = **X**; precision 12; R 0, RMpl 1×, TCurve Linear; Dz Lo `1E` = 3.0 %; Dz Hi `0A` = 1.0 %; combine OFF, mode Absolute |
| 1 | `B1 01 0C 1E 0A 00 00 00` | AxisID 2; enabled and visible; HID usage 1 = **Y**; otherwise as slot 0 |
| 2 | `B2 05 0B 64 0A 00 00 00` | AxisID 3; enabled and visible; HID usage 5 = **Rot Z**; precision 11; Dz Lo `64` = 10.0 %; Dz Hi 1.0 % |

**Physical records** (`0x7C`, `0x84`, `0x8C`):

| Slot | Bytes | Decoded |
|---|---|---|
| 0 | `97 C9 64 28 .. .. .. ..` | byte 0 `97`: ACn 1, ACl 1, R 1, input bit 0 = 0, HF 1, trimmer mode "-2-". Byte 1 `C9`: MPL 9, Ext 0, filter grade 6. Byte 2 `64`: threshold 100. Byte 3 `28`: Base 0, Dir 0, input bit 1 = 1, Eq 0, trimmer "+", input bit 2 = 0. Input type = 0 + 2 + 0 = 2 = **A_MaRS** |
| 1 | `93 C9 64 28 .. .. .. ..` | as slot 0 but R 0 (byte 0 `93`): **A_MaRS** |
| 2 | `97 C9 64 80 .. .. .. ..` | as slot 0 except byte 3 `80`: trimmer OFF, input bit 2 = 1, so input type = 4 = **V_MaRS** |

**Curve 4** (`0xBC + 40 = 0xE4`): `3A 42 4A 51 59 61 69 70 78 80`. By the editor's
drawing rule (output = input × value / 128) this gives about 0.045, 0.103,
0.174, 0.253, 0.349, 0.453, 0.557, 0.654, 0.738 and 1.0 at inputs of 10 % to
100 %: a soft-centre S response. Curve 5 is identical.

Read together: logical slots 0 and 1 are X and Y, bound through AxisID to
physical slots 0 and 1, which are A_MaRS sensors; logical slot 2 is the twist on
Rot Z, bound to physical slot 2, a V_MaRS sensor. The rest of slots 0–7 reads
as: Z (throttle) enabled and visible on an Analogue input; Rot X and Rot Y (the
mini-stick) enabled and visible; Slider and Dial disabled. That matches a
Gladiator EVO. Further checks recorded by the analysis:

- X and Y on A_MaRS and twist on V_MaRS match the manual's wording.
- MPL 9 on the three MaRS sensors and 8 on the analogue and virtual axes
  matches the manual's defaults ("MPL 9 for D_MaRS, 8 for analog", Table 3.1).
- Precision 12 on X, Y and the mini-stick, 11 on twist and throttle; Dz Lo 3 %
  on X and Y, 10 % on twist and mini-stick, 0 on throttle: plausible.
- The curves 4 and 5 are the plausible factory response for the mini-stick
  (axes 4 and 5 are Rot X and Rot Y), stored but not enabled.

Points that do not fit cleanly:

- The manual's default filter text ("5 for D_MaRS, 6 for analog") is not matched:
  the real block has 6 and 7. The firmware defaults may differ (low).
- The throttle (logical slot 3) has the "with centre" bit set although it is
  probably not a centred axis. The tool never clears Cn automatically, so this
  is probably a stored default (low).
- The mini-stick axes (physical slots 4 and 5) decode to input type Virtual
  (3), which the analysis considers surprising; see §10.
- The deadzone-low scale (value × 10 %) is confirmed by the decimal spin's
  scale, but its interpretation on the device is unverified.

---

## 9. What real profiles show

Three blocks were compared: the block read from the stick, and two saved
profiles (profile 1 and profile 2) from another unit of the same model and
firmware.

**Between the two units** (stick against profile 1):

- Every byte that differs in `0x7C`–`0xBB` falls in **bytes 4–7 of a
  physical-axis record**, i.e. in the per-unit calibration fields (KdHi, KdLo,
  Bias). This agrees with those fields being per-unit values.
- In the logical records the differences are at `0x3F` (logical axis 0, byte 3,
  Dz Lo: 3.0 % on the stick, 20.0 % in the profile) and at `0x6E`–`0x70`
  (logical axis 6, bytes 2–4: precision 12 → 11, Dz Lo and Dz Hi 10 % → 0).
  These are fields a user can edit, and the differences are consistent with
  that.
- Outside the axis structures the two also differ at `0x330` and `0x332`, which
  are not axis fields and are not examined here.

**Between the two saves from the same unit** (profile 1 against profile 2): inside
the axis structures **one bit differs — bit 2 of byte 0 of physical-axis
record 1 (offset `0x84`)**. The layout reads that bit as **R**, the inversion of
physical axis 1. The only other difference between the two saves is at `0x15D`,
outside the axis structures (see [`BLOCK-BUTTONS.md`](BLOCK-BUTTONS.md)).

What this supports: the calibration bytes of the physical record differ between
units, and the only difference between the two saves inside the axis structures
is the bit the layout assigns to R. Other fields rest on the code reading and on
the plausibility of the decode; the logical-record differences above are
consistency checks only.

---

## 9a. Confirmed on hardware ***verified***

Each row below is one experiment on the test stick (Gladiator EVO R, firmware
2.20.C): one field changed, the block written, and the stick's HID report
descriptor and idle input report compared with the baseline. The subject was
the throttle — logical slot 3, HID usage Z, fed by physical slot 3 — because it
rests off-centre, so changes show without anyone touching the stick. The
original configuration was restored afterwards.

Baseline: descriptor axis 3 is usage `0x32` (Z) with logical maximum 2047; the
idle report reads Z = 1194.

| Field | Change | Observed | Reading |
|---|---|---|---|
| Logical byte 0 bit 6, **In** | 0 → 1 | Z = 853 | exactly 2047 − 1194: the axis is inverted |
| Physical byte 0 bit 2, **R** | toggled | Z = 858 | inverted at the sensor, before calibration |
| Logical byte 1 bits 0–3, **HID usage** | 2 → 6 | descriptor usage `0x32` → `0x36` | index 6 is Slider, as in §2.1 |
| Logical byte 2 bits 0–3, **Precision** | 11 → 12 | logical maximum 2047 → 4095; Z = 2389 | bits of resolution |
| Logical byte 0 bit 5, **Vs** | 1 → 0 | descriptor usage becomes undefined (`0:00`); value still reported | hidden from the PC, still computed |
| Logical byte 0 bit 4, **En** | 1 → 0 | Z = 0 | axis off |
| Logical byte 0 bits 0–3, **AxisID** | 4 → 1 | Z = 1024, the centre | now fed by sensor 1 (stick X, at rest) |
| Logical byte 0 bit 7, **Cn** | 1 → 0 | Z = 340 | a different scaling: full travel instead of centre-out |
| Logical byte 3, **Dz Lo** | 0 → 25.5 % | Z = 1024 | snapped to centre: 1194 is inside a ±25.5 % centre deadzone |
| Logical byte 4, **Dz Hi** | 3.0 → 25.5 % | Z = 1246 | deflection from centre grew ×1.31; (1 − 0.03) / (1 − 0.255) = 1.30 |
| Logical slot 6, **En** and **Vs** | 0 → 1 | descriptor axis 6 becomes usage `0x36`; value 2048 | a disabled axis appears, as Slider |
| Logical byte 6 bit 7, **Mode** | 0 → 1 | Z = 1230 | *something* changed; this does not show it is "relative mode". Still ***static*** |

The filter grade (§3.2) was written and read back earlier, but its *effect* has
never been observed. By the standard used in this table it is not confirmed.

---

## 10. Not determined

The following were not determined, or only guessed.

1. **Names of combine types 6, 7 and 8.** The dialog's index-to-code table is
   `{0, 1, 2, 3, 4, 5, 8, 6, 7, 9}`; the names "BrakeV 2", "BrakeV 3" and
   "BrakeV V1" come from the Logical-tab combo in an unverified order, and the
   analysis's two assignments disagree (§2.2). Medium at best.
2. **Unknown bits.** Logical byte 1 bit 7, and the meaning of logical byte 1
   bit 5 (read only in `GetParDZ0` as the 2-D "mode 2" switch); physical bytes
   6–7 bits 13–15; byte 0 bits 4–7 of `0x69A + 2n`; word bits 10–15 and bytes +2,
   +3 of `0x790 + 4n`; bit 0 of byte 1 of an axis-to-buttons word. All are zero
   in the real blocks. For all but the last, no dispatcher or dialog found
   writes them (the two axis dispatchers cover only IDs `0xC9`–`0xDC`,
   `0xF3`–`0xF5` and `0xD5`, `0xDD`–`0xF1`; the analysis lists `0xD5` for both).
   For the axis-to-buttons bit the
   analysis lists it with these but also records that `ctl 0xFF` writes it
   through dispatcher `0x00631060` (§6); its meaning is unknown either way.
3. **The firmware's calibration arithmetic** — how Bias, KdLo, KdHi and MPL are
   combined — and **whether an axis with input type Virtual really is virtual**
   (the mini-stick axes in the real block). The order of the input-type items
   `{D_MaRS, Analogue, A_MaRS, Virtual, V_MaRS, Trimmer, Shunt}` comes from the
   `TForm48` form definition, and equality of the stored value with the item
   index is assumed. If it does not hold, the order is wrong for values 3 and
   up.
4. **"Pulse Filter" (`ctl 0xE2`) and `ctl 0xE4` ("Anti"?).** Neither has a case
   in the standard-layout dispatcher `0x00608F30`; they fall to the default, and
   no block field was found for them. The analysis's sentence also mentions
   `ctl 0xE5` ambiguously; the filter-grade row (§3) cites `ctl 0xE5`, and it is
   not stated whether the sentence means to include it.
5. **Which axis index space the axis-to-buttons words use** (logical or
   physical), and **what the flags `0x00F081CE` and `0x00F086D0` (shifted right
   by 5) hold for this unit**, i.e. whether the second bank of slots 8–15 is
   active.
6. **The 2-D circular deadzone.** The write path in `TForm37A::CollectLA` for
   the standard layout is only taken when the flag at `0x00F081A3` is non-zero
   (instruction `0x004A4A70`: `cmp byte [0xF081A3], 0 ; jne`); with the flag at 0
   it writes the 12-byte "profile" layout at `0x00F0C5E8` instead. The analysis
   takes this device to have the flag at 0. Either the 2-D deadzone is not
   available on it or the reading of that flag's polarity is off; this was
   flagged and not resolved.
7. **Firmware older than `0x2187`.** The combine, absolute/relative and
   deadzone-low editors exist as dialog buttons only from `0x2187`; the test
   unit (`0x220C`) is above it, and the older inline controls were not examined.

Further open points recorded elsewhere in the analysis:

- **The two R bits.** Logical byte 2 bit 4 and physical byte 0 bit 2 are both
  described as "physical data inversion"; their relationship is not explained.
- **Combine "#Axis" range.** The dialog accepts 1–16; only 3 bits are stored.
- **Limit-switch storage** in the axis-to-buttons word is medium; the unknown
  flag in byte 1 bit 0 is low.
- **Curve semantics.** The output rule (× value / 128) is how the editor draws
  the curve; what the firmware does is not known. The effect of the "99 %
  mode" bit on the device is unknown (low). A second layout, selected by the
  flag at `0x00F081A3`, uses 20 points per curve; the real block's table of
  8 curves × 10 bytes is the 10-point layout.
- **Why slots 8–15 look like templates**, and what the non-zero bytes at
  `0x5E0`, `0x603` and `0x607` are.
- **`0x31C`–`0x33F`**, after the axis-to-buttons words, belongs to the
  Trigger/Brake virtual-button code (`TMainForm::Trigger_VBUT1Change`,
  `0x00514DA4`; `TMainForm::Brake_VBUT1Change`, `0x00514E54`; `0x006DAA74`) and
  is not decoded here.
