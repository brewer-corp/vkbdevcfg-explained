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

**Many encodings here are *verified* on hardware** (§11a): the effect of the
bytes was observed in the stick's own reports, with nobody touching it. Rows
that were not tested are ***static***, in the sense used by
[`PROTOCOL.md`](PROTOCOL.md): read out of the binary, not tested on a device.
The table in §2.3 says which is which. Which physical control is wired to which
line (§9.1) comes from the vendor tool's own diagram tables and has not been
tested: that needs a hand on the stick.

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
| `0x13` | bit 5 | 1 | "Virtual BUS over USB" ([`BLOCK-GLOBAL.md`](BLOCK-GLOBAL.md) §1); the tool also shows register captions when it is set (§9) |
| `0x20` | 2 | 1 | register mask (§9) |
| `0x22`–`0x24` | 1 (bits 0–2) | 3 | port-mode bytes; mode 2 = extended button registers (§9) |
| `0x34` | 4 | not stated | axis-as-buttons records; referenced only (§9) |
| `0x10C` | 2 (4 for two function types) | 128 | **physical table**: the physical function of each physical line (§2) |
| `0x20C` | 2 | 128 | **logical table**: the logical function of each output line (§4) |
| `0x30C` | 2 | 8 | virtual-button definitions; the same words as the axis-to-buttons words (§8) |
| `0x31C`, `0x328` | not stated | 2 | Trigger and Brake virtual-button records; referenced only (§9) |
| `0x330` | 16 | 8 | external-device records; referenced only (§9) |
| `0x4F0` | 8 | up to 57 | Boolean function table (§6.2) |
| `0x5F0` | 2 | 8 | encoder multiplier table (§2.4) |
| `0x6BA` | 4 | one per Boolean record | Boolean pulse extension (§6.2) |
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

