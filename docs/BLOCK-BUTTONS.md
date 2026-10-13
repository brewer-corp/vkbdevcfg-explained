# Parameter block: buttons

Field map of the button structures in the 4096-byte parameter block described in
[`PARAMETER-BLOCK.md`](PARAMETER-BLOCK.md). All offsets are offsets into that
block. The layout is from **static analysis** of `VKBDevCfg-C.exe` v0.93.89:
for each structure the code that writes it into the block and the code that
reads it back out were located, and the encodings were taken from that code. The
decode was then checked for plausibility against real blocks — one block read
from a VKBsim Gladiator EVO R (firmware 2.20.C) and two saved profiles from
another unit of the same model — in the sense that it reads as a sensible
configuration. That is a consistency check, not a proof of what the firmware
does with each field.

**Several encodings here are *verified* on hardware** (§11a): the logical
entry forms Button *N*, second button, HAT, No Function and Void; and the
physical forms plain Button with its two shift fields, POV Switch, NoF and
SHIFT. They were tested without anyone touching the stick, by using an axis
divided into zones to hold virtual lines down. Every other row in this
document is ***static***, in the sense used by [`PROTOCOL.md`](PROTOCOL.md):
read out of the binary, not tested on a device. Which physical control is
wired to which line has not been tested at all.

Confidence is **high**, **medium** or **low**:

- **high** — observed in the tool's code, with the writer and the reader
  agreeing;
- **medium** — read from one place only, or inferred;
- **low** — a guess, or a placeholder reading;
- **—** — not determined.

Statements that are inference rather than observation are marked *inferred*. In
the table of physical function types (§2.3) the confidence column reads
"type code / parameter layout". A rating such as "high (encoding), medium
(firmware meaning)" rates the parts separately.

Notation. Block offsets are written with at most three hex digits (`0x10C`);
addresses in the executable with eight (`0x0045CB64`). Several rows depend on
device-generation flags in the tool, at `0x00F081A3`, `0x00F081A4` and
`0x00F081A5` (called A3, A4 and A5 here). The analysis takes the test device to
have A3 = 0, A4 = 1 and A5 = 1, with a block of `0x1000` bytes. A3 selects an
alternate layout, a 0xC00-byte per-profile record, used by other device
families; it has its own editor (`TForm11`) and is not covered here. The
dialog that edits one physical line and its logical function is `TForm10`.

---

## Summary of structures

| Block offset | Record size | Count | What |
|---|---|---|---|
| `0x0E` | bits 6–7 | 1 | "Advanced Mapping with virtual layer" switch; only the reader side was found (§7) |
| `0x13` | bit 5 | 1 | extra enable for the extended button registers (§9) |
| `0x20` | 2 | 1 | register mask (§9) |
| `0x22`–`0x24` | 1 (bits 0–2) | 3 | port-mode bytes; mode 2 = extended button registers (§9) |
| `0x34` | 4 | not stated | axis-as-buttons records; referenced only (§9) |
| `0x10C` | 2 (4 for two function types) | 128 | **physical table**: the physical function of each physical line (§2) |
| `0x20C` | 2 | 128 | **logical table**: the logical function of each output line (§4) |
| `0x30C` | 2 | 8 | virtual-button definitions; the same words as the axis-to-buttons words (§8) |
| `0x31C`, `0x328` | not stated | 2 | Trigger and Brake virtual-button records; referenced only (§9) |
| `0x330` | 16 | 8 | external-device records; referenced only (§9) |
| `0x4F0` | 8 | 30 shown at a time; total not determined | Boolean function table, Gladiator-class devices (§6.2) |
| `0x800` | 2 | 128 | physical-record extension (§3) |
| `0x900` | 2 | 128 | virtual-layer record; not decoded (§7) |
| `0xA00` | 2 | 128 | virtual-layer extension; not decoded (§7) |

---

## 1. How the tables fit together

VKB's model (see [`MANUAL-DIGEST.md`](MANUAL-DIGEST.md) §1.1–§1.2) is a
pipeline: **physical line** → **physical function** → **logical line** →
**logical function**. There are 128 lines, grouped eight to a register
(16 registers). In the block:

- the **physical table** (`0x10C`, 2 bytes per physical line) holds the
  *physical function* of each line — plain button, toggle, POV direction,
  encoder, shift, and so on;
- the **logical table** (`0x20C`, 2 bytes per line) holds the *logical function*
  of each *output* line — which HID button, hat direction, key, mouse action,
  macro or command the line's result is mapped to.

*Inferred (medium; the encodings are high):*

1. An input event arrives on physical line *L* (0–127).
2. The physical record at `0x10C + 2L` decides the behaviour. A plain Button
   outputs line *L* with no shift, its S1 line while SHIFT1 is held and its S2
   line while SHIFT2 is held. Toggle, Tempo, ButAlt, Radiobutton, ButtonS /
   ButtonM / ButtonX / ButtonD, Cyclic Switch, Encoder and Boolean functions
   produce one or more output lines. POV, uStick and uPOV functions produce hat
   or mini-stick output directly, with no logical entry needed. NoF disables the
   line.
3. The logical record at `0x20C + 2 × (output line)` decides what the output
   line does.
4. The extension entry at `0x800 + 2L` carries the extra bits that firmware 2.13
   and later add.

For a plain physical Button on line *L* with no shift, the firmware outputs the
logical entry for *L*; its button number is `(lo AND 0x7F) + 1`. This is
inferred from the editor and the manual, not observed.

On the real block the 30 non-empty logical entries all have high byte `FF` and
low byte `80`–`9D`, so HID buttons 1–30 each appear exactly once (§10).

---

## 2. Physical table

`0x10C`–`0x20B`: 128 entries of 2 bytes, indexed by physical line 0–127. The
size comes from `TMainForm::btnReadParamClick` (`0x0041133C`; instructions
`0x00411A87`–`0x00411B4E`, the A3 = 0 branch), which sets the table sizes to
`0x100` and copies `0x100` bytes from block offset `0x10C`, `0x20C`, and — when
A5 is set — `0x800`, and — when the flag at `0x00F081D9` is set — `0x900` and
`0xA00`, into the tool's working arrays. `TMainForm::btnSaveParamClick`
(`0x00413B20`) and `TMainForm::RefreshParam` (`0x00711BD4`) copy back the other
way. High.

### 2.1 Record format

Dialog code: `TForm10::SetDataP` (`0x00459BC4`) copies the line's record into
the dialog's edit buffer and `TForm10::SyncDataP` (`0x00459B04`) writes it back;
the size comes from `TForm10::get_size_P` (`0x00459680`).

