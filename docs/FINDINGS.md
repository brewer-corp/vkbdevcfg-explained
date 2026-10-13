# Findings

Everything established so far, with an explicit split between what was
**observed** and what is **inferred**.

Up to §4 this was derived without sending anything to a device. §5 onward
records work in which the test device's configuration was read, deliberately
changed by one setting, and restored — see [Safety](#safety).

Detail lives in companion documents:

| Topic | Document |
|---|---|
| The USB/HID protocol, including the write path | [`PROTOCOL.md`](PROTOCOL.md) |
| The `.cfg` profile file | [`CFG-FILE-FORMAT.md`](CFG-FILE-FORMAT.md) |
| The 4096-byte parameter block, field by field | [`PARAMETER-BLOCK.md`](PARAMETER-BLOCK.md) |
| Device commands other than read/write | [`COMMANDS.md`](COMMANDS.md) |
| What was already public | [`PRIOR-ART.md`](PRIOR-ART.md) |

---

## 1. What VKBDevCfg actually is

| Property | Value | How established |
|---|---|---|
| Language / toolchain | **C++Builder** (Embarcadero RAD Studio), using the Delphi VCL | `cdecl` calling convention throughout the application's own code; unit names `Unit1`…`Unit48`; `@@Unit10@Initialize`-style exports |
| Architecture | PE32, x86, GUI subsystem | PE header |
| Memory manager | FastMM, Embarcadero edition | `FastMM Embarcadero Edition (c) 2004 - 2011` |
| UI skinning | AlphaSkins (acmSoft) | `www.alphaskins.com` string; `sButton` / `sLabel` / `sPanel` class prefixes |
| Report / PDF | FastReport | `Tfrx*` form classes; `Software\FastReport` registry keys |
| Device enumeration | DirectInput 8 | `IDirectInput8W`, `IDirectInputDevice8W` |
| Device I/O | JEDI `TJvHidDevice` over the Win32 HID class driver | unit `Hid_jedi`; `HidD_GetFeature` / `HidD_SetFeature` |
| Size | 23 MB, single self-contained `.exe` | — |
| Version analysed | `VKBDevCfg-C v0.93.89` | official download |

Sections: `.text .data .tls .rdata .idata .didata .edata .rsrc .reloc`.

> **Correction.** Earlier revisions called this a Delphi program. The
> libraries are Delphi; the application is C++Builder. It matters for
> decompilation: Ghidra's Borland profile assumes the register calling
> convention, and until the application's functions are re-marked `cdecl` the
> decompiler silently drops every stack argument.

### Symbols

The export table carries 6,387 names. Nearly all belong to AlphaSkins; the
application's own contribution is its unit initialisers — which is still
useful, because they give the unit map: `Devreader`, `Info`, `Unit3`…`Unit48`,
`Local_`, `Directinput`, `Hid_jedi`, `Led`, `Makedefault`, `Misc`,
`Multimedia`, `Zbitbtn`, `Zpov`.

The real prize is the **VCL run-time type information**. Every form class
carries a published-method table mapping handler names to code addresses.
`tools/rtti.py` recovers 1,667 classes and 1,277 named methods, including all
471 event handlers of `TMainForm`:

```
btnReadParamClick   0x0041133C      ReadCPUID            0x00410E90
btnWriteParamClick  0x00410814      ShortCMD             0x00412354
btnSaveParamClick   0x00413B20      LoadParamExecute     0x004134F8
HidCtlDeviceData    0x0042BBEC      btnBootloaderClick   0x00412B20
```

That is what made the rest of this document possible. The earlier analysis
reached the cipher by pattern-matching for XOR loops; with names, the read,
write, save and load paths can simply be followed.

### What resisted

Eighteen functions defeat the decompiler — it times out or runs out of memory.
Most are giant `switch` statements that map each dynamically created UI control
to a field of the configuration, and had to be read as assembly. They are
listed in [`PARAMETER-BLOCK.md`](PARAMETER-BLOCK.md).

---

## 2. The UI, fully decoded

Window layouts are stored as binary DFM (`TPF0`) streams in the resource
section. `tools/dfm.py` decodes them; **all 69 embedded forms parse cleanly**
and are dumped to `data/forms/` by `tools/extract_forms.py`.

The main window `MainForm` alone has **74 top-level controls**.

Getting there required fixing three things in the DFM decoder that are easy to
get wrong:

1. `TValueType` ordinals are offset by one from the naive reading —
   `vaInt8=2`, `vaInt16=3`, `vaString=6`, `vaSet=11`, `vaCollection=14`.
2. `vaList` is a sequence of typed values terminated by a **zero type byte**.
3. `vaCollection` items begin with a **flag byte**: bit 0 = has properties,
   bit 1 = has children; the collection ends with a zero flag byte.

Most *settings* controls are not in the DFM at all. They are created at run
time, each tagged with a numeric ID, with captions taken from a localisation
table of 872 strings. Both are recoverable, and are what the field map is built
from.

### Features the source video never mentions

Read directly out of the compiled form definitions:

Visual Diagram · Visual Mapping · Curve Wizard · NXT SEM Axes Wizard ·
Create MobiFlight Connector JSON · Comparators · Detents · Functional generator ·
Script / Script Test · Find && Auto Config · Global SHIFTs / SubSHIFTs ·
MultiDevice, Master/Slave Settings · Virtual BUS over USB · Trackers / Gyro /
Compass · Get/Set Feature, HID Set 1/2 · Led Gauge · System LEDs colour
inversion · Raw Axes Data / Axis Data · Macros Array 1 / 2

One more turned up in the code rather than the forms: a **target memory**
selector, `EEPROM` or `RAM`, which changes the command used for reads and
writes. See [`PROTOCOL.md`](PROTOCOL.md) §4–§5.

---

## 3. The device

Observed on a **VKBsim Gladiator EVO R**.

| Property | Value |
|---|---|
| VID:PID | `231d:0200` |
| Manufacturer string | `VKB-Sim (C) Alex Oz 2023` |
| Product string | `VKBsim Gladiator EVO R` |
| `bcdDevice` | `0x220C` — firmware 2.20.C, the same word the configuration block carries at offset 8 |
| Speed | full speed, 12 Mbit/s |
| Interfaces | **exactly one**, class HID |
| Endpoints | **exactly one**: interrupt IN, 64 bytes, 1 ms |
| USB serial string | empty |
| Microcontroller | STM32 — the configuration handshake returns its 96-bit unique ID |

### Report map

| Report ID | Type | Size | Role |
|---|---|---|---|
| `0x01` | Input | 63 B | live axes, hat, 128 button bits |
| `0x08` | Input | 63 B | service packets; subtype `0x13` is encoder status ([`PRIOR-ART.md`](PRIOR-ART.md)) |
| `0x0B` | Input | 63 B | auxiliary state |
| `0x0C` | Input | 63 B | auxiliary state |
| `0x58` | Output | 63 B | **not** used for configuration |
| `0x59` | **Feature** | 128 B | **all configuration traffic, both directions** |

> **Correction.** Earlier revisions mapped `0x58` to the **Set** button and
> `0x59` to **Get**. Both buttons use feature report `0x59`. With no OUT
> endpoint, a write is a `SET_REPORT(Feature)` control transfer.

Report `0x01` layout: eight 16-bit slots at bits 0–127 (X, Y, Rz, Z, Rx, Ry, two
reserved), 128 one-bit buttons at bits 128–255, a 4-bit hat plus padding at
256–271, three reserved 16-bit slots, then 23 bytes the descriptor declares
constant.

Those last bytes are not padding. Live reports carry `A5` at byte `0x2F`
(counting the report ID as byte 0), and the vendor tool treats that as a
validity marker: when it is present, it reads the two SHIFT states and the
sub-shift mask from the two bytes before it ([`COMMANDS.md`](COMMANDS.md) §5).
The marker was observed, and so was the rest: with two lines held down by
axis zones, the 16 bytes after the marker showed exactly those lines set, and
the SHIFT1 bit rose while a shift line was held. So every input report says
which of the 128 lines are active, before any function is applied — which is
how a tool can show "you pressed line 23" for a control that is not mapped to
anything.

---

## 4. The configuration model

Sourced from VKB's official **NJoy32 Configuration Utility User Guide v2.19**
(163 pages, August 2023). Digested in [`MANUAL-DIGEST.md`](MANUAL-DIGEST.md).

### Observed — the device is a real-time signal processor

Almost every "logical" feature — shift hierarchies, relative axes, curve
equalisation, macro timing, LED event priority — is executed **in device
firmware**, not in the PC tool. The tool pushes a parameter block and pulls it
back.

Consequence: a host-side software remapper is the *weakest* option. A
replacement UI should edit the parameter block and leave the processing where
it is.

### Observed — four layers, not two

```
physical line -> physical function -> logical line -> logical function
```

26 physical function types, 11 logical ones. Some physical functions have **no**
logical function at all — Shift is a modifier, not an output.

### Observed — "line" is the currency

128 lines, eight per register, `Reg#1…Reg#16`. Physical line numbers are fixed by
wiring.

### Observed — three things the video omits

- **`En` vs `Vs`** — two separate visibility gates per line.
- **Virtual controllers 1–8** — a workaround for Windows' cap of 8 axes per
  HID device.
- **Only one live configuration on the device.** Per-game profiles live in
  `.cfg` files on the PC.

---

## 5. The configuration is one 4096-byte block

**Observed on hardware.** The entire configuration of the stick is a single
4096-byte parameter block held in flash. VKBDevCfg's **Get** reads it, **Set**
writes all of it, **Save** and **Load** move the same bytes to and from a file.

```
0x000   FF FF 11 FF            byte 2 = device type id
0x004   CRC-32 of 0x008..0xFFF (STM32 hardware CRC; the device computes it)
0x008   firmware version       0x220C
0x00C…  global options, axes, calibration, curves, button tables, external
        devices, LEDs, …        — see PARAMETER-BLOCK.md
```

The block from the test device is mostly `0x00`, `0xFF` and `0x80`: about 1.6
bits of entropy per byte. The structure is regular enough to read by eye —
eight-byte axis records, two-byte entries for each of the 128 lines.

### Three persistence layers, now understood

| Layer | What it is | Format |
|---|---|---|
| Device flash | the configuration | the parameter block |
| `.cfg` | a saved copy of the block | the block minus its CRC word, RC4 under a fixed key — [`CFG-FILE-FORMAT.md`](CFG-FILE-FORMAT.md) |
| `zconfig.ini` | the *application's* own state | plain INI, next to the executable |

---

## 6. The protocol is solved, and works from Linux

**Observed on hardware.** Full detail in [`PROTOCOL.md`](PROTOCOL.md).

- Everything travels over feature report `0x59`, in frames headed
  `A5 cmd size addr crc16` one way and `5A …` the other.
- A handshake, which the tool calls `READ_CPUID`, returns the STM32 unique ID
  wrapped in RC4 under a key compiled into the tool. The first 15 bytes of the
  result are the RC4 key for the block in transit.
- Reading: one request, 33 replies, RC4, check the CRC-32.
- Writing: 33 frames, then a status word. The stick restarts about 0.3 s later
  and is back in under 3 s.

`tools/vkb_hid.py` does all of it with the Python standard library.

What was done to the test device, in order: read; write back unchanged; change
one setting and confirm it persisted across the restart; restore; confirm the
result is byte-identical to the original.

> **Correction.** Earlier revisions said feature-report reads were "blocked" by
> the Linux kernel and that a Windows machine was required. Neither is true.

---

## 7. The `.cfg` format is solved

**Observed on two real profiles.** Full detail in
[`CFG-FILE-FORMAT.md`](CFG-FILE-FORMAT.md).

A `.cfg` is RC4-encrypted under a 13-byte key: nine bytes of a constant compiled
into VKBDevCfg, and the file's own four-byte CRC, which is stored in the clear
at the start of the file. Both sample profiles decrypt, pass their CRC, and
re-encrypt to the identical bytes.

Three earlier conclusions fall with that:

1. **"The key is derived at runtime from device state."** The buffer at
   `0x00F08B5E` is the *transport* key (§6). The file cipher is a different
   call, in a different function, with a constant key. Nothing binds a profile
   to a device.
2. **"There is per-save randomisation."** There is none. The CRC is part of the
   key, so changing one byte of the configuration changes the whole keystream —
   which is why two nearly identical profiles looked unrelated.
3. **"Two profiles cannot be meaningfully diffed."** Decrypted, the two samples
   differ in exactly two bytes.

What the statistics did get right: 4096 bytes, high entropy, no compression,
no repeating-key XOR, CRC-32 for integrity rather than authentication.

---

## 8. What VKBDevCfg offers as an integration surface

Still nothing. Checked against both the binary and the manual:

- **No command line**, no scripting, no IPC, no COM server, no plugins.
- Drag-and-drop of a single `.cfg` onto the window, with **Set After Load**,
  remains the only way to make the vendor tool apply a file unattended.

That no longer matters much, because the two things one would want the vendor
tool *for* can now be done without it:

| Goal | Route |
|---|---|
| Produce a profile VKBDevCfg will load | `vkb_cfg.py encrypt` |
| Read a stick's configuration | `vkb_hid.py read` |
| Write a configuration to a stick | `vkb_hid.py write` |

`Copy cell` / `Paste cell` — the clipboard seam earlier revisions flagged as the
best remaining hope — was never examined, and is no longer needed.

---

## 9. Assessment

| Approach | Verdict |
|---|---|
| **Talk to the device directly** | **Works.** Read and write verified on one device and firmware |
| **Generate a `.cfg`** for the vendor app to apply | **Works** at the file level: output is byte-identical to the vendor's on the samples. Not yet loaded into VKBDevCfg itself |
| Wrap / automate VKBDevCfg | Unnecessary, and there is nothing to wrap |
| Host-side software remapper | Still the weakest — the device does the processing |
| Better documentation | Shipped — see `site/` |

The seam the project was looking for is the parameter block. A replacement UI
is an editor for 4096 bytes, plus the transport in `tools/`. What stands
between here and that UI is the field map, which is partial —
[`PARAMETER-BLOCK.md`](PARAMETER-BLOCK.md) says exactly how partial.

---

## 10. Open questions

1. **How much of the block is mapped, and how much of the map is right.** The
   layout comes from static analysis. About thirty fields have since been
   confirmed by changing each on the stick and watching its HID descriptor or
   input report change as predicted: the axis records, curves and calibration
   gains ([`BLOCK-AXES.md`](BLOCK-AXES.md) §9a), and the main button encodings,
   tested on virtual lines held down by axis zones
   ([`BLOCK-BUTTONS.md`](BLOCK-BUTTONS.md) §11a). Still unconfirmed: LEDs,
   filters, the rarer button functions, and which control is wired to which
   line — those need eyes or hands on the stick.
2. **Does it hold for other devices and firmware?** One stick, one firmware
   version. The tool carries branches for older block sizes (`0x400`, `0x800`)
   and for a different "profile" layout used by other device families; none of
   that was tested.
3. **What does the device validate on write?** The transfer, not the contents.
   A wrong CRC-16 and a truncated transfer are both refused with flash
   untouched. A wrong device type id is not: the stick keeps its own id and
   stores the rest ([`PROTOCOL.md`](PROTOCOL.md) §5). Whether it rejects
   out-of-range field values is still unknown, and nothing suggests it does.
   A UI should refuse to write anything it cannot fully parse.
4. **Short commands.** Reset, defaults, calibration, bootloader entry and the
   rest are catalogued in [`COMMANDS.md`](COMMANDS.md) from the binary. None has
   been sent.
5. **The `RAM` target.** The device acknowledges writes to it and applies
   nothing — the change is absent from both copies even before the restart.
   What it is for is unknown. Candidates: it stages data for a commit command
   that was never sent; it addresses a profile slot on other device families;
   or it is vestigial. The next step is a USB capture of VKBDevCfg writing
   with `RAM` selected.
6. **Macros.** Transferred by their own pair of long commands and saved in
   their own `.mcr` files. Located, not decoded.
7. **Firmware images** (`.vkb`) have an 80-byte plaintext header (model name,
   version word, build date) and an encrypted body; no two images share
   ciphertext. Not attempted, and not needed for configuration.
8. **The recovery path.** The vendor manual documents hardware entry into the
   bootloader (a BOOT jumper, or a button combination held while plugging in)
   followed by a reflash with ZBootloader, and warns that some firmware
   versions reset the configuration. Not exercised here; the combination for
   the Gladiator NXT EVO base is not in the manual on hand.

~~Where does the RC4 key come from, and is it stable?~~ **Closed.** Two keys,
both constant — §6, §7.
~~Is the clipboard payload plaintext?~~ **Moot** — §8.
~~Does `.cfg` encryption randomise per save?~~ **Closed** — no; §7.
~~What is the plaintext structure?~~ **Open in detail, closed in outline** — §5.

---

## Safety

Through §4, nothing was sent to any device.

For §5–§7 the test device was written to, deliberately, after the read path had
been verified end to end and the block backed up:

| Step | Target | Content | Result |
|---|---|---|---|
| 1 | RAM (`0x25`) | the device's own block, unchanged | accepted; nothing changed |
| 2 | flash (`0x24`) | the device's own block, unchanged | accepted; stored block identical |
| 3 | RAM (`0x25`) | one setting changed | accepted; **nothing changed** |
| 4 | flash (`0x24`) | one setting changed | accepted; change stored and in effect |
| 5 | flash (`0x24`) | original | accepted; original restored |
| 6 | flash (`0x24`) | original, with a `.cfg`-style CRC word | accepted; device stored its own CRC |
| 7–8 | flash (`0x24`) | the change and the restore again, through `tools/vkb_hid.py` | as 4 and 5 |

The setting changed was the filter grade of physical axis slot 7, which is
unused on this stick. After the last step the configuration hashed identically
to the backup taken before step 1, and the stick enumerated and reported input
normally.

No firmware was flashed. Two benign short commands were sent later, while
probing the `RAM` target — `0x17` (select profile 0) and `0x14` (partial-write
mask) — along with five more writes to that target, none of which changed
anything. Nothing reset the stick, restored defaults, started a calibration or
entered the bootloader, and the configuration still matches the original backup.