| Byte 0 | Function | Parameter bytes | Status |
|---|---|---|---|
| `0x00`–`0x07` | **AUX Axes** | b0 bits 0–1 = function, bit 2 = alternate action. b1 bits 0–2 = **target** − 1, bits 3–5 = **source** − 1, bit 6 = number of axes − 1, bit 7 = variant. e0 bit 6 = target + 8, bit 7 = source + 8, bit 5 = sync, bit 4 = free pair (then e1 = second source and target), bit 0 = attenuator (then e1 = percent) | static, checked in the assembly. Earlier revisions of this page had source and target the wrong way round |
| `0x08`–`0x0F` | **Generator** | sub = type: 0 G1, 1 G8, 2 GT, 3 GT+, 4 GTR, 5 GTR2, 6 GTE, 7 GTE+. b1 + 1 = value, with a multiplier in the top bits: none for G1 and G8 (value 1–127); bit 7 = ×10 for GT, GT+, GTE, GTE+; bits 6–7 = ×1, ×10, ×100, ×1000 for GTR and GTR2 (value 1–63). Lengths are in 10 ms | **verified** for G8 (pulses for as long as the line is held, period 2 × T_Gen) and for GT+ and GTE+ (held for as long as the line is). The one-shot types produced nothing in the tests (§11a) |
| `0x10`–`0x17` | **Fix Axes** | sub: FA0 = 0, FA1 = 1, FA2 = 3, FA3 = 5, DR = 7; the even neighbours 2, 4, 6 are the "alternate action" forms. Axes = the mask (e0 << 8) OR b1, bit *i* = axis *i* + 1 | static |
| `0x18`–`0x1F` | **Cyclic Switch** | sub + 1 = positions (2–8). b1 + 1 = first line, with bit 7 = reversible. With e0 bit 7 set the tool labels the record "Detent Set" instead | type code static. **No output on firmware 2.20**: clocked presses produced nothing on any line. The tool removes Cyclic Switch from its list for firmware 2.17 and later, and has no code to create a Detent Set |
| `0x20`–`0x27` | **Boolean**, 4-byte form | §6.1. Not offered on this device class, which uses the table at `0x4F0` (§6.2) | static |
| `0x28` | **Sync** | b1 bit 7 = mode (0 SET, 1 SYNC), bit 0 = toggles, bit 1 = ButAlt, bits 3–4 = set, bit 5 = AUX, bit 6 = Boolean. The tool's default is `28 FF` | static |
| `0x29` | **RPB** (replica button) | b1 = source line − 1 | **verified**: the line is active for as long as its source is, and shows in the line map |
| `0x2A`, `0x2B` | **Curves** (`2B` = alternate action) | axis mask, as Fix Axes | static |
| `0x2C`, `0x2D` | **Rel Axes** | `2C` = reset, `2D` = set to the FA3 value: axis mask. `2D` with e1 bit 7 = "set value 2": b1 = (axis 1 − 1) OR (axis 2 << 4), e0 and e1 = the two percentages | static |
| `0x2E` | **uStick Switch** | b1 bits 0–1 = hat − 1, bits 2–4 = kind (Button, Cyclic, Tempo, SHIFT, SubSHIFT, Tempo B), bits 5–6 = an operand that depends on the kind, bit 7 = start in hat mode. e0 bit 0 = no axes | **verified** for what the factory record does (`2E E4`: hat 1, Cyclic, start as a hat): each press switches the mini-stick between hat and axes, and bit 7 chooses how it starts. The record need not be on the mini-stick's own line (§11a). Other kinds static |
| `0x2F` | **Parametric** ("DZ switch") | axis mask | static |
| `0x30`–`0x37` | **Trimmer** | sub: 0 reset, 1 trim +, 2 trim −, 3 auto +, 4 auto −, 5 set +, 6 set −, 7 return. e1 bit 7 turns sub 5 into "set 2" and sub 0 into "off", which is how the tool's ten kinds fit three bits. For sub 1–4, b1 = (axis − 1, 3 bits) OR (multiplier index << 3) OR ((axis > 8) << 7); for set ±, b1 = (value index << 3) OR (axis − 1), in steps of 5 % | static |
| `0x38`–`0x3B` | **POV Switch** | sub = direction: 0 up, 1 right, 2 down, 3 left. b1 bits 0–1 = hat − 1, bits 2–3 = virtual controller − 1 | **verified**: direction, hat number, and that two held lines of one hat give the diagonal |
| `0x3C` | **uPOV Switch** | b1 bits 0–1 = hat − 1, bits 2–4 = kind (Button, Cyclic), bits 5–6 = count − 1 | static |
| `0x40`–`0x43` | **ButtonX** | b0 bit 0, bit 1 = also use SHIFT1, SHIFT2. b1 = virtual-button line − 1 | **verified**: under SubSHIFT 7 the line sends the line in b1; otherwise its own |
| `0x44`–`0x47` | **Switch CB** (switch with complementary button) | b1 AND `0x7F` = complement line − 1. Group size − 1 = (b0 AND 3) OR ((b1 AND `0x80`) >> 5) | **verified** for a group of one: the complement line is active while the switch line is not, and shows in the line map; the switch line still sends its own button |
| `0x48`–`0x4F` | **SHIFT** | b0 bit 0 = SHIFT1, bit 1 = SHIFT2, bit 2 = track as button. b1 + 1: bits 0–1 = mode, 0 momentary, 1 alternate, 2 cyclic. `0x48` alone is a plain button (§5) | **verified**: the mask, track-as-button, and all three modes (alternate flips on each press; cyclic steps SHIFT1, SHIFT2, none) |
| `0x50`–`0x55` | **Tempo** | sub: 0 Tempo 1, 1 Tempo 2, 2 Tempo 3, 3 Tempo 3S, 4 Tempo 3A, 5 "Tempo 4". b1 = second line − 1; for sub 3, three 2-bit classes instead (bits 0–1 short, 2–3 long, 4–5 double press; 0 off, 1–3 = S0–S2) | **verified** for sub 0 and 1: a press shorter than the tempo time pulses the line's own output on release; a longer one pulses the second line (Tempo 1) or holds it until release (Tempo 2). The rest static |
| `0x58`–`0x5B`, `0x5F` | **Toggle** | b1 AND `0x7F` = partner line − 1. The tool writes `5A` | **verified**: a pulse of T_Tgl on the line's own output when the contact closes, and on the partner line when it opens. With the partner set to the line itself only the closing pulse appeared. With b1 bit 7 set the opening pulse appeared on line 128 |
| `0x5C` | **ButAlt** (b1 >> 5 = 7) | b1 bit 0 = state at power-up, bit 1 = latching (0 = "pulse" mode), bits 2–4 = reset set XOR 3. e0 = second line − 1 | **verified**: `5C FF` is on at power-up and `5C FE` off; each press flips it. In pulse mode alternate presses go to the line's own output and to the second line |
| `0x5C` | **Radiobutton** (otherwise) | b1 bits 5–7 = group − 1, bit 0 = master | **verified**: the master of each group is on at power-up, the others off |
| `0x5D` | **Rotary switch** | not decoded: the tool shows a panel and reads nothing | a probe (`5D 3B`, clocked) produced nothing |
| `0x5E` | **ButtonD** (dependent button) | b1 = master line − 1. e0 low nibble = press delay, high nibble = release delay, in 10 ms | **verified**: the line sends nothing while its master is held. Delays static |
| `0x60`–`0x67` | **Encoder** | 4 bytes, §2.4 | static |
| `0x68`, `0x6A` | **Curves v2**, **Parametric v2** | Curves v2: b1 bit 7 = alternate, bits 4–6 = curve − 1, bits 0–3 = axis − 1; e0 and e1 each hold another (curve − 1) << 4 OR axis, 0 = none. Parametric v2: b1 = (axis − 1) OR (alternate << 7), e0 = filter value | static |
| `0x70` | **SubSHIFT** | b1 bits 0–2 = number 1–7, bit 3 = alternate, bits 4–6 = act as a button when no SHIFT, SHIFT1, SHIFT2 is active, bit 7 = track as button | **verified**: number, alternate, track-as-button, and the live flags in the input report |
| `0x71`–`0x77` | **ButtonS** (b1 bit 7 = 0) | sub = SubSHIFT number; b1 = line − 1 to send while that SubSHIFT is active | **verified**, including that another SubSHIFT number leaves it alone |
| `0x71`–`0x74` | **ButtonM** (b1 bit 7 = 1) | sub = Modal Switch 1–4; b1 AND `0x7F` = line − 1 | static |
| `0x7F` | **NoF** (no function) | b1 anything | **verified** |