| Byte | Bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|---|
| 0 | 3–7 | **type** | 5-bit function type (§2.3), when byte 0 < `0x80` | high | the physical-record reader (`0x0045556C`) and writer `TForm10::FunctionChange` (`0x0045CB64`) agree |
| 0 | 0–2 | **sub** | 3-bit variant of the type | high | as above |
| 1 | 0–7 | **parameter** | function-specific (§2.3) | medium | the reader's getters; not every bit checked against the writer |
| 2–3 | — | present in **4-byte** records only | taken from the *next* table entry (entry *i* + 1), which is consumed as extra parameter bytes | high | `get_size_P`; `TMainForm::Get_ButtonsP_Active` (`0x00425AA4`) skips entry *i* + 1 after such a type |

Size rule (`get_size_P`): the record is 4 bytes if `byte 0 >> 3` is 4 (Boolean)
or `0xC` (Encoder), and 2 bytes otherwise. `SetDataP` copies 2 bytes only for the
last line.

A byte 0 of `0x80` or more is not a type: it marks a **plain Button** (§2.2).

### 2.2 Plain Button (byte 0 bit 7 set)

| Byte | Bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|---|
| 0 | 7 | plain-Button marker | 1 | high | `FunctionChange` "Buttons" branch; reader tail |
| 0 | 0–6 | **S1**: output line used while SHIFT1 is held | line number 0–127; the editor shows S1 + 1. `0x7F` (shown as 128) means "no SHIFT1" | high (encoding), medium (firmware meaning, *inferred*) | `TForm10::S1_BUTChange` (`0x0045A89C`); reader tail |
| 1 | 0–6 | **S2**: output line used while SHIFT2 is held | as S1 | high (encoding), medium (firmware meaning, *inferred*) | `TForm10::S2_BUTChange` (`0x0045A97C`); reader tail |
| 1 | 7 | set by the tool when S2 is edited; ignored by the editor when reading | firmware meaning **unknown** | low | `S2_BUTChange`; see §11 |

A press with no shift outputs the line's own number *L* (*inferred*). The editor
shows "no SHIFT" when the displayed value equals *L* + 1 or 128. The
S1 and S2 spin edits have the double-click handler `GetVirtualButton`
(`TForm10::GetVirtualButton`, `0x00460828`): they pick a virtual button / line
number.

Three forms of the same record occur:

| Form | Byte 0 | Byte 1 | Written by |
|---|---|---|---|
| default from the "Buttons" combo | `0x80` OR *L* | *L* (bit 7 clear) | `FunctionChange` |
| after S1 or S2 is edited | (S1 − 1) OR `0x80` | (S2 − 1) OR `0x80` | `S1_BUTChange`, `S2_BUTChange` |
| "none" | `0xFF` | `0xFF` | `S1_BUTChange`, `S2_BUTChange`, when the spin shows 128 |
| found in the real block | `0xFF` | `0x7F` | — (the analysis calls this the factory default) |

