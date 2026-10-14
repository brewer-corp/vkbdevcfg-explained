# Parameter block: header, global options, external devices, LEDs

Field map of the header, global options, mouse, POV, external-device, LED,
LED-gauge and detent structures in the 4096-byte parameter block described in
[`PARAMETER-BLOCK.md`](PARAMETER-BLOCK.md). All offsets are offsets into that
block. The layout is from **static analysis** of `VKBDevCfg-C.exe` v0.93.89: the
code that moves each value between the settings page and the block was located
(§6), and the positions and encodings were taken from that code. The decode was
then checked for plausibility against real blocks — one block read from a VKBsim
Gladiator EVO R (firmware 2.20.C) and two saved profiles from another unit of
the same model — in the sense that it reads as a sensible configuration. That is
a consistency check, not a proof of what the firmware does with each field.

**A handful of fields here have been exercised on hardware**; they are marked
***verified*** where they appear:

- `block[4:8]` is a CRC-32 — the STM32 hardware CRC — of `block[8:4096]`. The
  device recomputes it itself on every write, whatever the host sends
  ([`PROTOCOL.md`](PROTOCOL.md) §4–§5).
- `block[8:10]` is the firmware version word (`0x220C` on firmware 2.20.C) and
  `block[2]` is the device type id: `0x11` on a Gladiator EVO R, and also on a
  Gladiator Omni L, so it names a family rather than a model. The stick
  keeps its own type id whatever it is sent ([`PROTOCOL.md`](PROTOCOL.md) §5).
- The pulse times T_Tgl and T_Gen, the tempo time, the number of hats, the
  virtual-keyboard and multimedia switches (as far as the HID descriptor), and
  "Virtual BUS over USB" (§1).

Two labels are used, as in [`PROTOCOL.md`](PROTOCOL.md):

- ***verified*** — observed on a real device.
- ***static*** — read out of the binary, not exercised on hardware.

Every row not marked ***verified*** is ***static***.

Confidence is **high**, **medium** or **low**:

- **high** — position and meaning were read directly from the code that moves
  the value between the settings page and the block;
- **medium** — the position was read from the code but the meaning (a name, a
  value mapping) is partly inferred, or the reverse;
- **low** — the field is known to exist but its meaning is unresolved, or only
  one reference was seen;
- **—** — the bits are not touched by any code found, and are unknown.

A split rating such as "medium (field), low (meaning)" rates the parts
separately. "Not rated" means the analysis assigned no level to the row.

Notation. Block offsets are written with three hex digits (`0x01B`); addresses
in the executable with eight (`0x0041133C`). Evidence entries of the form
`ctl 0x3E7` give the numeric ID of the control that edits the field: the tool
creates most of its settings controls at run time, tags each with an ID, and
routes them through large switch statements, the dispatchers (§6). "Case at
`0x0056EC71`" is the address of that control's case body. An address in
`0x005462D4`–`0x0056F444` is in the **UI→block** dispatcher (`0x005462D4`); one
in `0x005151B8`–`0x00546288` is in the **block→UI** dispatcher (`0x005151B8`).
The two share one ID space. Structures with several records have their own
dispatchers, whose ID numbers can repeat those of the global pair. Function
names are the tool's own method names, taken from its run-time type information;
functions without a published name, and program globals, are cited by address.
The global `0x00F08DE8` is the in-memory copy of the block, so global
`0x00F08DE8 + N` is block offset `N`.

Several rows depend on device-generation flags in the tool, at `0x00F081A3`
(A3) and `0x00F081A4` (A4), as in [`BLOCK-BUTTONS.md`](BLOCK-BUTTONS.md). This
document is for the 4096-byte layout (A3 = 0). A3 selects an alternate layout,
a 0xC00-byte per-profile record used by other device families
([`CFG-FILE-FORMAT.md`](CFG-FILE-FORMAT.md)), which is not covered here. The
analysis takes the test device to have A4 = 1.

Neighbouring regions are in [`BLOCK-AXES.md`](BLOCK-AXES.md) and
[`BLOCK-BUTTONS.md`](BLOCK-BUTTONS.md); the whole-block map is in
[`PARAMETER-BLOCK.md`](PARAMETER-BLOCK.md).

---

## Summary of structures

| Block offset | Record size | Count | What |
|---|---|---|---|
| `0x000`–`0x009` | 10 B | 1 | Device type id, marker, CRC-32, firmware word (§1) |
| `0x00A`–`0x01F` | 22 B | 1 | Global options, bit-packed (§1) |
| `0x020`–`0x021` | 2 B | 1 | Register-enable mask (§1) |
| `0x022`–`0x024` | 3 B | 3 | USART1–3 port bytes (§1) |
| `0x025`–`0x029` | 5 B | – | Never referenced; zero in the real block (§1) |
| `0x02A`–`0x033` | 10 B | 1 | Mouse block (§2.1) |
| `0x034`–`0x03B` | 4 B | 2 | POV records 0 and 1 (§2.2) |
| `0x31C`–`0x323` | 8 B | 1 | `Trigger_VBUT1` virtual-button record (§2.3) |
| `0x327` | 1 B | 1 | Key delay and one further combo (§2.3) |
| `0x328`–`0x32A` | 3 B | 1 | `Brake_VBUT` virtual-button record (§2.3) |
| `0x32C`–`0x32D` | 1 B | 2 | System address low / high (§2.3) |
| `0x32E`–`0x32F` | 2 B | 1 | Serial number field (§2.3) |
| `0x330`–`0x3AF` | 16 B | 8 | External-device records (§3) |
| `0x3B0`–`0x3B7` | 1 B | 8 | LED channel masks (§4.1) |
| `0x3B8`–`0x4EF` | 6 B | up to 52 | LED events (§4.2–§4.5); 12, 32 or 52 depending on device flags |
| `0x5E0` (and `0x5EE`–`0x5EF`) | 1 B | – | Global-option extension: release time, LED brightness (§5.1) |
| `0x600`, `0x604` | 4 B | 2 | POV records 2 and 3 (§2.2, §5.2) |
| `0x7D0`–`0x7FF` | 12 B | 4 | LED gauge (linear indicator) records (§5.3) |
| `0xB00`–`0xB0F` | 16 B | 1 | Detent header (§5.4) |
| `0xB10`–`0xBFF` | 24 B | 10 | Detent sets (§5.4) |
| `0xC00`–`0xD7F` | 0x180 B | – | Extended-detent area (§5.4) |
| `0xD80`–`0xDB1` | 0x32 B | – | Extended-detent pool (§5.4) |

---

## 1. Header and global options, `0x000`–`0x03B`

Real-block values are decoded in the subsection after the table.