b1 is the entry's second byte. e0 and e1 are the two bytes of the line's
extension entry (§3). A "line − 1" field holds the 0-based index of a 1-based
line number.

Reader: the function at `0x0045556C` (record → dialog; a `switch` on
`byte 0 >> 3`). Writers: `TForm10::FunctionChange` (`0x0045CB64`), which resets
the record to `00 FF FF FF` with a zero extension and then writes a default,
and one setter per function (`AUX_AxesChange`, `GEN_Set`, `TEMPO_Change`,
`TGL_BUTChange`, `BA_STATEChange`, `P2K_NChange`, `SWC_NChange`, `BtnXChange`,
`BtnMChange`, `MODEChange`, `SHIFTChange`, `CSW_Set`, `TRIM_Change`,
`RPB_BUTChange`, `SYNC_MODEChange`, …). Every layout above was read from both
the writer and the reader.

Times these functions use, all in the header ([`BLOCK-GLOBAL.md`](BLOCK-GLOBAL.md)
§1): **T_Tgl** `0x014` (ms) is the width of Toggle and Tempo pulses,
**T_Gen** `0x016` (ms) the generator's pulse width, and bits 4–6 of `0x01A`
the tempo time (100, 150, 200, 250, 300, 400, 500, 1000 ms). All three were
confirmed by measuring pulses (§11a).

Questions earlier revisions left open, now settled:

- **`FF 7F` and `FF FF`** are both a plain Button with no shift lines. The
  editor shows a shift field of 128 as "none".