"No shift" is therefore stored as S = *L* (the tool's default) or as S = `0x7F`.
Whether the firmware treats `0x7F` specially or falls back to *L* has not been
verified.

### 2.3 Function types (byte 0 below `0x80`)

Reader: the function at `0x0045556C` (record → dialog; a `switch` on
`byte 0 >> 3`). Writer: `TForm10::FunctionChange` (default record for each combo
item) and the setters named in the rows. Confidence reads "type code /
parameter layout". Type codes are high because writer and reader agree;
parameter layouts are medium because they were read from the dialog's getters
and not every bit was checked against the writer.

| Byte 0 | Type / sub | Function | Size | Parameter bytes | Confidence | Evidence |
|---|---|---|---|---|---|---|
| `0x00` | 0 / 0 | **AUX Axes** | 2 | b1 bits 0–2 = source − 1, bits 3–5 = destination − 1. In firmware 2.2 and later the extension entry (§3) extends source and destination to 16 axes | high / medium | reader case 0; default b0 = 0, b1 = 0 |
| `0x08`–`0x0F` | 1 / sub | **Generator** | 2 | sub = generator type; b1 + 1 = value (7 bits; 6 bits for sub 4 and 5; the remaining high bits are the multiplier) | high / medium | reader case 1; default b0 = `0x08`, b1 = 0 |
| `0x10`–`0x17` | 2 / sub | **Fix Axes** | 2 | sub 0–7 = FA type (0–4 plus an alternate flag); b1 = axis-mask style value | high / medium | reader case 2; default b0 = `0x10`, b1 = 0 |
| `0x18`–`0x1F` | 3 / sub | **Cyclic Switch** | 2 | sub + 1 = positions; b1 AND `0x7F` = first button index − 1; b1 bit 7 = reversible | high / medium | reader case 3; default b0 = `0x18`, b1 = 0. The analysis also states that with A5 set and "logical byte 0 bit 7" the dialog shows "Detent Set" instead; that is not explained, and §3 puts "Detent Set" at bit 7 of extension byte 0 |
| `0x20`–`0x27` | 4 / sub | **Boolean** | **4** (entries *i* and *i* + 1) | b1, b2, b3: operands and operation (§6.1) | high / medium–low | reader case 4; default b0 = `0x20`, b1 = b2 = *L*, b3 = 0, offered only if *L* mod 8 < 7 (otherwise the tool refuses: "This line prohibited for selection BOOL function, RTFM"); `get_size_P` = 4 |
| `0x28` | 5 / 0 | **Sync** | 2 | b1: bit 7 = SYNC_MODE, bits 3–4 = SYNC_SET, bit 0 = Tgl, bit 1 = BA, bit 5 = Aux, bit 6 = Bool | high / medium | reader case 5/0; default b0 = `0x28` |
| `0x29` | 5 / 1 | **RPB** (Replica Button) | 2 | b1 + 1 = replica source button | high / medium | reader case 5/1; default b0 = `0x29`, b1 = 0 |
| `0x2A`, `0x2B` | 5 / 2, 5 / 3 | **Curves** (sub 3 = "Alt") | 2 | b1 = curve data, plus the axis through the function at `0x00453B0C` | high / medium | reader case 5/2, 5/3; default b0 = `0x2A`, b1 = 0 |
| `0x2C`, `0x2D` | 5 / 4, 5 / 5 | **Rel Axes** | 2 | sub 4 / 5 = `cmb_REL_AX_F` 0 / 1 | high / medium | reader case 5/4, 5/5; default b0 = `0x2C` |
| `0x2E` | 5 / 6 | **uStick Switch** | 2 | b1: bits 0–1 + 1 = uStick POV number, bits 2–4 = switch type, bits 5–6 = mode / short mode, bit 7 = start mode | high / medium | reader case 5/6 |
| `0x2F` | 5 / 7 | **Parametric** | 2 | b1 = axis / parameter | high / medium | reader case 5/7; default b0 = `0x2F` |
| `0x30`–`0x37` | 6 / sub | **Trimmer** | 2 | sub = trimmer kind (the analysis gives 0–9 "with firmware tests", which does not fit a 3-bit sub field; unresolved); b1 = axis / step data | high / medium | reader case 6; default b0 = `0x30` (sub left 0) |
| `0x38`–`0x3B` | 7 / 0–3 | **POV Switch** direction | 2 | **sub = direction: 0 = U, 1 = R, 2 = D, 3 = L** (editor tags POV_U / R / D / L = 0–3). b1 bits 0–1 = POV number − 1; where the flag at `0x00F081D5` is set, the bits above hold the virtual controller − 1. b1 OR `0x20` = "ALPS". b1 OR `0x40` = centre push — the analysis writes "sub 4"; in the setter `TForm10::POV_Set` (`0x0045B650`) the editor's direction value 4 is the centre push and is stored with the sub field cleared | high / medium | reader case 7; `POV_Set`; form tags POV_* |
| `0x3C` | 7 / 4 | **uPOV Switch** ("uPOV Active Switch") | 2 | b1 bits 0–1 + 1 = switch / POV number, bits 2–4 = switch type, bits 5–6 + 1 = uPOV number | high / medium | reader case 7, sub 4 |
| `0x40`–`0x43` | 8 / 0–3 | **ButtonX** ("Button with Extended Mode") | 2 | b0 bit 0 = Use SHIFT1 (virtual buttons 3 and 4), bit 1 = Use SHIFT2 (virtual buttons 5 and 6); (b1 AND `0x7F`) + 1 = base virtual button | high / medium | reader case 8 (b0 AND 4 = 0); `SubFunctionChange` default b0 = `0x40`, b1 = 1 |
| `0x44`–`0x47` | 8 / 4–7 | **Switch CB** ("Switch with Complementary Button") | 2 | (b1 AND `0x7F`) + 1 = complementary button; switch number SWC_N = ((b1 AND `0x80`) >> 5) OR (b0 AND 3) | high / medium | reader case 8 (b0 AND 4); default b0 = `0x44`, b1 = `0x7F`; `Get_ButtonsP_Active` flags line (b1 AND `0x7F`) with `0x2000` |
| `0x48`–`0x4B` | 9 / sub | **SHIFT** | 2 | b0 AND 3 = which shift, bit 2 = "Track as button", b1 = mode and number; see §5. The analysis's table gives `0x48`–`0x4B`; its own description of bit 2 would extend the range to `0x4F` | high / medium | reader case 9; `TForm10::SHIFTChange` (`0x0045C258`); default b0 = `0x49`, b1 = `0xFF` |
| `0x50`–`0x55` | 10 / sub | **Tempo** | 2 | sub = TEMPO_Type (0–5); for sub 3, b1 holds three time classes (bits 0–1 = SP, bits 2–3 = LP, bits 4–5 = DP); otherwise b1 + 1 = second button | high / medium | reader case 10; default b0 = `0x50`, b1 = *L* + 1 |
| `0x58`–`0x5B`, `0x5F` | 11 / 0–3, 7 | **Toggle** | 2 | b1 bit 7 = "not slave", b1 AND `0x7F` = partner line; a partner equal to the line itself is "Dual Action" | high / medium | reader case 0xB (else branch); default b0 = `0x5A`, b1 = *L* + 2 |
| `0x5C` | 11 / 4 | **ButAlt** (when b1 >> 5 = 7) or **Radiobutton** (otherwise) | 2 | ButAlt: b1 bit 0 = BA_STATE, bit 1 = pulse (inverted), bits 2–4 = BA_RESET XOR 3. Radiobutton: (b1 >> 5) + 1 = group number, bit 0 = master, bit 1 = alternate | high / medium | reader case 0xB, sub 4; `SubFunctionChange` writes b1 = `0xFF` (ButAlt) or 0 (Radiobutton) |
| `0x5D` | 11 / 5 | **Rotary switch** | 2 | not further decoded | high / — | reader case 0xB, sub 5 |
| `0x5E` | 11 / 6 | **ButtonD** (Dependent Button) | 2 | b1 + 1 = master button. Extension byte 0 (§3): low nibble = press delay, high nibble = release (master) delay, × 10 ms | high / medium | reader case 0xB, sub 6; `SubFunctionChange` writes b0 = `0x5E`, b1 = *L* + 1; the function at `0x00737D6C` |
| `0x60`–`0x67` | 12 / sub | **Encoder** | **4** | sub = ENC mode; b1, b2, b3 = the three outputs (§2.4) | high / medium | reader case 0xC; default b0 = `0x61`, b1 = b2 = b3 = *L*; `get_size_P` = 4 |
| `0x68`–`0x6F` | 13 / 0, 13 / 2 | A5 only: **Curves v2** (sub 0) and **Parametric v2** (sub 2) | 2 (+ extension) | Curves v2: b1 bit 7 = alternate, bits 4–6 = curve − 1, bits 0–3 = axis − 1; extra axis / curve pairs in the extension entry (§3). Firmware 2.2 and later | medium–low | reader case 0xD |
| `0x70` | 14 / 0 | **SubSHIFT** | 2 | b1: bits 0–2 = SubSHIFT number, bit 3 = type (Type_SW_SubSHIFT), bits 4 / 5 / 6 = S0 / S1 / S2 state combinations, bit 7 = track as button (`cb_SubSHIFT_but`) | high / medium | reader case 0xE, sub 0; default b0 = `0x70`, b1 = 1 |
| `0x71`–`0x77` | 14 / 1–7 | **ButtonS** (b1 bit 7 = 0: under SubSHIFT number *sub*, 1–7) or **ButtonM** (b1 bit 7 = 1: under a Modal Switch, MSw = *sub* AND 3) | 2 | b1 = output line / virtual-button counter, +1 convention | high / medium | `TForm10::SubFunctionChange` (`0x0045C618`) writes b1 = *L* + 1 for ButtonS and (*L* + 1) OR `0x80` for ButtonM; default b0 = `0x71` for both |
| `0x7F` | 15 / 7 | **NoF** (no function) | 2 | b1 anything; `FunctionChange` leaves `0xFF` | high / — | `FunctionChange` last branch; reader `default` |

`FunctionChange` maps all 22 combo items to default records: Buttons, Curves,
SHIFT, SubSHIFT, Toggle, Encoder, Cyclic Switch, POV Switch, uStick Switch, uPOV
Switch, Switch CB, Generator, Tempo, Trimmer, Boolean, Fix Axes, AUX Axes, Rel
Axes, Parametric, RPB, Sync, NoF. The further functions the manual counts
(ButtonX, ButAlt, Radiobutton, ButtonM, Dependent Button, Rotary switch, Detent
Set, Curves v2) are sub-variants of the same 5-bit type codes, chosen through the
`SubFunction` combo; about 26 (type, sub) variants are decoded by the reader,
as in the manual.

The analysis is not consistent with itself in several places, flagged in the
rows above (the SHIFT range, the Trimmer sub range, the Cyclic Switch "Detent
Set" condition) and in two more:

- The type table lists ButtonM as `0x71`–`0x77` with MSw = *sub* AND 3, while the
  description of the shift model (§5) gives ButtonM as `0x71`–`0x73`.
- The type table also lists `FF 7F` as "line not present / unused?", while the
  decode of the real block (§10) reads `FF 7F` as a plain Button with no shift.
  Under the plain-Button encoding (byte 0 bit 7 set) it is a Button; the first
  label carries a question mark in the analysis and the two are not reconciled.

### 2.4 Encoder record (type 12, 4 bytes)

Writer: `TForm10::ENC_Change` (`0x0045B0F0`); reader case 0xC. *Medium.*

| Byte | Field | Encoding / values |
|---|---|---|
| 0 | type and mode | `0x60` OR ENC mode (sub 0–7). The record spans entries *L* and *L* + 1 |
| 1, 2, 3 | the three outputs (ENC_B1, B2, B3; for example clockwise, counter-clockwise, press) | bit 7 = 0: a plain output line number 0–127, stored directly (UI value − 1). Bit 7 = 1: a "typed" output — the low 3 bits (4 bits when extension byte 0 bit 7 is set) = index − 1, and the remaining bits = type / multiplier (combos ENC_TYPE*n*, ENCT_Mpl, ENCT_S1_Mpl, ENCT_S2_Mpl) |

Extension entry (`0x800 + 2L`, firmware 2.13 and later): e0 bits 0–1 =
ENC_SHIFT1 − 1, bits 2–3 = ENC_SHIFT2 − 1, bits 4 / 5 / 6 = output 1 / 2 / 3 uses
ENC_TYPE*n* = 2 (extended type; only firmware `0x217A` and later), bit 7 = the
free-multiplier switch (`cb_FreeMPL`) that selects the field split: set = 4-bit
index and 3-bit type, clear = 3-bit index and 4-bit type.

---

## 3. Physical-record extension

`0x800`–`0x8FF`: 128 entries of 2 bytes, **indexed by the same physical line
number** as the physical table; entry = bytes e0, e1 at `0x800 + 2L`,
`0x801 + 2L`. It is the 2-byte extension of the physical record and is **not**
part of the logical table.

The tool uses it only when A5 is set and the flag at `0x00F081D3` is set; that
flag is derived from the firmware version, with a threshold of 2.13
(instructions `0x00418EE7`), and is true for firmware 2.20. Evidence: the
function at `0x0044F0D4` (called from `TMainForm::Form10_Create`, `0x00423FD0`)
points the dialog's extension pointer at the tool's working copy of this array;
`SetDataP` and `SyncDataP` read and write the entry for the line;
`TMainForm::SheetButtonsPhysicalCreate` (`0x00509850`) gives each line's widget
the pointer to its entry. *Medium* for the fields below (all read from the
reader at `0x0045556C`).

| Function | Extension bytes |
|---|---|
| AUX Axes | e0 bit 6 = source + 8, bit 7 = target + 8 (16-axis range), bit 5 = `cb_AUX_Sync`. With the firmware flag at `0x00F081D8` and b1 bit 6: e1 = ((source 2 − 1) << 4) OR (target 2 − 1) |
| Generator, Fix Axes, Curves, Rel Axes, Parametric, Trimmer | (e0 << 8) OR b1 forms a 16-bit field handed to the function at `0x00453B0C` (axis / curve masks, 8 → 16 axes) |
| Curves v2 (`0x68`) | e0 = ((curve 2 − 1) << 4) OR (axis 2 − 1); e1 = ((curve 3 − 1) << 4) OR (axis 3 − 1) |
| Parametric v2 (`0x6A`) | e0 = parameter, 0–255 (track edit) |
| Cyclic Switch | e0 bit 7 = "Detent Set" mode |
| uStick Switch | e0 bit 0 = `uSSWNoAxes` |
| Trimmer | e0 = `TRIM_MPL_Free` − 1 |
| ButtonD (`0x5E`) | e0 low nibble = press delay, high nibble = release (master) delay, × 10 ms (if the firmware flag at `0x00F081D6` is set) |
| Encoder | see §2.4 |

Real block: `0x800`–`0x8FF` is all `00`.

---

## 4. Logical table

`0x20C`–`0x30B`: 128 entries of 2 bytes, indexed by the *output* line. Each entry
is `(lo, hi)`. Writer: `TForm10::FunctionLChange` (`0x0046008C`). Reader: the
function at `0x0045EA70`, with helpers `0x0045E624` and `0x0045E988`; setters
`TForm10::POVL_Set` (`0x0045FF14`), `TForm10::MICEChange` (`0x0045FC84`),
`TForm10::MACROChange` (`0x0045FC3C`).

The dialog shows the second byte as V = hi + 1 and the key index as lo + 1, so
"hi = value − 1" throughout; `hi = 0xFF` means the value 0, i.e. none.

| lo | Function (combo index) | hi | Confidence | Evidence |
|---|---|---|---|---|
| `0x80` OR (*N* − 1), *N* = 1–127 (bit 7 set) | **Button *N*** (0). `lo = 0xFF` means AutoMapping: the firmware picks the number | `0xFF`: no second button. Otherwise (hi + 1) AND `0x7F` = second button pressed together (BUT2) | high | `FunctionLChange` case 0 (lo = value OR `0x80`, hi = `0xFF`); reader tail: BUT1 = (lo + 1) AND `0x7F`, BUT2 = (hi + 1) AND `0x7F`, lo + 1 = 0 → automatic |
| `0x00` up to a limit (below) | **Keyboard** (2); default lo = 3, hi = `0xFF` | modifier mask M = hi + 1: bit 0 LCtrl, 1 LShift, 2 LAlt, 3 LWin, 4 RCtrl, 5 RShift, 6 RAlt, 7 RWin | high | reader first branch (lo below the limit); the function at `0x0045F584` |
| `0x74` | **HAT** (1) | V = hi + 1 = ((*N* − 1) << 6) OR direction (3 bits: 0 U, 1 UR, 2 R, 3 RD, 4 D, 5 DL, 6 L, 7 LU) OR ((VC − 1) << 3, where the flag at `0x00F081D5` is set). *N* = HAT 1–4. Centre push is tag 8 | lo high; hi packing medium (centre push and VC bits unverified) | `FunctionLChange` case 1 (lo = `0x74`, hi = 0); `POVL_Set`; form tags POVL_U … CP |
| `0x76` | **Macro** (4) | V = hi + 1: bits 0–6 = macro number, bit 7 = repeat (`cb_MACRO_R`) | high | `MACROChange`: V = (repeat << 7) OR number; hi = V − 1 |
| `0x77` | **Mice** (3) | V = hi + 1. Bit 7 = 0: bits 0–2 = mouse button / axis choice, stored as (V AND 7) − 1 (the analysis adds: for the value 6, a set-point *N* follows in bits 3 and up). Bit 7 = 1: scroll wheel — bits 0–2 = speed − 1, bits 4–5 = delay, bit 6 = direction | high | `MICEChange`; reader case `0x77` |
| `0x78` | **System** (8) | hi + 1 = list index + 1, in a 15-entry list | lo high; list contents unknown | reader case `0x78` (loop to 15) |
| `0x79` | **Multimedia** (6) | as above, 13-entry list | lo high; list contents unknown | reader case `0x79` |
| `0x7A` | **Audio** (5) | as above, 9-entry list | lo high; list contents unknown | reader case `0x7A` |
| `0x7B` | **Application** (7) | as above, 39-entry list | lo high; list contents unknown | reader case `0x7B` |
| `0x7C` | **Void** (10) | hi = 0 | high | `FunctionLChange` case 10 |
| `0x7F` | **No Function** (9) | hi = `0xFF` | high | `FunctionLChange` case 9; reader `default` |

The Keyboard range ends at the limit held at `0x00F081DE`: `0x67`, or `0x74`
when the flag at `0x00F081C7` is set and bit 7 of block byte `0x10` is set. For
Keyboard, lo indexes a table of Windows virtual-key codes in the tool at
`0x00E02949`. As far as the analysis lists it, the table begins `01 02 03`, then
`A`–`Z`, `1`–`9`, `0`, then `0D 1B 2E 09 20 BD BB DB DD DC E2 BA DE C0 BC BE BF
14`, then `70`–`7B` (F1–F12), then `2C 91 13 2D 24 21 08 23 22 27 25 28 26 90 6F
6A 6D 6B 0D`, `61`–`69`, `60`, `6E`, `5C 5D`, `7C`–`89` and more. That is the
tool's table; the device-side meaning of lo is unverified (§12). The System,
Multimedia, Audio and Application lists are filled at run time and are not in
the executable image, so their entries are unknown.

The logical functions offered in the combo, in order, are: Button, HAT,
Keyboard, Mice, Macro, Audio, Multimedia, Application, System, No Function,
Void.

Real block: the 30 non-empty entries are all Buttons (hi = `FF`); all others are
`FF FF` (AutoMapping / none).

---

## 5. Shift model

Type code high; field layout medium; firmware semantics *inferred* (medium).

**Global shifts** are physical lines whose record is type 9, **SHIFT**
(`TForm10::SHIFTChange`, `0x0045C258`; reader case 9):

| Byte | Bits | Field | Encoding / values |
|---|---|---|---|
| 0 | 0–1 | which shift | 1 = Shift1, 2 = Shift2, 0 = Shift0 (combo order Shift1, Shift2, Shift0) |
| 0 | 2 | "Track as button" (`cb_SHIFT_but`) | 1 = on; choosing Shift0 forces it |
| 1 | 0–7 | mode and number | stored as (*v* − 1), where *v* bits 0–1 = SHIFT_Mode (0 Momentary, 1 Alternate, 2 Cyclic), bits 2–6 = SS_Num (5 bits), and bit 7 is kept. The tool's default is b0 = `0x49`, b1 = `0xFF` (*v* = 0) |

b0 is `0x48` OR which-shift OR (track << 2). The manual (§4.3.8) allows up to two
shifts, so "one input line can have three outputs".

**SubSHIFT** is type 14, sub 0: b0 = `0x70`; b1 bits 0–2 = number, bit 3 = type,
bits 4–6 = S0 / S1 / S2 states, bit 7 = track as button (§2.3).

Buttons controlled by a SubSHIFT: ButtonS `0x71`–`0x77` (b1 bit 7 = 0), ButtonM
(Modal Switch) `0x71`–`0x73` (b1 bit 7 = 1) and ButtonX `0x40`–`0x43` (see the
inconsistency noted in §2.3).

How the shifts are used (*inferred*):

- A plain Button carries two output line numbers, S1 (`b0 AND 0x7F`, used while
  SHIFT1 is active) and S2 (`b1 AND 0x7F`, used while SHIFT2 is active); its own
  line *L* is used when no shift is active. The logical table is indexed by that
  output line, so each shift state can have a different logical function.
- "No shift" is stored as S = *L* (the tool's default) or S = `0x7F` (the form in
  the real block). Whether the firmware treats `0x7F` specially or falls back to
  *L* is not verified.
- For firmware 2.20 there is no separate shift-layer copy of the tables at
  `0x800`, `0x900` or `0xA00`; shifts work through S1 and S2.

Evidence: `S1_BUTChange`, `S2_BUTChange`, the reader tail at `0x0045556C`, the
double-click handler `GetVirtualButton` that lets the user choose a free virtual
line, and the manual's statement that there are two independent modifiers.

---

## 6. Boolean functions

### 6.1 In the physical table: type 4 (`0x20`–`0x27`), 4-byte record

Offered by the tool only when the flag at `0x00F081A4` is 0 (`SetComboSL` adds
"Boolean" only then). Layout read from reader case 4; default written by
`FunctionChange`. Confidence **medium–low**: not verified bit by bit.

| Byte | Bits | Field | Encoding / values |
|---|---|---|---|
| 1 | 7 | invert operand 1 | 0/1 |
| 1 | 0–6 | value of operand 1 | |
| 2 | 7 | invert operand 2 | 0/1 |
| 2 | 0–6 | value of operand 2 | |
| 3 | 0–1 | source kind of operand 1 | |
| 3 | 2–3 | source kind of operand 2 | kind 3 is "special"; the analysis's wording is "value >> 5 selects 0 = none, 1 = 0..3 small, 2 = 1..8 small", without saying which value |
| 3 | 4–6 | operation | code = ((b3 AND `0x60`) >> 5) OR (((b3 AND `0x10`) >> 4) << 2); 8 operations |
| 3 | 7 | invert result | 0/1 |

`Get_ButtonsP_Active` marks the line named by the low byte (AND `0x7F`) of
entry *i* + 1 as a boolean / complement output (`0x800`) for operation code 6.

### 6.2 Gladiator-class devices (A4 = 1): the table at `0x4F0`

Boolean functions live in a table of **8-byte records at `0x4F0`**, shown 30 at
a time, starting at record number (value at `0x00F0894A`) × 5. Evidence:
`TMainForm::BooleanBtnDragDrop` (`0x00431F04`) copies records from
`0x00F092D8 + 8k`; the UI ↔ block functions `0x0071F844` and `0x0071F968` loop
over 30 records at `0x4F0 + 8 × index`. When the flag at `0x00F081D8` and A5 are
set there is also a 4-byte table at `0x6BA + 4 × index`. The total number of
records is not determined.

Fields seen in `Get_ButtonsP_Active` (record bytes r[0]–r[7]). Confidence
**medium** for the location, stride and output-line byte; the rest is not
determined.

| Record bytes | Field | Encoding / values |
|---|---|---|
| r[3] | output line | `0xFF` = none; bit 7 = special virtual forms |
| word at r[5] AND `0x7C0`, shifted right 6 (byte 5 bits 6–7 and byte 6 bits 0–2) | function / operation code | 0 = record unused |
| r[5] bit 1 | output is virtual | A3 layout only |
| r[6] bits 3–6 | number of additional consecutive output lines | when the code is below 13. For code 13, r[6] bit 7 extends the count; for code 17, r[1] − 1 extra lines |
| r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7] | input operands | decoded for display by the function at `0x00761104`: r[0]; r[1] (below 10 shows as small numbers); r[2] + 1; r[3]; r[4] AND 7; (r[4] AND `0x38`) >> 3; (word at r[4] AND `0x1C0`) >> 6; r[5] bits 1, 3, 4, 5; r[6] AND `0x80`; r[7] AND 8. Individual meanings **not decoded** |

Real block: `0x4F0`–`0x5DF` is all `00` — no Boolean functions defined.

---

## 7. Virtual-layer tables `0x900` and `0xA00`

`0x900`–`0x9FF` and `0xA00`–`0xAFF`: 128 entries of 2 bytes each, indexed by the
same line number. The widget for line *L* stores pointers `0x900 + 2L` and
`0xA00 + 2L` (the function at `0x00453E44`). The dialog pointers are set only
when A5 and the flag at `0x00F081D6` are set; that flag comes from a firmware
threshold of 2.16 (instructions `0x00418F17`) and is true for firmware 2.20.

They look like a "virtual layer" record and its extension, used only when the
"Advanced Mapping with virtual layer" option is on
(`TMainForm::cb_Advanced_MappingClick`, `0x00438D98`; check box ID 10 in
`TMainForm::SheetOption1Activate`, `0x00505014`). The option is read as
`(byte 0x0E AND 0xC0) ≠ 0` (instruction `0x00411B51`, and only if the flag at
`0x00F081D9` is set). The writer for byte `0x0E` was not found in the UI → block
dispatcher `0x005462D4`; the case for ID 10 at `0x00548B61` is unrelated.
**The record format is not decoded.** The editor for the alternate layout
(`TForm11`) uses 3-byte records with codes such as VButton `0xF8`, ButtonCS
`0xF1`, ButAlt `0x5C`, SubSHIFT `0x70`; that is the alternate layout, not this
one.

Caveat: other code (`Get_ButtonsP_Active`; `RefreshParam` through the function
at `0x00655800` with base `0x00F098E8`, only where the flags at `0x00F081AF` /
`0x00F081B2` are set) treats `0x900` and up as a structure with **6-byte
records** (stride 6 from `0x910`), used by other device families. For a
Gladiator-class device it was not established which view is live. Treat `0x900`
and up as unknown / unused for buttons.

Real block: `0x900`–`0x9FF` is all `FF`; `0xA00`–`0xAFF` is all `00`; byte `0x0E`
is 0 — the feature is off.

---

## 8. Virtual-button definitions

`0x30C`–`0x31B`: 8 words of 2 bytes. These are the **same bytes** that
[`BLOCK-AXES.md`](BLOCK-AXES.md) §6 decodes as the axis-to-buttons words; the
button code and the axis code read them differently. Evidence:
`RefreshParam` loops `0x006DA3A8` over `0x00F090F4 + 2i` (`0x30C` into the
block); `Get_ButtonsP_Active` (about instruction `0x00427A00`). *Medium.*

Reading by `Get_ButtonsP_Active`, with (c0, c1) the two bytes:

| Bits | Meaning |
|---|---|
| c0 AND 3 ≠ 0 | active (value 2 = "special"; not explained further) |
| (c0 AND `0x3C`) >> 2 | number *n* of consecutive virtual lines |
| c1 >> 1 | first line number |

The lines [first, first + *n*) are flagged `0x40`, "used by a virtual button".
`TMainForm::GetVirtualButton` (`0x004285A8`) refreshes these before opening the
line selector.

The axis decode of the same bytes (BLOCK-AXES.md): bits 0–1 = type of division
into zones (0 = OFF), bits 2–5 = number of zones, bits 6–7 = hysteresis, byte 1
bit 0 = an unknown flag, byte 1 bits 1–7 = first virtual button − 1. The two
readings agree that 0 in the type bits means inactive.

Real block: entries 0–5 are `00 02` (inactive); entries 6 and 7 are `D4 70` and
`CC 7A`, with c0 AND 3 = 0, so inactive; they look like stale data.

---

## 9. Registers and line organisation

| Offset | Bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|---|
| `0x20` | little-endian 16-bit word | **register mask** | bit *n* ↔ register *n* + 1. Real block: `0000` | high (tool use); firmware semantics not determined | `TMainForm::LabelRegNClick` (`0x0042CA30`) toggles `1 << label tag`; `TMainForm::ShowSheetButtonsP` (`0x007122C0`) enables the 16 register labels and check boxes from it, only if `ExtRegsShowEnable` is true |
| `0x22`, `0x23`, `0x24` | bits 0–2 of each | port mode | mode 2 = extended button registers. `0x22` is the "SPI2 S-LED mode / USART1" port and `0x24` the "SPI1 LCD mode / USART3" port (messages in `TMainForm::ShowSheetExternal`, `0x0071704C`) | medium | `TMainForm::ExtRegsShowEnable` (`0x0042C99C`) |
| `0x13` | 5 | extra enable for the extended registers | 0/1 | medium | `ExtRegsShowEnable` |

`ExtRegsShowEnable` = (`0x22` AND 7) = 2, or (`0x23` AND 7) = 2, or (`0x24` AND 7)
= 2, or (`0x13` AND `0x20`).

Real block: `0x13` = `00`, `0x22` = `00`, `0x23` = `41` (mode 1; the upper bits,
`0x08` when shifted right 3, are not decoded here), `0x24` = `00` — the extended
registers are not in use. The upper bits of the port-mode bytes are not covered
by this document.

**Registers.** 128 lines = 16 registers × 8 lines. The physical page puts the
widget for line *L* at row *L* >> 3, column *L* AND 7
(`TMainForm::SheetButtonsPhysicalCreate`, `0x00509850`);
the manual (§4.1) groups every eight lines into Reg#1 … Reg#16. That lines are
consecutive, line = 8 × register + bit, is taken from the UI layout only.

**Which lines are claimed by what.** There is no per-line ownership flag in the
block. `Get_ButtonsP_Active` builds a runtime array (one 32-bit word per line, at
`0x00F0F848`) used only for the "Used buttons" captions and colours. Its flags
point to these block regions:

| Flag | Meaning | Block region |
|---|---|---|
| `0x08` | matrix rows | source not stated |
| `0x10`, `0x20` | matrix columns | source not stated |
| `0x40` | virtual button | definitions at `0x30C` (§8) |
| `0x80` + *n* | external device *n* | 8 records of 16 bytes at `0x330` (below) |
| `0x100` | axis as buttons | 4-byte records at `0x34 + 4i`; the count is not stated |
| `0x200` | lines of the Trigger virtual-button record | `0x31C`: enable = byte `0x321` bit 7, first register = byte `0x31D` >> 1, per-line bits in byte `0x322` |
| `0x400` | lines of the Brake virtual-button record | `0x328`: enable = byte `0x328` bit 0, first register = byte `0x328` >> 1 |
| `0x800` | boolean / complement outputs | §6 |
| `0x2000` | Switch CB complement line | physical records `0x44`–`0x47` (§2.3) |
| `0x8000` | lines whose physical low byte is `0x7F` | on some device families only (flags `0x00F081AF` / `0x00F081B2`) |
| `0x10000` | lines named by the 6-byte records at `0x910` | the same device families (§7) |

External devices: 8 records of 16 bytes at `0x330`. Per record: `(rec[2] AND 0x1F) ≠ 0`
= active; `rec[3] AND 3` = bank; `(word at rec[4] AND 0x1F0) >> 4` = number of
registers; `rec[4] AND 0xF` = first register 1–16 (0 = 16). Each active record
claims lines `(first register − 1) × 8` for 8 × the number of registers, and
flags them `0x80` + device number. Observed in `Get_ButtonsP_Active`; the field
names are medium. These records are not decoded further here. The trigger and
brake records (`TMainForm::Trigger_VBUT1Change`, `0x00514DA4`;
`TMainForm::Brake_VBUT1Change`, `0x00514E54`) are not decoded here either.

---

## 10. Worked example

From the real block (Gladiator EVO R, firmware 2.20.C). Totals over the 128
physical entries: `FF FF` × 93, `FF 7F` × 20, `7F FF` × 4, and 11 other entries.
Eight lines, chosen to show each kind of record:

| Line | Physical entry | Decoded | Logical entry of the same line |
|---|---|---|---|
| 9 | `FF 7F` | plain Button (byte 0 bit 7). S1 = `0x7F`, S2 = `0x7F`: no shift | `80 FF` = Button 1 (by the encoding: lo = `0x80` OR (*N* − 1), hi = `FF`) |
| 12 | `2E E4` | b0 `2E` = type 5, sub 6: **uStick Switch**. b1 `E4`: bits 0–1 = 0, so POV number 1; bits 2–4 = 1, switch type 1; bits 5–6 = 3, so uStick_Op1 = (3 XOR 3) + 1 = 1; bit 7 = 1, start mode. High for the record; medium for the meaning (a mini-stick mode switch) | none: the output is the uPOV |
| 16 | `3A 00` | b0 `3A` = type 7, sub 2: **POV Switch**, direction **D**; b1 `00`: POV number 1 | none: the hat output is implicit |
| 17 | `38 00` | sub 0: **POV Switch**, direction **U**, POV 1 | none |
| 18 | `3B 00` | sub 3: **POV Switch**, direction **L**, POV 1 | none |
| 19 | `39 00` | sub 1: **POV Switch**, direction **R**, POV 1 | none |
| 28 | `9C 1C` | plain Button in the form the tool itself writes: byte 0 = `0x80` OR 28, byte 1 = 28; S1 = S2 = the line's own number: no shift | `91 FF` = Button 18 |
| 36 | `7F FF` | b0 = `0x7F`: **NoF** (no function), as written by the tool's NoF item with b1 left `FF` | none: the line is intentionally disabled |

Lines 16–19 are the four contacts of POV hat 1, wired in the order D, U, L, R,
with no logical entries because a hat is not four buttons. Lines 20–23, 24–27 and
28–31 are three groups of four plain Buttons whose logical entries are
contiguous (buttons 6–9, 11–14 and 16–19), read as three four-way button hats;
that is a reading of the pattern, not something the block states.

The rest of the block reads consistently:

- **Logical table.** The 30 non-empty entries are all Buttons with hi = `FF` and
  lo = `80`–`9D`, and buttons 1–30 each occur exactly once. All other entries
  are `FF FF`. The analysis finds this plausible for a Gladiator-EVO-type grip
  (the trigger is button 1, on line 9), but could not check it against the
  hardware: it is internally consistent (unique numbering, contiguous groups).
- **Extension and virtual-layer tables.** `0x800`–`0x8FF` is `00`,
  `0x900`–`0x9FF` is `FF`, `0xA00`–`0xAFF` is `00`, byte `0x0E` is `00`.
- **Boolean table.** `0x4F0`–`0x5DF` is `00`.

Open points about what this block shows:

- **Physical lines 0 and 1** hold `63 00` and `00 00`: b0 `63` = type 12, sub 3 —
  an **Encoder**, mode 3, a 4-byte record spanning both entries, with
  b1 = b2 = b3 = 0. This is the tool's default for an Encoder placed on line 0
  (every output = the line's own number), so it is most likely an unconfigured
  placeholder (medium). VKB's firmware guide for this model shows the EVO *base*
  carrying a rotary encoder on its right side, which fits an Encoder record on
  the first two lines; that this record is that encoder is still an inference.
- The logical entries of lines 0 and 1 are Buttons 23 and 24. The analysis first
  suggests these might be the encoder's clockwise and counter-clockwise outputs
  (with a question mark), and later states they are unrelated because logical
  entries are indexed by *output line*. This is unresolved.

---

## 11. What real profiles show

Two saved profiles (profile 1 and profile 2) from the same unit were compared
with each other. They differ in two places. One is an axis bit at `0x84`
([`BLOCK-AXES.md`](BLOCK-AXES.md) §9). The other is in the physical table, and is
the only difference between the two saves in the button tables: **one bit
differs, bit 7 of the high byte of physical-table entry 40**, at offset `0x15D`
(entry 40 is at `0x10C + 2 × 40` = `0x15C`; its high byte is b1). The value
changes from `7F` to `FF`. In the block read from the stick, line 40 is
`FF 7F` and has no logical entry.

What the analysis concludes about it:

- For a plain Button the editor reads `b1 AND 0x7F`, so `FF 7F` and `FF FF` are
  displayed identically: S1 = S2 = "none". The editor never reads b1 bit 7
  (**high**, as to editor behaviour).
- The tool's writers treat that bit differently. `TForm10::S2_BUTChange`
  (`0x0045A97C`) stores `b1 = (S2 − 1) OR 0x80`, and `0xFF` when the spin shows
  128 ("none"); `S1_BUTChange` (`0x0045A89C`) does the same for b0. The "Buttons"
  combo (`FunctionChange`) writes `b1 = line` with bit 7 clear. The value `7F`,
  as found in the real block, is what the analysis calls the factory default.
- The analysis therefore reads the edit as the tool re-writing the SHIFT2 field
  of that button — the user touched SHIFT2 / S2, or re-selected the line — so
  that the factory `0x7F` became the tool's canonical `0xFF`. In both cases the
  meaning is "SHIFT2 = none". The analysis does not say which of the two actions
  occurred.
- **Whether the firmware gives b1 bit 7 a meaning of its own — for example "S2
  field valid" — is unknown.** (Low, as to firmware semantics.)

The block read from the stick and profile 1 (different units) were also
compared. Outside the axis structures they differ only at `0x330` and `0x332`,
in an external-device record ([`BLOCK-GLOBAL.md`](BLOCK-GLOBAL.md)). **Nothing
differs in the button tables**: the two units carry the same button
configuration.

---

## 11a. Confirmed on hardware ***verified***

Buttons cannot be pressed from software, but an axis can be made to press
them. The axis-to-buttons words ([`BLOCK-AXES.md`](BLOCK-AXES.md) §6) divide an
axis into zones, each of which holds a virtual line while the axis sits in it.
The throttle rests in the third of four zones and the stick's X axis in the
middle of three, which gives two lines that are permanently "pressed" with
nobody touching the stick: line 102 (**A**) and line 111 (**B**). Their entries
in the two tables were then changed one experiment at a time, and the stick's
input report read. The original configuration was restored afterwards.

Baseline with both lines mapped as plain buttons: buttons 102 and 111 held, hat
centred.

| Changed | Entry bytes | Report | Reading |
|---|---|---|---|
| Logical A: second button 50 | `E5 31` | buttons 50, 102, 111 | hi = second button − 1 |
| Logical A: HAT 1, right | `74 01` | hat = 2; button 102 gone | hi + 1 = direction, 0 = up, clockwise in eighths |
| Logical A: HAT 1, down | `74 03` | hat = 4 | as above |
| Logical A: No Function | `7F FF` | button 102 gone | |
| Logical A: Void | `7C 00` | button 102 gone | |
| Physical A: POV Switch, right | `39 00` | hat = 2; button 102 gone | type 7, sub = direction: 0 U, 1 R, 2 D, 3 L |
| Physical A: POV Switch, up | `38 00` | hat = 0 | as above |
| Physical A: NoF | `7F FF` | button 102 gone | |
| Physical A: Button with S1 → line 120; nothing shifting | `F7 FF` | button 102 | unshifted, a Button sends its own line |
| …and B = `48 00` | | buttons 102, 111 | **sub 0 is not a shift**: B still behaves as a button |
| …and B = `49 00` | | **button 120**; 111 gone | `0x49` is SHIFT1: it selects the line in byte 0 of a Button, and sends no button itself |
| A: S2 → line 120; B = `4A 00` | `FF F7` | **button 120** | `0x4A` is SHIFT2: it selects the line in byte 1 |
| A: S1 → 120; B = `4A 00` | | button 102 | SHIFT2 does not select S1 |
| A: S2 → 120; B = `49 00` | | button 102 | SHIFT1 does not select S2 |
| A: S1 → 120, S2 → 50; B = `4B 00` | `F7 B1` | button 50 | both shifts at once: S2 wins |
| A: S1 → 120; B = `4D 00` | | buttons 111, 120 | bit 2 is "track as button": the shift also sends its own button |
| A: S1 → 120 with byte 1 = `7F`; B = `49 00` | `F7 7F` | button 120 | `7F` and `FF` in a shift field both mean "none" |

So bits 0–1 of a SHIFT entry are a **mask** — bit 0 SHIFT1, bit 1 SHIFT2 — not
a shift number, and the range is `0x49`–`0x4F`, which settles the question
left open in §2.3.

What this does not show: which physical control is wired to which line. That
still needs someone pressing buttons.

---

## 12. Not determined

The following were not determined, or only guessed.

1. **Firmware semantics** (as opposed to editor semantics) of: b1 bit 7 of a
   plain Button (the `7F` → `FF` edit above); S = `0x7F` as "none"; and whether
   byte 0 = `0x7F` (NoF) and `FF 7F` differ in the firmware.
2. **Whether physical lines 0 and 1** (`63 00 00 00`, Encoder mode 3) are a
   genuine encoder on this grip or template data, and the mapping of the encoder
   outputs b1–b3 to lines.
3. **Names of the System (15), Multimedia (13), Audio (9) and Application (39)
   lists**, whose strings are filled at run time; and the mapping from the
   Keyboard key-table index to a HID usage. The tool's table at `0x00E02949` is
   a Windows virtual-key list; the device-side meaning of lo is unverified.
4. **The HAT logical record:** the exact encoding of "centre push" (tag 8) and
   of the virtual-controller bits. The analysis records the eight-way direction
   numbering U, UR, R, RD, D, DL, L, LU (0–7) under this item as well.
5. **Bit-level layout of:** Generator, Tempo (sub 3), Trimmer sub-types, Fix
   Axes sub 5 and 6, Curves, the uStick and uPOV b1 fields beyond what is listed
   (medium–low), and Rotary switch (`0x5D`).
6. **The record format of `0x900` / `0xA00`**, and whether it is live on this
   device; and the 6-byte-record view at `0x910` used by other device families.
7. **The `0x4F0` Boolean record:** the full field map; the 4-byte table at
   `0x6BA`; and how the 4-byte physical Boolean (type 4) differs on A4 devices,
   where it is hidden in the UI.
8. **The firmware's behaviour for 4-byte physical records** (type 4 and 12)
   regarding the *following* line's logical entry (in the real block, lines 0 and
   1 both have logical Buttons, 23 and 24).
9. **Byte `0x0E` bits 6–7 ("Advanced Mapping").** No store was found in the UI →
   block dispatcher `0x005462D4`; the case for ID 10 at `0x00548B61` is
   unrelated. Only the reader at instruction `0x00411B51` is certain.
10. **The register mask (`0x20`) in the firmware**, and the ordering of lines
    within a register: that lines are consecutive, line = 8 × register + bit, is
    from the UI layout only.

Further open points recorded elsewhere in the analysis:

- The internal inconsistencies noted in §2.3: ButtonM at `0x71`–`0x77` against
  `0x71`–`0x73`; the `0x48`–`0x4B` range of SHIFT against the track-as-button
  bit; Trimmer sub-types 0–9 against a 3-bit sub field; `FF 7F` as "unused?"
  against a plain Button; and the unexplained "Detent Set" condition on Cyclic
  Switch.
- The external-device records at `0x330`, the Trigger and Brake records at
  `0x31C` and `0x328`, and the 4-byte records at `0x34 + 4i` are referenced here
  only to explain which lines they claim; their fields are not decoded here.
- The model in §1 of how a press becomes a HID button is inferred. It has not
  been tested on hardware, and neither has any other row of this document.