| Byte | Bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|---|
| `0x000`–`0x001` | all | unused? | `FF FF` in the real block. No code reference to these bytes individually was found; the only reference to `0x000` is the block base address. | low (unknown) | – |
| `0x002` | all | device / profile type id | Copied into the global at `0x00F08194` after a read. Before a write, `btnWriteParamClick` compares that global with `block[2]` and, when the global at `0x00F08988` is 0, shows a warning beginning "Attention! This profile is not c…" (the rest of the string was not transcribed). `0x11` on the Gladiator EVO R. | high; ***verified*** (value) | `btnReadParamClick` `0x0041133C`; `btnWriteParamClick` `0x00410814` |
| `0x003` | all | marker / unlock byte | `0xA0` makes the function at `0x0070FF7C` enable two extra UI controls and makes `btnReadParamClick` take a different branch. A hidden key combination writes `0xA1` here: `btnWriteParamClick` polls `GetAsyncKeyState(0xA1)` (`VK_RSHIFT`), a "device level" of 5 and the global at `0x00F081C1`; whether Ctrl is part of it is queried, not settled. `0xFF` in the real block (read as default / none). | medium (existence) / low (meaning) | `btnWriteParamClick` `0x00410814`; `0x0070FF7C` |
| `0x004`–`0x007` | u32 | CRC-32 | STM32 hardware CRC of `block[8:4096]`. The block→UI case shows it as 8 hex digits. Real block: `5F 08 87 0E`, i.e. `0x0E87085F`. | high; ***verified*** | `ctl 0x2` (case at `0x005154F6`); `btnReadParamClick` `0x0041133C` |
| `0x008`–`0x009` | u16 LE | firmware / profile version | `0C 22` = `0x220C` = firmware 2.20.C. Compared with the thresholds `0x2178`, `0x2181`, `0x2186` and `0x219D`, which gate controls on the settings pages. | high; ***verified*** (value) | `SheetOption0Activate` `0x00505140`; `TForm36::FormCreate` `0x00489D8C` |
| `0x00A` | all | unknown (`ctl 0x4`) | The whole byte is stored for any control class; no settings page registers `ctl 0x4` in the global lists. `0xC4` in the real block. | medium (field) / low (meaning) | `ctl 0x4` (cases at `0x00546601`, `0x00515543`) |
| `0x00B` | 0 | **Cal** (calibration status) | Checkbox "Calibration". `btnReadParamClick` tests `block[0x00B] & 1 == 0` (not calibrated) to decide whether to prompt for auto-calibration. | high | `ctl 0x3E7` (case at `0x0056EC71`, in `TabSheetStandardActivate`) |
| `0x00B` | 1 | **Hide** | Checkbox, caption "Hide", hint "Vendor-device" (hides the device). | high | `ctl 0x6` (case at `0x00546C57`) |
| `0x00B` | 2 | **virtual keyboard enabled** | ***Verified*** that it adds a keyboard (report `0x09`) to the HID descriptor; no key report was ever seen. `cmbKeyboardType`: item index 0 gives bit 2 = 0; any other index gives bit 2 = 1 and sets bit 3 of `0x01C` to `(index − 1) & 1`. `POVChange` and the function at `0x00515124` test this bit. | high | `ctl 0x7` (case at `0x0054741E`; instructions `0x00547B8A`–`0x00547BBA`); `POVChange` `0x0042CFFC` |
| `0x00B` | 3 | **Map** | Checkbox "Mapping of logical layer (Option2)". | high | `ctl 0x8` (case at `0x00547BBF`) |
| `0x00B` | 4 | **Eco** | Checkbox "Eco". Its hint reads "allows to control virtual keyboard connection time" (VKB manual §2.3.1); the localisation key of the hint is `POWER_OFF_IN_SUSPEND_MODE`. | high | `ctl 0x9` (case at `0x00548390`) |
| `0x00B` | 5 | mixing-curve type | Combo, 1 bit; hint "Type of mixing curve", caption "Tr.Mix.Curve". | medium | `ctl 0x31` (case at `0x00559920`) |
| `0x00B` | 6 | **DF** dynamic filter | Checkbox "Dynamic filter". | high | `ctl 0x3E6` (case at `0x0056E4A0`) |
| `0x00B` | 7 | unknown | Never written by the dispatcher. | — | – |
| `0x00C` | bitmask | per-axis "calibrated" flag | Bit *i* = axis *i*. Set and cleared with `1 << idx` in the axis dialogs. `0xFF` in the real block. Determined in the axes decode, see [`BLOCK-AXES.md`](BLOCK-AXES.md) §7. | high | references at `0x0061E899`, `0x006128EE`, `0x005F1AA9` |
| `0x00D` | bitmask | per-curve "99 % mode" | Bit-per-curve mask; no absolute references. See [`BLOCK-AXES.md`](BLOCK-AXES.md) §5, which rates the bit position high. | medium | – |
| `0x00E` | 0–3 | spin 0–15 | `CreateSpinEditBox` with maximum 15; stored as `(block[0x00E] & 0xF0) \| (v & 0xF)`. Label unresolved; the VKB manual's glossary has `AClTime` (auto-calibration time, with an "Always" value), which the analysis noted but did not tie to this field. | medium (field) / low (name) | `ctl 0x25` (case at `0x00553CD0`) |
| `0x00E` | 4–5 | **FL Mode** | Combo; hint "Forced limit Mode for related axis". | high | `ctl 0x3D` (case at `0x0055E63A`) |
| `0x00E` | 6–7 | mode select (caption not found) | Combo, stored as `(v & 3) << 6`. `btnReadParamClick` sets the global at `0x00F08998` to `(block[0x00E] & 0xC0) != 0`. | medium | `ctl 0x3E1` (case at `0x0056C56D`); `btnReadParamClick` |
| `0x00F` | 0–1 | **MIN FPS** | Combo (firmware above `0x219D`); items printed as 12 / 2 / 1/2 / 0. For firmware below `0x2181` (when the flags at `0x00F081A4` and `0x00F081D4` are set) the same `ctl 0x3E0` is a checkbox "W10S / WIN10 v20H Sleep if inactive" that writes the same two bits. | medium | `ctl 0x3E0` (case at `0x0056BDBA`); `SheetOption0Activate` `0x00505140` |
| `0x00F` | 2–3 | MPL combo | The "MPL" combo of this layout variant; stored `(v & 3) << 2`. | medium | `ctl 0x27` (case at `0x00554C54`) |
| `0x00F` | 4 | MODE (FA0 mode), high bit | Combo "MODE", items M1–M4, 2 bits: the low bit is `0x01A` bit 7, the high bit is this bit. | medium | `ctl 0xB` (case at `0x00549AD2`; instructions `0x00549A9E`–`0x00549ACD`) |
| `0x00F` | 5 | Product-ID group mode | Combo; hint "Auto/Basic Product ID", caption "Product ID". Tried on the stick with and without a bias of 1: the product ID did not change, so this pair of fields is not understood. | medium | `ctl 0x3E3` (case at `0x0056D4FE`) |
| `0x00F` | 6–7 | **PID bias** | Spin 0–3; hint "Bias Product ID", caption "Bias". VKB manual §2.4.12: USB PID = base + bias (example given: 2234 + 3). | medium | `ctl 0x3E4` (case at `0x0056DCCF`) |
| `0x010` | 0–2 | Tr.Auto Rate | Combo (an edit in the alternate layout); hint "Declination rate Trimmer Auto function". | medium | `ctl 0x2A` (case at `0x00556327`) |
| `0x010` | 3 | serial-LED chain: reset pulse | Spin 0/1, "Reset pulse 1=50/0=300 uS" (external sheet). | medium | `ctl 0x38` (case at `0x0055C04E`) |
| `0x010` | 4 | serial-LED chain: timing | Spin 0/1, "Timing". | medium | `ctl 0x39` (case at `0x0055C7D9`) |
| `0x010` | 5 | serial-LED chain: sequence | Spin 0/1, "Sequence: GBR/RGB". | medium | `ctl 0x3A` (case at `0x0055CF6A`) |
| `0x010` | 6 | unknown | – | — | – |
| `0x010` | 7 | **Ext keys** | `cb_Ext_Keys`. `btnReadParamClick` also sets the global at `0x00F081DE` to `0x74` or `0x67` depending on this bit when the global at `0x00F081C7` is set. | high | `ctl 0xA` (case at `0x00548B61`); `btnReadParamClick` |
| `0x011` | 0–2 | **SPI1 port mode** | Combo, hint "SPI1 port mode"; modes OFF / S-But / S-Led / LCD…. Value 1 enables "Invert data" (bit 6 of `0x013`); value 2 is LCD according to `ShowSheetExternal`. | medium | `ctl 0xF` (case at `0x0054A2C1`); `ctl 0x3B`; `ShowSheetExternal` `0x0071704C` |
| `0x011` | 3–7 | **Number of connected registers** (SPI1) | Spin 0–16, stored `v & 0x1F`. | high | `ctl 0x10` (case at `0x0054AA74`) |
| `0x012` | 0–2 | **SPI2 port mode** | Combo, hint "SPI2 port mode"; items include AD5415 and XmaSLeds. | medium | `ctl 0x11` (case at `0x0054B245`) |
| `0x012` | 3–7 | SPI2 register / LED count − 1 | Spin 1–64, stored `(v − 1) & 0x1F`. The spin range exceeds what five bits hold; how values above 32 are handled was not determined. | medium | `ctl 0x12` (case at `0x0054B9F8`) |
| `0x013` | 0 | unknown | `v & 1`; the control was not found. | low | `ctl 0x13` (case at `0x0054C1C5`) |
| `0x013` | 1 | **Enable Fix Axes** | Checkbox. | high | `ctl 0x14` (case at `0x0054C978`) |
| `0x013` | 2–4 | **D.Rate** | Combo "Rate value for 'double rate' function"; items 1:2, 1:3, 1:4, 2:3, 3:4. | high | `ctl 0x15` (case at `0x0054D13F`) |
| `0x013` | 5 | **Virtual BUS over USB** | Checkbox `cbVrtualBUS` on the external sheet. ***Verified***: with it set the stick streams report `0x08` subtype `0x13` (encoder status) and report `0x0B` ([`COMMANDS.md`](COMMANDS.md) §5). The tool also uses it, in `ExtRegsShowEnable`, to decide whether to show register captions. | high | `ctl 0x389` (case at `0x00569B31`); `ExtRegsShowEnable` `0x0042C99C` |
| `0x013` | 6 | "Invert data", SPI1 | Checkbox; active only when SPI1 port mode is 1. | high | `ctl 0x3B` (case at `0x0055D6FC`; store at `0x0055DE79`) |
| `0x013` | 7 | "Invert data", SPI2 | Checkbox; active only when SPI2 port mode is 1. | high | `ctl 0x3C` (case at `0x0055DE98`) |
| `0x014` | u8 ms | **T_Tgl** | Time of toggle pulse; track 0–255. `0x32` (50 ms) in the real block. ***Verified***: Toggle and Tempo pulses measured 51 ms, and 119 ms with the field at 120. | high | `ctl 0x18` (case at `0x0054D910`) |
| `0x015` | u8 ms | **T_Enc** | Time of encoder pulse. 50 in the real block. | high | `ctl 0x19` (case at `0x0054E05F`) |
| `0x016` | u8 ms | **T_Gen** | Time of generator pulse. 50 in the real block. ***Verified***: a G8 generator's period is twice this value, at 50, 100 and 250. | high | `ctl 0x1A` (case at `0x0054E7AE`) |
| `0x017` | 0 | **System control** keys | `cb_System_control`. | high | `ctl 0x1B` (case at `0x0054EEFD`) |
| `0x017` | 1 | **Multimedia** keys | `cb_Multimedia`. ***Verified*** that it adds a consumer-control collection (report `0x12`) to the HID descriptor. | high | `ctl 0x1C` (case at `0x0054F6B0`) |
| `0x017` | 2–4 | key-matrix size (rows) | Spin 0–5; hint "Matrix size(rows)". | high | `ctl 0x1D` (case at `0x0054FE77`) |
| `0x017` | 5–7 | key-matrix width (columns) − 1 | Spin 1–8; hint "Matrix width (columnS)"; stored `(v − 1) & 7`, the write masks the old value with `0x1F`. Bits 0–1 of this byte are also read by the function at `0x0071FA18`, which was not examined. | medium | `ctl 0x1E` (case at `0x00550648`) |
| `0x018` | 0–3 | Basic virtual register | Spin 1–16, stored `v & 0xF` (16 becomes 0). | medium | `ctl 0x1F` (case at `0x00550DD3`) |
| `0x018` | 4–6 | **FA0** time of transition | Combo; items 30, 50, 100, 150, 200, 250, 300 ms. | medium | `ctl 0x20` (case at `0x00551587`) |
| `0x018` bit 7 + `0x019` bits 0–1 | 3 bits | **FA1** time of transition | A u16 at `0x018`, bits 7–9. | medium | `ctl 0x21` (case at `0x00551D59`) |
| `0x019` | 2–4 | **FA2** | – | medium | `ctl 0x22` (case at `0x00552579`) |
| `0x019` | 5–7 | **FA3** | – | medium | `ctl 0x23` (case at `0x00552D4B`) |
| `0x01A` | 0–1 | **SD** delay of start controller | Edit, `StrToInt & 3`; hint "Delay of start controller" (0–3). | high | `ctl 0x24` (case at `0x0055351D`) |
| `0x01A` | 2 | Use Global SHIFTs | – | medium | `ctl 0x384` (case at `0x00567B93`) |
| `0x01A` | 3 | Use Global SubSHIFTs | – | medium | `ctl 0x385` (case at `0x00568364`) |
| `0x01A` | 4–6 | **TEMPO** function time | Combo "Tempo function Time, ms"; items 100, 150, 200, 250, 300, 400, 500, 1000. ***Verified*** at index 0 and 4: a 295 ms press is long at 100 ms and short at 300. | high | `ctl 0x26` (case at `0x00554483`) |
| `0x01A` | 7 | MODE (FA0 mode), low bit | See `0x00F` bit 4. | medium | `ctl 0xB` |
| `0x01B` | all | **User profile ID** | Edit, 0–255. Shown by `TForm36::FormCreate` as "ProfileID" and passed to `GetUserProfileName`. | high | `ctl 0x28` (case at `0x00555425`); `0x0070FF7C`; `TForm36::FormCreate` `0x00489D8C` |
| `0x01C` | 0–2 | **MAX FPS** (polling frequency) | Combo, hint "Polling frequency, Hz"; items 250, 125, 83, 62, 50, 40, 33, 25. | high | `ctl 0x29` (case at `0x00555B74`); item list in `SheetOption0Activate` |
| `0x01C` | 3 | keyboard Classic (0) / Modified (1) | Set from `cmbKeyboardType` (`0x00B` bit 2). | medium | `ctl 0x7` |
| `0x01C` | 4–6 | TimeDR | "Time of transition Axis(Fix,Double Rate), mS". | medium | `ctl 0x2B` (case at `0x00556ADA`) |
| `0x01D` | all | **#But** number of logical buttons | Track 0–128. Also copied into the global at `0x00DAB43C` after a read. `0x80` (128) in the real block. | high | `ctl 0x2D` (case at `0x00557A7C`); `btnReadParamClick` |
| `0x01E` | 0–2 | **#POV** number of HATs | Spin 0–4. ***Verified***: each hat adds a hat switch to the HID descriptor; the report always has four 16-bit hat slots. | high | `ctl 0x2E` (case at `0x005581CB`) |
| `0x01E` | 3–5 | **VC** virtual HID controllers | Combo: No, 1, 2, 3. | high | `ctl 0x2F` (case at `0x0055897E`) |
| `0x01F` | 0 | "GNX MOD" checkbox | Shown when the globals at `0x00F081AA` and `0x00F081D2` are set. | low–medium | `ctl 0x3E2` (case at `0x0056CD3E`) |
| `0x01F` | 1–6 | spin 8–40 (n − 1) | External sheet; shown when the global at `0x00F081D6` is set. | low–medium | `ctl 0x3E` (case at `0x0055EE0B`; store at `0x0055F586`) |
| `0x01F` | 7 | Trimmer mode, Time / Rate | Combo. | medium | `ctl 0x32` (case at `0x0055A0F1`) |
| `0x020`–`0x021` | u16 mask | register-enable mask | Bit *i* = shift register *i*. `LabelRegNClick` toggles a bit and stores the mask (global `0x00F08E08`, which is block `0x020`) when `ExtRegsShowEnable()` is true. | high | `LabelRegNClick` `0x0042CA30` |
| `0x022`, `0x023`, `0x024` | u8 each | serial-port config, USART1 / USART2 / USART3 | Bits 0–2 are the port mode; value 2 enables register display. `ExtRegsShowEnable` tests `(b & 7) == 2` for each. `ShowSheetExternal` warns "SPI2 S-LED mode / USART1" if `block[0x022] & 7` is nonzero while SPI2 is in S-LED or AD5415 mode, and "SPI1 LCD mode / USART3" if `block[0x024] & 7` is nonzero while SPI1 is mode 2. In the real block `0x023` is `0x41` (mode 1 plus bit 6) and the other two are 0; USART2 is the internal grip bus, matching the external-device port index 1 (§3). | medium (roles) / low (other bits) | `ExtRegsShowEnable` `0x0042C99C`; `ShowSheetExternal` `0x0071704C` |
| `0x025`–`0x029` | 5 B | unused | Never referenced; all 0 in the real block. | — | – |
| `0x02A`–`0x033` | 10 B | mouse block | §2.1 | | |
| `0x034`–`0x03B` | 2 × 4 B | POV 0 and POV 1 | §2.2 | | |