- **ButtonM** is written as `0x71`–`0x74` with b1 bit 7 set. The tool's reader
  masks the number with 3, so it shows Modal Switch 4 as 0 — a bug in the tool.
- **Trimmer** has ten kinds in a 3-bit field because two of them borrow e1
  bit 7.
- **Lines 1 and 2** of the real stick hold one Encoder record whose outputs
  are those same two lines, which is why their logical entries are Buttons 23
  and 24.

### 2.4 Encoder record (type 12, 4 bytes)

Writer: `TForm10::ENC_Change` (`0x0045B0F0`); reader `0x00454C08`. *Static.*
The record takes entries *L* and *L* + 1, and *L* must be an odd line number
(an even index): the tool refuses otherwise.

| Byte | Field | Encoding |
|---|---|---|
| 0 | type and mode | `0x60` OR mode: 0 virtual, 1 advanced, 2 = 1/4, 3 = 2/4, 4 = 4/4 (pulses per detent). The tool's default is `0x61`; the real stick has `0x63` |
| 1 | output | stored as value − 1. Bit 7 of the value clear: a line number, 1–127 — one direction pulses that line, the other the next line (the manual's wording; not tested). Bit 7 set: the encoder drives a trimmer instead — low 3 bits = axis − 1, bits 3–6 = multiplier (1×, 2×, … 512×, 1K–8K) |
| 2 | output under the first modifier | same form. Equal to byte 1 = no second output |
| 3 | output under the second modifier | same form. Equal to byte 1 = none |

Extension entry: e0 bits 0–1 and 2–3 choose the two modifiers (SHIFT1 or
SHIFT2, or Modal Switch 1 or 2), bits 4–6 mark outputs 1–3 as the signed
"extended" kind, bit 7 switches the trimmer form to a 4-bit axis and a 3-bit
index into a table of eight 16-bit multipliers at `0x5F0`. e1 bits 0–3 = pulse
time in 10 ms (0 = the global T_Enc at `0x015`), bits 4–5 = mode (STD, GT1,
GT+).

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

| lo | Function | hi | Status |
|---|---|---|---|
| `0x80` OR (*N* − 1) | **Button *N*** (1–127) | `0xFF` = no second button; otherwise the second button − 1 | **verified** |
| `0xFF` | **AutoMapping**: the line sends the button with its own number | `0xFF` | **verified** |
| below `0x67` (`0x74` with "Ext keys", `0x010` bit 7) | **Keyboard**: lo + 1 = the key's HID usage (`03` is A, `27` Enter, `39` F1) | hi + 1 = the HID modifier byte: bit 0 LCtrl, 1 LShift, 2 LAlt, 3 LWin, 4 RCtrl, 5 RShift, 6 RAlt, 7 RWin | static (see below) |
| `0x74` | **HAT** | hi + 1 = ((hat − 1) << 6) OR ((virtual controller − 1) << 3) OR direction; direction 0 = up, clockwise in eighths | **verified** for hats 1–4 and for combining two lines into a diagonal. The tool cannot encode a centre push: its button for it writes "up" |
| `0x76` | **Macro** | hi + 1 = macro number, bit 7 = repeat | static |
| `0x77` | **Mice** | hi + 1 = *m*. Bit 7 clear: bits 0–2 = left, right, middle, button 4, button 5, mouse on/off, set screen point (then bits 3–5 = point − 1). Bit 7 set: wheel — bit 6 = up, bits 4–5 = delay (100–400 ms), bits 0–2 = speed − 1 | static |
| `0x78` | **System** | index into the list below | static |
| `0x79` | **Multimedia** | index | static |
| `0x7A` | **Audio** | index | static |
| `0x7B` | **Application** | index | static |
| `0x7C` | **Void** | 0 | **verified**: sends nothing |
| `0x7F` | **No Function** | `0xFF` | **verified** |

Writer: `TForm10::FunctionLChange` (`0x0046008C`) and one setter per function;
reader `0x0045EA70`.

**Keyboard.** The tool captures a key press, maps the Windows virtual-key code
through a table at `0x00E029BC` to a USB HID keyboard usage, and stores
usage − 1. That is the tool's convention; what the stick sends was not
observed. Turning the virtual keyboard on (`0x00B` bit 2) does add a keyboard
to the stick's HID descriptor — report `0x09`, one modifier byte and sixteen
key codes — and Linux creates a keyboard device for it, but no report `0x09`
arrived while a line mapped to a key was pulsing. Something else is needed,
and it is not known what.

**The four lists** are in the executable after all, as a string table filled
at start-up (`0x004EAD08`). The names are USB HID usage names, so the usages
in brackets are inferred from them:

- *System* (generic desktop page): Power Down (81), Sleep (82), Wake Up (83),
  Context Menu (84), Main Menu (85), App Menu (86), Menu Help (87), Menu Exit
  (88), Menu Select (89), Menu Right (8A), Menu Left (8B), Menu Up (8C), Menu
  Down (8D), Cold Restart (8E), Warm Restart (8F).
- *Multimedia* (consumer page): Play (B0), Pause (B1), Record (B2), Fast
  Forward (B3), Rewind (B4), Scan Next Track (B5), Scan Previous Track (B6),
  Stop (B7), Eject (B8), Random Play (B9), Stop/Eject (CC), Play/Pause (CD),
  Play/Skip (CE).
- *Audio* (consumer page): Mute (E2), Volume + (E9), Volume − (EA), Balance
  Right (150), Balance Left (151), Bass + (152), Bass − (153), Treble + (154),
  and a second "Treble +" that is presumably Treble − (155).
- *Application* (consumer page): the 39 application-launch usages `181`–`1A7`
  in order, from "Launch Button Configuration Tool" through Calculator (index
  17, usage 192) to "Documents".

Turning Multimedia on (`0x017` bit 1) adds report `0x12` to the descriptor: one
16-bit consumer usage. As with the keyboard, no such report was seen.

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

Boolean functions are **8-byte records at `0x4F0 + 8k`**, each combining up
to three inputs into an output. The table ends before `0x6BA`, where a 4-byte
extension per record starts. Editor: `TForm12` (`Show` at `0x00473394`,
`FunctionChange` at `0x00474AB0`). The rows marked **verified** were tested on
the stick (§11a).

| Byte | Bits | Field | Status |
|---|---|---|---|
| r0, r1, r2 | all | inputs 1, 2, 3: line − 1, or an index in the other layers | **verified** |
| r3 | all | output. Bit 7 clear: line − 1. `0x80`, `0x81` = SHIFT1, SHIFT2. `0x90`–`0x96` = SubSHIFT 1–7. `0xFF` = none: the result is only available to other records | **verified** (line, SHIFT1, SubSHIFT 2, none) |
| r4 | 0–2, 3–5 | layer of inputs 1 and 2: 0 physical (the raw line), 1 virtual (after the line's function), 2 logical, 3 "P-Alt", 4 SHIFT (index 0 = SHIFT1), 5 SubSHIFT, 6 Boolean (index = record number), 7 LED event | **verified** for 0, 1, 2, 4 and 6 |
| r4, r5 | r4 6–7, r5 0 | layer of input 3 | static |
| r5 | 1 | output layer: 0 = physical — the line behaves as if pressed, appears in the line map and goes through its own function; 1 = virtual — it skips that function | **verified** |
| r5 | 2, 3, 4 | invert input 1, 2, 3 | **verified** for 1 and 2 |
| r5 | 5 | invert the output | **verified** |
| r5, r6 | r5 6–7, r6 0–2 | function: 0 off, 1 NOT, 2 AND, 3 OR, 4 XOR (two inputs), 5 AND, 6 OR, 7 XOR (three inputs), 8 RS, 9 RT, 10 RST, 11 JK, 12 D trigger, 13 M counter, 14 and 15 comparators, 16 modal switch, 17 axis to buttons, 18 function generator | **verified** for 2, 3, 4 and 5. **Function 1 did not invert**: its output was on whatever its input was |
| r6 | 3–6 | parameter: number of consecutive outputs − 1 and a hub-inversion bit for the logic functions; a modulus for the counter and the modal switch | static |
| r7 | 0–2 | inputs are edge-triggered | static |
| r7 | 3, 4–5 | counter options | static |

For the comparators and axis-to-buttons, r0 is an axis (bits 0–4, minus one)
with a hysteresis index in bits 5–6, and r1 and r2 are thresholds in percent.

The extension at `0x6BA + 4k`: bit 3 of its first byte enables a pulse, bits
4–5 scale it (×1 to ×1000), and a time in ms sits across the first two bytes.
*Static.*

The stick reports the state of the first records live: see report `0x0C` in
[`COMMANDS.md`](COMMANDS.md) §5.

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

### 9.1 Which control is on which line

The block does not say, and neither does anything else the stick sends. But
the vendor tool knows: its Visual Diagram window labels a photo of each device
from tables compiled into the drawing code (`TForm36`, functions at
`0x0048E0EC`–`0x0049D8C4`; each row is a box title, a control name and a line
number). It picks the picture by USB product ID.

The base of a Gladiator NXT or EVO owns register 1. A grip's table is numbered
from 1 inside the grip, and the tool adds 8 × (the grip's first register − 1):
the same 28 rows appear with lines 1–28 for a Gunfighter base and 9–36 for a
Gladiator.

| Line | Control | Line | Control |
|---|---|---|---|
| 1, 2 | En2, the base's rotary encoder | 17–20 | hat A1: down, up, left, right |
| 3, 4 | Sw1 up, down | 21–24 | hat A3: down, up, left, right |
| 5, 6, 7 | F3, F1, F2 | 25–28 | hat A4: down, up, left, right |
| 8 | — | 29–32 | hat C1: down, up, left, right |
| 9, 10 | Trigger 2, Trigger 1 | 33 | C1 push |
| 11 | D1 (pinky) | 34 | A1 push |
| 12 | A2 | 35, 36 | Rapid fire up, down |
| 13 | mini-stick push | 37–40 | — |
| 14, 15 | A3 push, A4 push | | |
| 16 | B1 | | |

That is a Gladiator base with an SCG grip on registers 2–5, which is what the
test stick's external-device record says it has. The vendor's table for the
left-hand grip, SCG-L, differs in one place: A4 left and right are exchanged
(left = 28, right = 27). **That is wrong for a real left-hand stick**: its owner
found A4 left on line 27, as on the right-hand grip. It is also the only
reading under which the factory button numbers run clockwise on both grips.
The tool has tables of the same kind for the F14 and KG12 grips, the MCG and
MCG Ultimate, STECS, and the SEM, THQ, FSM.GA, STEM and ATEM modules.

**One left-hand stick has been pressed through** by its owner, with the live
line map open: the table held, apart from the A4 exchange above. Nobody has
pressed through a right-hand grip. Beyond that, what supports the table is
agreement: the factory configuration puts the four POV Switch directions on exactly the lines the
table calls A1 down, up, left and right; the mini-stick switch record on the
line it calls the mini-stick push; "no function" on the four lines it leaves
unnamed; and the factory button numbers run up, right, down, left around each
four-way hat. Line 1 is also the one line that reads active at rest, which
fits an encoder contact. Whether the firmware moves a grip's lines when its
first-register field changes is not known either.

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

The first table is the original set of experiments; the method was then
extended with a clock (below).

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

### A clock with nobody at the stick

Held lines only test functions that respond to a level. Toggles, tempo
buttons and alternating shifts respond to presses and releases, and a line
that is already held when the stick starts never produces one.

One function turned out to solve that. **Generator G8** pulses its output for
as long as its line is held, so line 102, held by the throttle, becomes a
free-running clock. A Boolean record (§6.2) then copies that output onto a
physical line — `65 65 00 45 09 C0 00 00`: OR of virtual line 102 with itself,
out to physical line 70 — and line 70 carries the function under test. With
T_Gen set to 250 ms line 70 is pressed for about 295 ms and released for
about 205 ms, twice a second, indefinitely.

| Line 70 (and others) | Seen | Reading |
|---|---|---|
| plain | button 70 on 295 ms of every 499 ms | the clock; period = 2 × T_Gen |
| Toggle, partner line 60: `5A 3B` | a 51 ms pulse on 70 at each press, and on 60 at each release | T_Tgl (`0x014`) = 50 ms is the pulse width |
| …with T_Tgl = 120 | pulses of 119 ms | confirms the field and its unit |
| Toggle, partner itself: `5A 45` | the press pulse only | |
| Toggle with b1 bit 7: `5A BB` | press pulse on 70; release pulse on **line 128** | bit 7 is not simply masked off |
| ButAlt, initially off: `5C FE` | on for one whole period, off for the next | each press flips the latch |
| ButAlt, pulse mode: `5C FC` | presses go alternately to line 70 and to line 1 | line 1 is the second line, extension byte 0 = 0 |
| SHIFT1, momentary / alternate / cyclic: `49 FF` / `49 00` / `49 01`, with B = Button, S1 → 120 | 120 while pressed / for every other period / for one period in three | b1 + 1 = mode |
| SubSHIFT 1, alternate: `70 09`, with B = ButtonS → 60 | 60 for every other period | b1 bit 3 |
| Tempo 1, 300 ms tempo time: `50 3B` | a 51 ms pulse on 70 at each release | a 295 ms press is a short press |
| Tempo 1, 100 ms (`0x01A` = `02`) | a 52 ms pulse on line 60, 99 ms after each press | long press; `0x01A` bits 4–6 index the tempo time |
| Tempo 2, 100 ms: `51 3B` | line 60 held from 100 ms after each press until release | |
| Cyclic Switch: `1A 3B`, `1A BB` | nothing on lines 60–62 | dead on this firmware |
| Rotary switch: `5D 3B` | nothing | |
| Generator GT, GTR, GTR2, GTE: `0A 04` … `0E 04` | nothing | perhaps only one generator runs at a time; not resolved |

And tested with held lines alone, as before:

| Changed | Report | Reading |
|---|---|---|
| Logical A = `FF FF` | button 102 | AutoMapping: a line sends the button with its own number |
| Lines 120–124 = `5C FF`, `5C 01`, `5C 00`, `5C 21`, `5C FE` | buttons 120, 121, 123 | ButAlt initial state; the master of each Radiobutton group |
| A = SubSHIFT 1 (`70 01`), B = ButtonS 1 → 50 (`71 31`) | button 50 only; SubSHIFT 1 flag set | |
| A = `70 81`, B = ButtonS 2 (`72 31`) | buttons 102, 111 | track as button; a ButtonS ignores other SubSHIFTs |
| A = SubSHIFT 7 (`70 07`), B = ButtonX → 50 (`40 31`) | button 50; SubSHIFT 7 flag set | |
| Line 64 = Switch CB → 50 (`44 31`), A = Switch CB → 60 (`44 3B`) | buttons 50, 102, 111; line 50 in the line map | the complement of an open switch is on; of a closed one, off |
| A = ButtonD, master B (`5E 6E`) | button 111 only | suppressed while the master is held |
| Line 120 = RPB of A (`29 65`) | buttons 102, 111, 120; line 120 in the line map | |
| A = Tempo 2 → 50 (`51 31`) | buttons 50, 111 | a line held from power-up counts as a long press |
| A = POV up, B = POV right | hat = 1 | two directions combine into the diagonal; the same with two logical HAT entries |
| A = POV right on hat 2 (`39 01`), two hats enabled | second hat = 2 | b1 bits 0–1 |
| Logical A = HAT 3 left (`74 85`), B = HAT 4 down (`74 C3`), four hats | third hat = 6, fourth = 4 | hi + 1 = (hat − 1) << 6 OR direction |
| Boolean: `31 00 00 3B 00 42 00 00`, `65 6E 00 3C 00 82 00 00`, `65 6E 00 3D 00 02 01 00`, `65 31 00 3E 00 C2 00 00` | buttons 60, 61, 63; not 62 | AND, XOR and OR of lines 102 and 111 (or 50) as predicted. The first, a NOT, is on — but it stays on whatever its input |
| Boolean with input and output inversion; three-input AND | as predicted | r5 bits 2, 3, 5; function 5 |
| Boolean out to SHIFT1 (r3 = `80`); to SubSHIFT 2 (r3 = `91`) | B sends its SHIFT1 line; its ButtonS line | |
| Boolean in from the SHIFT layer; from another record, with r3 = `FF` on the first | as predicted | layers 4 and 6 |
| Boolean on a G8 line, inputs from the physical / virtual / logical layer | steady / pulsing / pulsing | "physical" is the raw line, "virtual" is after its function |

### The mini-stick's mode, seen at rest

An analogue mini-stick is either a hat or two axes, and nothing shows which
while it sits at centre. Shifting its X axis off centre with the calibration
bias (physical axis 5, bytes 6–7) makes the mode visible with nobody touching
it: as a hat, hat 1 points right or left and both axes read centre; as axes,
hat 1 is centred and the axis reads off centre. The click, line 13, was then
"pressed" by the clock above.

| Configuration | Seen | Reading |
|---|---|---|
| factory: line 13 = `2E E4` | hat | bit 7 of byte 1 = start as a hat |
| line 13 = `2E 64` | axes | |
| factory, line 13 pressed twice a second | hat, axes, hat, axes … | each press switches |
| line 13 = plain Button, no `2E` record anywhere | axes, for good; presses send button 13 | without a switching record the mini-stick is two axes |
| line 13 = plain Button, `2E E4` parked on line 100 | hat, for good; presses send button 13 | the record sets the starting mode from any line; on a line nothing is wired to, nothing can switch it |
| line 13 = plain Button, `2E 64` parked on line 100 | axes | |

So the mini-stick's click can be freed for another use, with the mini-stick
fixed as either a hat or two axes.

About seventy configurations in all, each written, read back, observed for a
few seconds and replaced; the original went back at the end of each batch.

Still not shown: which physical control is wired to which line (§9.1).

---

## 12. Not determined

1. **Which control is on which line** on a right-hand grip (§9.1): only a
   left-hand stick has been pressed through. And whether a grip's
   first-register field moves its lines.
1a. **Whether any left-hand grip is wired the way the vendor's table says.** The
   table exchanges A4 left and right for the SCG-L, in both the Gladiator and
   the Gunfighter drawing code; the one left-hand stick tested does not. Either
   the vendor's diagram mislabels every left grip, or an older revision was
   wired that way. A second left-hand stick, ideally an older one, would settle
   it.
2. **The Boolean NOT** (function 1), which did not invert; and the flip-flops,
   counter, comparators, modal switch and function generator, whose parameter
   bits are only partly read.
3. **One-shot generators** (G1, GT, GTR, GTR2, GTE): the layout is known, but
   none produced a pulse in the tests. The value field of G8 changed nothing
   visible either.
4. **Keyboard, mouse, media and system keys:** the encodings are the tool's;
   no keyboard or consumer report was ever seen from the stick.
5. **Tempo 3, 3S, 3A and "Tempo 4"**; the Toggle sub bits; what Toggle's b1
   bit 7 really does; ButtonM and the modal switch; the encoder's typed
   outputs and whether its second direction is the next line.
6. **Rotary switch** (`0x5D`) and **Detent Set**: no decode exists in the tool.
7. **The axis functions**: AUX, Fix Axes, Rel Axes, Curves, Parametric and the
   Trimmer family were not tested on hardware.
8. **The record format of `0x900` / `0xA00`** ("advanced mapping"), and the
   6-byte-record view at `0x910` used by other device families. The tool
   cannot switch that mode on for this generation.
9. **The register mask (`0x20`)** in the firmware.