Left unresolved in this range: the meaning of `0x003`, `0x00A`, `0x00B` bit 7,
`0x010` bit 6, and `0x025`–`0x029`.

### Real block, header decode

Read from the Gladiator EVO R block. The other unit's profiles are identical in
this whole range except for the CRC word.

| Byte | Value | Reading |
|---|---|---|
| `0x000`–`0x003` | `FF FF 11 FF` | type id `0x11`; marker `0xFF` (none) |
| `0x004`–`0x007` | `5F 08 87 0E` | CRC-32 `0x0E87085F` |
| `0x008`–`0x009` | `0C 22` | `0x220C`, firmware 2.20.C |
| `0x00A` | `C4` | meaning unknown |
| `0x00B` | `59` | Cal = 1, Hide = 0, virtual keyboard off, Map = 1, Eco = 1, mixing curve 0, DF = 1 |
| `0x00C` | `FF` | all eight axes flagged calibrated |
| `0x00D` | `00` | no curve in 99 % mode |
| `0x00E`–`0x013` | `00` | spin at `0x00E` = 0 (label unresolved), FL Mode 0, MIN FPS index 0, MPL 0, Product-ID mode 0, bias 0, SPI1 and SPI2 off, no registers, no Fix Axes, D.Rate index 0 |
| `0x014`–`0x016` | `32 32 32` | T_Tgl, T_Enc, T_Gen = 50 ms each |
| `0x017` | `00` | no system or multimedia keys, no key matrix |
| `0x018`–`0x019` | `02 00` | basic virtual register 2; FA0–FA3 index 0 (FA0 = 30 ms) |
| `0x01A` | `42` | SD = 2; global SHIFT and SubSHIFT flags 0; TEMPO index 4 (300 ms) |
| `0x01B` | `00` | user profile ID 0 |
| `0x01C` | `00` | MAX FPS index 0 (250 Hz); keyboard "Classic" (although the keyboard is off) |
| `0x01D` | `80` | 128 logical buttons |
| `0x01E` | `01` | one POV; virtual controllers "No" |
| `0x01F`–`0x022` | `00` | – |
| `0x023` | `41` | USART2 port byte: mode 1, bit 6 set — the internal grip bus |
| `0x024`–`0x029` | `00` | – |

This reads as a sensible, close-to-default configuration: calibrated, all axes
flagged, 50 ms pulse times, 128 buttons, one hat, no mouse, no keyboard, no SPI
peripherals, and the one serial port in use is the one the external-device table
(§3) says carries the grip. One point does not line up: the header says one POV
(`0x01E` bits 0–2), yet two POV records are filled in (§2.2).

A compact hex rendering of this header made during the analysis has one zero
byte fewer between `0x00C` and `0x014` than the field-by-field reading above.
The table follows the field-by-field reading; the zero bytes in
`0x00D`–`0x013` should be re-checked against a block.

---

## 2. Mouse, POV records, and `0x31C`–`0x32F`

### 2.1 Mouse block, `0x02A`–`0x033`

Page: `MouseBox_Activate` (`0x00502FE4`). The whole block is zero in the real
block, which is the mouse switched off.

| Byte | Bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|---|
| `0x02A` | 0–1 | Mouse usage | Off / Relative / Absolute / R+A. | medium–high | `ctl 0x50`, instructions `0x00560200`–`0x00560217` |
| `0x02A` | 2 | Active mode | Combo. | medium | `ctl 0x51`, instructions `0x005609D8`–`0x005609F8` |
| `0x02A` | 3 | unknown | – | — | – |
| `0x02A` | 4 | Forced Limit "FL" | Checkbox. | not rated | `ctl 0x54` (case at `0x00561C70`) |
| `0x02A` | 5–7 | relative-mode pointer speed | 0–7. | not rated | `ctl 0x52` (case at `0x00560CEC`) |
| `0x02B` | all | not referenced | – | — | – |
| `0x02C` | 0–3 | "Bind Curve Axis #" | – | not rated | `ctl 0x53` (case at `0x005614BD`) |
| `0x02D`–`0x02F` | 24 bits | two 12-bit values | `ctl 0x64` is the u16 at `0x02D`, bits 0–11; `ctl 0x6E` is the u16 at `0x02E`, bits 4–15. (`ctl 0x6E` is also the number of the "Number of encoders" spin of the external-device record dispatcher, §3.) | low (meaning) | `ctl 0x64` (case at `0x00563BEB`); `ctl 0x6E` (case at `0x005643EE`) |
| `0x030`–`0x032` | 24 bits | Screen Width, Screen Height | Width is the u16 at `0x030`, bits 0–11 (`ctl 0x5E`). Height is the u16 at `0x031` shifted right by 4 (`ctl 0x5F`). | high | `ctl 0x5E`, `ctl 0x5F` |
| `0x033` | all | Scale | Combo, stored as item index − 1. | not rated | `ctl 0x55` (case at `0x00562441`) |

### 2.2 POV records

Four bytes each. Record *i* (0 or 1) is at `0x034 + 4i`. When the globals at
`0x00F081A4` and `0x00F081CE` are both set, records 2 and 3 are at
`0x5F8 + 4i`, that is `0x600` and `0x604`. In the real block `0x600` and `0x604`
both read `00 00 00 7F`, an unused record, and `0x603` and `0x607` are `0x7F`.

Evidence: POV record dispatcher `0x0067A55C` (control IDs 0x105–0x11F; the
record pointer is computed in the instructions at `0x006837E8`–`0x00683886`);
the page is `TabSheetPOVActivate` (`0x004FC9A8`); `POVChange` (`0x0042CFFC`).

Confidence: field positions **high**; the meaning of the type and mode *values*
**low** (no value-to-name table was mapped). Bit 3 of byte 0 is not covered.

| Byte | Bits | Field | ctl | Notes |
|---|---|---|---|---|
| 0 | 0–2 | POV Type (0–6) | 0x10C | Types 4, 5 and 6 force the 3-bit mode to 0 (`POVChange`). |
| 0 | 4 | Inversion | 0x10A | |
| 0 | 5–6 | Virtual Controller − 1 | 0x105 | Spin 1–4. |
| 0 | 7 | "2-axes mode" | 0x106 | |
| 1 | 0–2 | X axis − 1 | 0x107 | |
| 1 | 3–5 | Y axis − 1 | 0x108 | |
| 1 bits 6–7, 2 bit 5 (shifted left by 2) | 3 bits | mode / output (Buttons … Numpad … Mouse) | 0x11B | `POVChange`: mode 3 warns "POV tracked as Numpad, but virtual keyboard is not activated" if `block[0x00B] & 4` is 0; modes 4 and 5 warn "Virtual Mouse is not activated" if `block[0x02A] & 3` is 0. |
| 2 | 0–3 | deadband (DZ), value − 4 | 0x10B | For types 4 and 5; other types take another branch. Partly decoded. |
| 2 | 4 | Deadband type | 0x11A | |
| 2 | 6 | combo / "Lock" checkbox | 0x119 / 0x11D | Both controls bind the same bit. |
| 2 | 7 | Active mode | 0x11C | |
| 3 | 0–6 | type-dependent | 0x10D, 0x118, 0x11E, 0x11F | Spin 1–128 (value − 1); combo (`ctl 0x118`); spin 1–24 on bits 0–4 (`ctl 0x11F`); "Modificators" on bit 6 (`ctl 0x11E`). The uses overlap per type. `0x7F` in the real block. |
| 3 | 7 | "Center" | 0x10E | |

Real block: POV 0 is `82 2C C6 7F` — type 2, virtual controller 1, 2-axes
mode on, X = axis 5, Y = axis 6, byte 2 `0xC6`. POV 1 is `A0 0A 86 7F` — type 0,
virtual controller 2, 2-axes mode on, X = axis 3, Y = axis 2. The header's
`#POV` is 1 although both records are filled in.

### 2.3 `0x31C`–`0x32F`

| Byte | Field | Detail | Confidence | Evidence |
|---|---|---|---|---|
| `0x31C`–`0x323` | `Trigger_VBUT1` virtual-button record (8 B) | `Trigger_VBUT1Change` writes `block[0x31D] = (spin − 1) * 2 \| (block[0x31D] & 1)`. The dispatcher reads: byte 0 bits 0–2, bits 3–4, and a 16-bit value at bits 5–8 (count / mode fields); byte 1 bits 1–7, read with +1, +2, +3 and +4 offsets (the analysis calls these four thresholds); bytes 2 and 3 (flags); the u16 at byte 4, bits 0–12; byte 5 bits 5–6 and bit 7; byte 6 bits 0–2, 3–5, bit 6 and bit 7; byte 7 bits 0–1. Captions were not resolved. | medium (layout) / low (meaning) | `Trigger_VBUT1Change` `0x00514DA4`; VBUT dispatcher `0x006DAA74` (control IDs 0x12C–0x14A, list at global `0x00F08C98`) |
| `0x324`–`0x326` | unknown | – | not rated | – |
| `0x327` | key delay | Low nibble is the `cmbKeyDelay` / "Dly" combo (`block[0x327] & 0x0F`, `ctl 0x387`); bits 5–7 are the combo with `ctl 0x36`. Bit 4 unknown. | medium | `ctl 0x387` |
| `0x328`–`0x32A` | `Brake_VBUT` virtual-button record (3 B) | Byte 0 bit 0 and bits 1–7 (+1 to +3); byte 1 bits 0–2 and 3–5; byte 2 bits 0–4; byte 1 bits 6–7. Captions not resolved. | medium (layout) / low (meaning) | VBUT dispatcher `0x006DAA74` |
| `0x32B` | not described | – | not rated | – |
| `0x32C`, `0x32D` | **System Address Low / High** | The controller's own address (`AdrL` / `AdrH`) on the serial bus; the external sheet captions are "System Adress Low/High" (sic). Real block: `..` and `..`. | high | `ctl 0x33`, `ctl 0x34` |
| `0x32E`–`0x32F` | **Serial number** | A u16 entered in an edit box captioned "SN:", four digits 0000–9999, parsed as hex. Real block: `..`. | high | `ctl 0x35` |

[`BLOCK-BUTTONS.md`](BLOCK-BUTTONS.md) §9 reads parts of the same two records as
line claims: for the trigger record the enable is byte `0x321` bit 7 and the
first register is byte `0x31D` >> 1; for the brake record the enable is byte
`0x328` bit 0 and the first register is byte `0x328` >> 1. These agree with the
byte and bit positions above.

The real block's `0x31C`–`0x32B` reads `20 00 00 00 00 00 08 00 | 00 00 00 10 |
FE 18 00 00`: the trigger record, `0x324`–`0x327`, and the brake record plus
`0x32B`.

---

## 3. External devices, `0x330`–`0x3AF`

**Left or right is a setting, not a model.** The stick's USB name and product
ID follow the grip type in record 0 (byte 2, below): SCG gives "EVO R" and an
even product ID, SCG-L gives "EVO L" and the next, odd one. That is also all
the vendor program looks at when it chooses a right-hand or left-hand picture —
the parity of the product ID. So a profile copied from a right-hand stick to a
left-hand one changes what the stick calls itself, and a game will see a
different device.

Standard or Omni is different: it is the firmware. VKB's 2.20.C package has
separate images for the Gladiator EVO and NXT with the Omni Throttle adapter.
What name and product ID those report has not been read here; this version of
the vendor program has no table for them.

Eight records of 16 bytes. Block→UI dispatcher `0x006935F4` (control IDs
0x65–0x76), per-byte dispatcher `0x0068D36C`, status text `ExtDevStat`
(`0x0042A968`), type names function `0x006D6258`.

| Byte | Bits | Field | ctl | Notes |
|---|---|---|---|---|
| 0 | all | **AdrL**, device address low | 0x65 | `ExtDevStat` prints `N:byte1.byte0`. |
| 1 | all | **AdrH**, device address high | 0x66 | The VKB manual gives "AdrH=17". |
| 2 | 0–4 | **device type**; 0 = NONE (record unused) | 0x67 | Table below. The code tests `rec[2] & 0x1F` everywhere. ***Verified*** to decide which hand the stick says it is: with type 8 (SCG) a Gladiator EVO reports the USB name `Gladiator EVO R` and product ID `0x0200`; with only this field changed to 9 (SCG-L) it reports `Gladiator EVO L` and `0x0201`. |
| 2 | 5–7 | polling interval index | 0x68 | 1, 2, 4, 8, 16, 32, 64, 128 ms. Poll combo. |
| 3 | 0–1 | alternate configuration | 0x76 | 0 = none, 1–3. `ExtDevStat` prints `[n]` if nonzero. |
| 3 | 2–4 | serial port | 0x69 | 0–2 = USART1–USART3; `ExtDevStat` shows value + 1. |
| 3 | 5–7 | low 3 bits of "Ax N" (number of axes) | 0x6A | `btnReadParamClick` tests `rec[3] & 0xE0` (any axes). |
| 4 | 0–3 | spin " # (1..16)" (0 shows as 16) | 0x6B | Meaning low. The buttons document reads the same bits as the first register the device claims ([`BLOCK-BUTTONS.md`](BLOCK-BUTTONS.md) §9). |
| 4 bits 4–7, 5 bit 0 | 5 bits | **Number of registers** (0–16) | 0x6C | `(u16(rec+4) >> 4) & 0x1F`. |
| 5 | 1 | high bit of "Ax N" (bit 3) | 0x6A | |
| 5 | 2–5 | **Number of encoders** (0–9) | 0x6E | |
| 5 bits 6–7, 6 bits 0–3 | 6 bits | **Number of LEDs** (0–63) | 0x70 | `(u16(rec+5) >> 6) & 0x3F`. |
| 6 bits 4–7, 7 bits 0–1 | 6 bits | **Bind LEDs: first LED number** | 0x71 | `(u16(rec+6) >> 4) & 0x3F`. |
| 7 | 2 | "Reg bindings" checkbox | 0x6D | |
| 8–15 | 8 × u8 | per-slot binding bytes | 0x73–0x75 | See below. Type-dependent; meaning low. |

Confidence: the analysis gives no per-row ratings for this table, only
"meaning low" for the two rows so marked; it rates the explanation of the
differences between the two units' record 0 (below) **high**. The decoded
values of the real block (below) are the cross-check on the layout. Byte 7 bits
0–1 and 3–7 are not covered.

**Slot bytes.** For each of the bytes 8–15, bits 0–2 are the role (`ctl 0x73`)
and bits 3–4 are the sub-module − 1 (`ctl 0x74`). The analysis summarised
`ctl 0x75`, a "5-bit index + 1" (for example "V_MaRS X/Y → axis #"), as bits
3–7. The dispatcher code (`0x0068D36C`) computes the displayed value for
`ctl 0x75` as `(b & 0x18) + (b >> 5) + 1`, so bits 3–4 contribute in steps of 8
and bits 5–7 the low part; that formula, not a plain bits 3–7 field, is what
reproduces the worked decode of record 0 below.

### Device types

Bits 0–4 of byte 2, names from the function at `0x006D6258`; any other value
gives a blank name.

| Type | Name | Type | Name |
|---|---|---|---|
| 0 | NONE | 13 | SEM |
| 1 | Generic device | 14 | THQ |
| 2 | TRudder | 15 | FSM.DIY |
| 3 | KG12 | 16 | FSM.GA |
| 4 | KG12 Twist | 17 | FSM.XX |
| 5 | GF Base L | 18 | STEM |
| 6 | GF Base | 19 | MTG-R |
| 7 | MCG | 20 | MTG-L |
| 8 | SCG | 21 | MTS-R |
| 9 | SCG-L | 22 | MTS-L |
| 10 | TMW Adapter | 23 | TR3 |
| 11 | F14 Stick | 24 | RP |
| 12 | MCG Ultimate | 25 | LP |
| | | 31 | NXT Joker |

Other code that looks at the type: `btnReadParamClick` tests record 0 against 2
(TRudder) and `0x17` (TR3) and acts on the global at `0x00F081A9`; it stops an
enumeration of the records at type 7 (MCG) or `0x0C` (MCG Ultimate);
`TForm36` gives types `0x0D`, `0x0E`, `0x10` and `0x12` (SEM, THQ, FSM.GA,
STEM) specific icons and port numbers.

### Worked decode, record 0

Real block, `0x330`–`0x33F`:

```
0B 11 48 84 42 80 A0 00 | 81 A1 44 45 00 00 00 00
```

| Byte | Value | Reading |
|---|---|---|
| 0 | `0B` | AdrL = 11 |
| 1 | `11` | AdrH = 17 |
| 2 | `48` | bits 0–4 = 8: **SCG**; bits 5–7 = 2: poll index 2, 4 ms |
| 3 | `84` | alternate configuration 0 (none); port 1 = USART2; low 3 bits of "Ax N" = 4 |
| 4–5 | `42 80` | " #" spin = 2; number of registers = `(0x8042 >> 4) & 0x1F` = 4; "Ax N" bit 3 = 0, so Ax N = 4; encoders 0 |
| 5–6 | `80 A0` | number of LEDs = `(0xA080 >> 6) & 0x3F` = 2 |
| 6–7 | `A0 00` | first bound LED = `(0x00A0 >> 4) & 0x3F` = 10; "Reg bindings" off |
| 8–15 | `81 A1 44 45 00 00 00 00` | slot bytes: (role, index) = (1, 5), (1, 6), (4, 3), (5, 3), then four empty |

Records 1–7 are all zero.

Cross-checks: the 4 ms poll and `AdrH` = 17 agree with the example defaults in
VKB manual §12.5.2 (given there for a Gunfighter base with an MCG grip, "Poll =
4 ms, AdrH=17"); the use of USART2 agrees with manual §12.2.2 ("Combined
devices use USART #2"); the header's USART2 byte (`0x023`, §1) is the only
nonzero port byte; and the two LEDs bound starting at LED 10 are LEDs 10 and 11,
the two grip LEDs the LED events in §4.5 use.

### The other unit

The second unit's profiles hold `0C 11 49 …` in the same place: AdrL = 12, and
byte 2 `0x49` gives type **9, SCG-L**, with the same poll index. In the regions
covered by this document the two units differ in byte 0 of record 0 (`0x0B`
against `0x0C`), in the low five bits of byte 2 (8 against 9), and in the CRC
word, which follows from the other two. That is real differential evidence for
the type field: apart from the address byte it is the only value that differs,
and 8 and 9 are the adjacent entries SCG and SCG-L in the type table. Why the
address differs by one along with the type is not explained, and what the
SCG / SCG-L distinction means physically (for example whether "-L" denotes a
left-hand grip) is not established.

---

## 4. LEDs

### 4.1 Channel masks, `0x3B0`–`0x3B7`

One byte per LED number *n* from 0 to 7. In `GetLedPowerColor` (`0x00429680`):
bits 0–2 say which colour channels exist for colour 1 (R = bit 0, G = bit 1,
B = bit 2) and bits 3–5 the same for colour 2. For LED numbers 8 and up the mask
is taken as 7 (all channels). Bits 6–7 are not used by these functions.
Evidence: `GetLedPowerColor` and `GetLedEvent` (`0x0042972C`).

Real block: LED 0 is `0x0C` — colour 1 = blue only, colour 2 = red only (the
base's system LED); LEDs 1–7 are `0x40` (bit 6 set, no channels).

### 4.2 Event table, `0x3B8`

Event *n* is the six bytes at `0x3B8 + 6n` (`Get_PAR_LEDEVENT`, `0x00429398`).
The maximum number of events is returned by `Get_Max_LEDEVENT` (`0x00437C08`):
12 if the flag A4 (`0x00F081A4`) is clear; 32 if it is set and the flag at
`0x00F081CF` is clear; 52 (`0x34`) if `0x00F081CF` is set. Fifty-two events end
the table exactly at `0x4EF` (52 × 6 = `0x138`); the next structure starts at
`0x4F0`. Which of 12, 32 or 52 applies to this device was not determined; with
A4 taken as 1 for the test device it would be 32 or 52. Only the first five
events are nonzero in the real block. The LED gauge records are separate
structures, at `0x7D0` (§5.3).

### 4.3 Event record

| Byte | Bits | Field | Encoding / values | Confidence | Evidence |
|---|---|---|---|---|---|
| 0–2 | 24-bit LE word | LED state | R1 bits 0–2, G1 3–5, B1 6–8, R2 9–11, G2 12–14, B2 15–17, MODE 18–20, COLOR MODE 21–23. See below. | high | `GetLedEvent` uses fields at shifts 0, 3, 6 and 9, 12, 15; the block→UI dispatcher `0x006B7F00` reads `(rec[2] >> 2) & 7` (`ctl 0x7C` "MODE") and `(rec[2] >> 5) & 7` (`ctl 0x7D` "COLOR") |
| 3 | 0–3 and 5 | event type | `(b3 & 0x0F) + ((b3 >> 5) & 1) * 16`, 0–0x17; table in §4.4. | high | instructions `0x006BD635`–`0x006BD64C` |
| 3 | 4 | "Invert event" | | high | `ctl 0x79` |
| 3 | 6–7 | "Alt" combo | | high | `ctl 0x82` |
| 4 | all | event parameter | `ctl 0x7A` "OP1", spin 0–255. `ctl 0x81` is `(b4 >> 5) + 1`, a second operand for event types whose `Get_LEDEVENT_options` entry has a two-operand flag. The analysis lists both without saying how they share the byte. | medium | `ctl 0x7A`, `ctl 0x81`; `Get_LEDEVENT_options` `0x00429148` |
| 5 | 0–6 | LED number | Spin 0–127. | high | `ctl 0x7B` |
| 5 | 7 | checkbox | Caption unresolved; always 0 in the real block. | low | `ctl 0x80` |

The LED event dispatchers are `0x006B7F00` (block→UI) and `0x006BD608`.

**Relation to the public LED block.** Event bytes 0–2 use the same packing as
the four-byte LED block of VKB's public runtime command (`59 A5 0A …`,
described in [`PRIOR-ART.md`](PRIOR-ART.md)): the 24 bits that follow the LED
number there, `R1 G1 B1 R2 G2 B2` at three bits each, a 3-bit mode and a 3-bit
colour mode. The mode values (0 off, 1 constant, 2 slow, 3 fast, 4 ultra-fast)
and colour-mode values (0 colour 1, 1 colour 2, 2 colour 1 / colour 2,
3 colour 2 / colour 1, 4 colour 1 + colour 2) are the ones in that table. In
the public block the LED number is a separate leading byte; in a stored event it
is byte 5, bits 0–6, and bytes 3–4 hold the event type, the "Invert event" and
"Alt" bits, and the event parameter.

### 4.4 Event types

Names from `GetEventNameByIndex` (`0x00428A50`); the type is 5 bits, and values
0 and 0x18 and above give "External" (the default case).

| Type | Name | Type | Name |
|---|---|---|---|
| 0 | External (default) | 12 | Rudder Connect |
| 1 | Zero event | 13 | BUS Error |
| 2 | SHIFT | 14 | POV Active |
| 3 | Fix Axis | 15 | Mice Active |
| 4 | Calibration | 16 | Profile N |
| 5 | Physical Button | 17 | Cyclic Switch |
| 6 | Virtual Button | 18 | P-Alternate Function |
| 7 | Logical Button | 19 | V-Alternate Function |
| 8 | Axis in center | 20 | Boolean Function |
| 9 | MaRS fault | 21 | Detents Set |
| 10 | Calibration fault | 22 | Detents State |
| 11 | SubSHIFT | 23 | Trimmer in center |

The operand range per type is returned by `Get_LEDEVENT_options`
(`0x00429148`). Examples noted: buttons 0x80, SHIFT 2, SubSHIFT 7, POV 4,
profile 9, detents set 5; the other ranges were not transcribed.

### 4.5 Worked decode, the real block's LED events

Notation: `B3` is the blue field with raw value 3, `C1` and `C2` are colours 1
and 2. All five decode plausibly.

| Event | Bytes | LED | Event type | Colours | Mode |
|---|---|---|---|---|---|
| 0 @ `0x3B8` | `C0 06 04 01 00 00` | 0 (system LED) | 1 Zero event | C1 = B3, C2 = R3 | constant, colour 1 |
| 1 @ `0x3BE` | `58 01 04 01 00 0A` | 10 (grip) | 1 Zero event | C1 = G3 B5 | constant |
| 2 @ `0x3C4` | `40 01 0C 04 01 00` | 0 | 4 Calibration, operand 1 | C1 = B5 | fast, colour 1 |
| 3 @ `0x3CA` | `02 00 04 1E 01 0B` | 11 (grip) | 14 POV Active, inverted, operand 1 | C1 = R2 | constant |
| 4 @ `0x3D0` | `C0 0A 50 0D 00 00` | 0 | 13 BUS Error | C1 = B3, C2 = R5 | ultra-fast, colour 1 / colour 2 (alternating) |
| 5 onward | zeros | | | | |

The colours used on LED 0 (blue as colour 1, red as colour 2) agree with its
`0x0C` channel mask in §4.1. LEDs 10 and 11 are the two LEDs that
external-device record 0 binds (§3).

---

## 5. Other regions

### 5.1 `0x5E0`–`0x5EF`, global-option extension

`0x5E0` bits 0–2 are the "Rls Time" combo (`ctl 0xC`; 300, 400, 500, 600, 700,
800, 1000 ms). Bits 3–6 are the LED **brightness**, stored as 16 − *n* for *n*
from 1 to 16 (`ctl 0x3F`, spin "Brightness 1..16"). The real block has `0x68`:
Rls Time index 0 (300 ms) and brightness 3. `0x5EE` and `0x5EF` correspond to
control IDs 0x3D4 and 0x3D5; the controls were not located. `0x5F0` is touched
by `TForm10::ENC_TNChange` and the function at `0x007444A0` (an encoder table);
it is outside this document. No confidence level was assigned to this region.

[`BLOCK-AXES.md`](BLOCK-AXES.md) §1 and §10 list the non-zero bytes at `0x5E0`,
`0x603` and `0x607` of the real block as not tied to any axis dialog. They are
the fields described here and in §5.2.

### 5.2 `0x600` and `0x604`, POV 2 and 3

The layout is the one in §2.2. Both records are unused in the real block, each reading `00 00 00 7F` (so `0x603` and `0x607` are `0x7F`).

### 5.3 `0x7D0`–`0x7FF`, LED gauges (linear indicators)

Four 12-byte records, record *k* at `0x7D0 + 12k` (global `0x00F095B8 + 12k`,
registered in the list at `0x00F08D30`). Block→UI dispatcher `0x006CD76C`
(control IDs 0x1F5–0x201), used from `RefreshExternal` and `ShowSheetExternal`
(`0x0071704C`). All four records are zero in the real block.

Confidence: layout **medium**, names **low**.

| Byte | Bits | Field | ctl |
|---|---|---|---|
| 0 | 0–4 | axis N | 0x1F5 |
| 6 | 2–7 | N LEDs | 0x1F6 |
| 7 | 6–7 | axis type, Normal / Logical | 0x1F7 |
| 7 | 0–5 | "Serial Led Base" | 0x1F9 |
| 8 | 0–2 | Type (UFC, U±, CFS) | 0x1F8 |
| u16 at 8 | 3–9 | a 0–100 % value | 0x1FA |
| u16 at 9 | 2–8 | a 0–100 % value, labelled "OverLimit" or "Center" (the analysis does not say which) | 0x1FC |
| 10 | 1 | Reverse order | 0x1FB |
| 0 bits 5–7 and 1 bits 0–2 onward | | four colour fields; only where the first starts is recorded | 0x1FE–0x201 |

### 5.4 Detents, `0xB00`–`0xDB1` (shallow)

Evidence: `dtnMakeActiveSetDtnClick` (`0x0043EE50`), `btnClearDetentSetClick`
(`0x0043F0A4`), `btnClearAllSetsClick` (`0x0043F214`),
`Get_TECS_Size_Detents_Pool` (`0x0041BFB8`), `TabSheetDetendsActivate`
(`0x004F8EB4`; spelling as in the tool); detent dispatchers `0x00655800` and
`0x006476B4` working on `0x00F098E8` (block `0xB00`), control IDs 0x12C–0x14F.

| Block range | What | Confidence |
|---|---|---|
| `0xB00`–`0xB0F` | Detent header. `0xB0B` bits 0–3 are the active detent set (`pageindex & 0xF`); bit 7 is "extended detents" mode (tested in `btnClearAllSetsClick` when the flag at `0x00F081AF` is clear). Bit 5 of `0xB01` mirrors bit 0 of the global at `0x00F089BE` (`RefreshParam`). | medium |
| `0xB10`–`0xBFF` | Ten detent sets of 0x18 bytes each. Clear-all fills from `0xB10` with `0xF0`; clear-one clears 0x18 bytes at `0xB10 + 0x18 × set`. The inner layout is not decoded. The UI offers Detent Type, Soft Detent, Crv, Event, Pulse mode, secondary-button events, Enable and Active Set #. | medium (sizes) / low (fields) |
| `0xC00`–`0xD7F` | Extended-detent area, 0x180 bytes. All zero in the real block (detents unused). | medium |
| `0xD80`–`0xDB1` | Extended-detent pool, 0x32 bytes: a zero-terminated list; `Get_TECS_Size_Detents_Pool` counts nonzero bytes up to 0x32. All zero in the real block. | medium |

Macros: no macro storage was found in the block; `0xDB2`–`0xFFF` is zero in the
real block with no code reference, and `RefreshMacrosesConfig` (`0x0071C654`)
was not examined, so macros are presumably a separate long-read / long-write
area (confidence low). [`COMMANDS.md`](COMMANDS.md) lists separate macro read
and write commands.

Also noted, outside the structures decoded here: `0x6BA` is referenced together
with `0x4F0` and `0x4F4` by the functions at `0x0071F844` and `0x0071F968`; the
analysis assigns it to the boolean-button area
([`BLOCK-BUTTONS.md`](BLOCK-BUTTONS.md)). The 12-bit "port" fields at
`0x608`–`0x619` (three 24-bit groups at `0x608`–`0x610` and three at
`0x611`–`0x619`, each two 12-bit values) reuse control IDs 0x65–0x6A and
0x6F–0x74 in the UI→block dispatcher; they are zero in the real block and their
meaning is unknown.

---

## 6. How this was derived

The tool builds most of its settings controls at run time instead of in its
form resources, and registers each under a numeric ID. Two very large switch
functions copy a value between the control with a given ID and a byte or
bit-field of the in-memory copy of the block: the UI→block dispatcher at
`0x005462D4`–`0x0056F444` and the block→UI dispatcher at
`0x005151B8`–`0x00546288`. Structures with many records have their own
dispatchers: POV `0x0067A55C`, external-device record `0x006935F4` /
`0x0068D36C`, LED event `0x006B7F00` / `0x006BD608`, LED gauge `0x006CD76C`,
virtual button `0x006DAA74`, detents `0x00655800` / `0x006476B4`. These
functions defeat the decompiler, so they were read as assembly: the ID compare
tree and jump tables were followed to each ID's case, and the case body shows
the exact block offset and the masks and shifts applied for each control class.
Captions and hints come from the tool's localisation table, found through the
registration of each control. The result was then checked against one real
block and two saved profiles to see that decoded fields held plausible values;
that is a plausibility check, not a test of behaviour.

---

## 7. Not determined

- The meaning of `block[0x000]` and `block[0x001]`; the exact meaning of
  `0x003`, `0x00A` (`ctl 0x4`), `0x00B` bit 7, `0x010` bit 6, the writers of
  `0x013` bits 0 and 5, `0x025`–`0x029`, the label of `0x00E` bits 0–3 and the
  control for `0x00E` bits 6–7.
- The per-port bit layout of the three USART bytes at `0x022`–`0x024` (only
  `(b & 7) == 2` is known), and the 12-bit fields at `0x608`–`0x619` and
  `0x02D`–`0x02F`.
- The POV type and mode value-to-name tables (positions known, names not
  mapped).
- The detent-set inner layout; macro storage (none found in the 4 KiB block;
  `SheetMacroCreate` and `RefreshMacrosesConfig` at `0x0071C654` not
  examined); the LED-event byte 4 semantics per event type; LED-event byte 5
  bit 7.
- USB VID / PID override fields: only the PID bias (`0x00F` bits 6–7, with bit 5)
  was found. No VID field, device name string or serial string exists in the
  header; the serial number is four digits at `0x32E`.

Also unresolved in the sections above: how many LED events this device holds
(12, 32 or 52); the captions and meaning of the two virtual-button records at
`0x31C` and `0x328`; the meaning of the external-device slot bytes per device
type; the controls behind `0x5EE` and `0x5EF`; the gauge fields' names; and how
the 1–64 SPI2 spin fits a five-bit field.
