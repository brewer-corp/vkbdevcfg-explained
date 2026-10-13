# Device commands

This is the catalogue of what VKBDevCfg-C v0.93.89 can send to an NJoy32 device besides
reading and writing the parameter block. It comes from **static analysis of the binary**.
**None of these commands was sent to a device during this work**, except the ones listed in
the box below. Treat every code in this document as unconfirmed until it has been tested.
Framing, the token handshake, the read and write of the parameter block and the write status
words are in [`PROTOCOL.md`](PROTOCOL.md) and are not repeated here.

Labels, as in `PROTOCOL.md`: ***verified*** is observed on the wire with the test device (only
the box below); ***static*** is read out of the binary; ***inferred*** is a conclusion drawn
from the code, not read from it. Everything outside the box is *static* unless marked
*inferred*. The tool's controller type (`0x00F08192`) is **6** for an NJoy32. Tags in a USB
string (§4) separate three generations, **V20**, **XT** and **XT2**, held in the flags `a3`,
`a4` and `a5` (`0x00F081A3` to `0x00F081A5`). The test device behaves as XT2.

> **Verified on hardware** (VKBsim Gladiator EVO R, firmware 2.20.C)
>
> - Long read `0x0B` (`READ_CPUID`).
> - Long read `0x02` (flash copy of the block) and `0x03` (RAM copy) — both return the
>   same 4096 bytes.
> - Long write `0x24` (flash) — accepted with status `5A A5 88 00`; the stick restarts about
>   0.3 s later and is back about 2.4 s after that.
> - Long write `0x25` (RAM target) — acknowledged with the same status, but changes nothing.
> - The device recomputes the block CRC word itself.
> - No short command is needed before a read or a write.
>
> - Input report `0x01` carries more than joystick state (§5): a 128-bit map of active
>   lines, and the SHIFT and SubSHIFT states.
> - Input report `0x0C` is sent, unasked, whenever a line changes after its function has
>   been applied (§5).
> - Short command `0x17` with argument 0 (no restart, no change, no acknowledgement);
>   `0x14` with argument 1 (acknowledged `5A A5 FE 00`); and `0x16` with argument 5
>   (acknowledged `5A A5 16 05`), after which the stick streams report `0x08` (§5).
> - The USB string descriptors (§4).
>
> Everything else in this document is *static*.

## 1. Short commands *(static)*

A short command is one feature-report `SET` with no payload (frame in
[`PROTOCOL.md`](PROTOCOL.md): `rid A5 5A code_lo code_hi`), built by `TMainForm::ShortCMD`
(`0x00412354`) from `code16 = (arg << 8) | cmd`.

- The report ID comes from the edit box `FEATURE_REPORT_ID` (`TMainForm+0x3CC`), which
  `DevListBoxClick` (`0x00415480`) pre-fills with `89` (`0x59`). The builder reads nothing
  back and does not sleep; callers add delays and reply polling.
- The "encoded" form (see `PROTOCOL.md`) is used only for type 6 with the encode flag
  `0x00F0897B` set. `WriteParam` clears that flag for V20 devices and a successful `ReadParam`
  sets it to "not V20", so V20 devices get plain frames.
- `ShortCMD_X` (`0x00412494`) replaces the `0x5A` at offset 2 with a third argument. Its one
  caller passes `0x55`.

A scan of the code for direct calls finds **37 calls to `ShortCMD` and 1 to `ShortCMD_X`**;
the table folds them into distinct codes. Danger levels are an assessment from how the code
uses each command, not a test result: **destructive** restores defaults, enters the bootloader
or erases (do not send casually); **disruptive** restarts the stick or alters calibration
(recoverable); **benign** is a query or selection.

| Code | Arg | What it does | UI trigger (call site) | Danger |
|---|---|---|---|---|
| `0x00` | `0x00` | Restart the stick; the host then arms the 5-second timer of §3 | `btnResetClick` (`0x00412751`; `0x004126DE` for type `0x64`): "Restart" button, also called after a write on V20 devices and by `TForm44::sButton1Click`. `sBitBtn6Click` sends it when its dialog closes (`0x0043B9FB`; *inferred*: leaves "find" mode) | disruptive |
| `0x01` | `0x00` | Restore factory defaults, everything. Box: "All data will be lost and replaced by default values. Are you sure ?", skipped at host user level 4 or more (§3) | `btnDefaultClick` (`0x004129BD`), "Default" button, when neither `a3` nor `a5` is set | destructive |
| `0x01` | mask | Restore defaults for the masked parts (0 = everything); Ctrl opens a mask dialog (`TForm18`). Needs the "PRO" flag (`0x00F081A2` or `0x00F081BC`), else "Only for PRO !!!" | `btnDefaultClick` (`0x00412A05`), when `a3` or `a5` is set | destructive |
| `0x01` | `1 << profile` | *Inferred*: clear one profile | `btnClearProfileClick` (`0x0043F5E3`), "Clear", hidden | destructive |
| `0x02` | `0x00` | Start calibration | `btnSTARTClbClick` (`0x004131B9`); `TForm34::sButton1Click` (`0x00489054`); `TForm44::sButton1Click` (`0x004AA54F`) | disruptive |
| `0x03` | `0x00` | End calibration (commit) | `btnENDClbClick` (`0x00413235`); `TForm34::sButton1Click` (`0x00488EA7`) in state 3 | disruptive |
| `0x04` | value of `0x00F0819A` | Cancel calibration; sent only if the value is non-zero | `btnCANCELClbClick` (`0x004132CA`) | disruptive |
| `0x11` | `0x00` | Read the eight error-level counters (reply bytes 4 to 11, passed to `Show_MaRS_ErrorLevel`) | `Timer8Timer` (`0x00424F24`) | benign |
| `0x14` | 8-bit mask | Partial-write mask (non-V20); the write is aborted without an ack | `btnWriteParamClick` (`0x00410C01`) | disruptive |
| `0x15` | axis mask | Partial calibration (non-V20); `0xFF` means "skip", exact meaning not determined | `PartialCalibr` (`0x00412FA8`), from `btnSTARTClbClick` via `TForm18` | disruptive |
| `0x16` | `0x05` | Enable error-statistics mode; needs flag `0x00F081C1` (firmware at least `0x182`) | `CMD_Error_STAT` (`0x0042A899`) | benign |
| `0x17` | profile | Select profile; `profile & 0xF` on the write path, `profile & 7` on the read path | `btnWriteParamClick` (`0x0041096A`); `btnReadParamClick` (`0x00411503`; argument 0 at `0x00411D6B` when the profile was above 0) | benign |
| `0x17` | `0xA0 \| profile` | *Inferred*: select and persist the profile | `btnSetProfileClick` (`0x0043F5B6`), "Set Active", hidden | disruptive |
| `0x18` | `0x00` | "Parking"; no effect described | `btnParkingClick` (`0x004325AC`), hidden and disabled | not classified |
| `0x19` | `0x00` | Prepare the units configuration; followed by long read `0x19` (§2) | `sButton11Click` (`0x0043AA1F`), "Get UNITS" | benign |
| `0x19` | `0x10` | Find the pressed input and auto-configure | `sBitBtn5Click` (`0x0043AFB5`), "FIND && AUTO CONFIG"; also called at the end of `btnReadParamClick` when block byte 3 is `0xA0`, bit 0 of byte `0x0B` is clear and a checkbox (`TMainForm+0x658`) is set | benign |
| `0x19` | `0x20 + N` | Get the configuration of external device N: module id, version (u16), button count. Fixed `0x21` in `TForm36`; `0x28` on firmware below `0x2178` | `btn_ED_CFGClick` (`0x0043DBCA`, `0x0043DBDC`), hidden; `TForm36::FormCreate` (`0x0048A46A`, `0x0048A47E`). The `0x20 + N` form needs firmware word `0x2178` or more | benign |
| `0x19` | `0x30` | "Get next active config" | `sBitBtn6Click` (`0x0043B047`), "FIND && SHOW" | benign |
| `0x1A`, `0x1E` | `0x00` | "Set center", "Reset center" | `btnSetCenterClick` (`0x00413348`), `btnResetCenterClick` (`0x0041EDF4`), both unreachable | disruptive |
| `0x3B` | `0x00` | Bootloader entry, step 1 | `btnBootloaderCMD` (`0x00412AB9`), from `btnBootloaderClick` ("Bootloader") and `Timer6Timer` (`0x0040F9E8`) | destructive |
| `0x55` | `0x00` | Bootloader entry, step 2 (10 ms sleep after each step). Then `btnBootloaderClick` sleeps 250 ms and calls `BootloaderStart` below user level 6, else sets two host flags and enables a timer. The device is expected to re-enumerate as `VKB-Bootloader` (*inferred*) | `btnBootloaderCMD` (`0x00412ACF`) | destructive |
| `0x15`, `0x16`, `0x17` | `0x00` | Legacy "map axis N" | `ButtonMAP_AXIS0Click`, `1Click`, `2Click` (`0x00413318`, `0x00413328`, `0x00413338`), unreachable | not classified |
| prefix `0x55` | 16-bit mask | V20 partial-write mask: `ShortCMD_X` sends `A5 55 mask_lo mask_hi`, with no command byte | `btnWriteParamClick` (`0x00410B7C`) | disruptive |

**Table lookup.** The command byte is looked up in a 256-byte table (§2): an identity map on
an NJoy32 except in slots 5 to 8, 10, 12 and 13, which no short-command call site uses, so
every code above is the value shown. On other device types the table is all zero and each
table-routed command byte is `0x00`.

### Replies

Acknowledgements start with `5A A5` (`55 A5` for the V20 mask), often followed by an echo of
command and argument: `5A A5 16 05`, `5A 19 …`. The prefix is checked loosely: `Timer8Timer`
accepts byte 1 = `0x5A`, or byte 2 = `0xA5`, or byte 3 = `0x88`; `CMD_Error_STAT` checks all
four bytes (offsets count from the report-ID byte). Reply handling was found at these call
sites only:

- `0x14` and the V20 mask: up to 5 reads, `Sleep(10)` before each. `0x16`: up to 3 reads the
  same way, expecting `5A A5 16 05`. `0x11`: one read after `WaitForSingleObject(0, 0x10)`.
- `0x19` arg `0x30`: `Sleep(600)`, 5 reads 100 ms apart expecting `0x5A`, `0x19` in bytes 1
  and 2; bytes 3 and 4 go to `0x00F0819C` and `0x00F0819D`, and eight 16-byte records from
  byte 5 are shown in `Form30`. Arg `0x20 + N`: `Sleep(10)`, 3 reads 100 ms apart expecting
  `5A 19`.

### Handlers that cannot be reached from the UI

- **Orphans** (no form binding, no code reference): the three `ButtonMAP_AXIS` handlers,
  `btnSetCenterClick`, `btnResetCenterClick`.
- **Dead code:** `Timer18Timer` (`0x0043BBC9`) would send `0x00`, but nothing enables it. In
  `PartialCalibr` the branch at `0x00412F97` would send
  `(value at 0x00F0895E + 0x1B) | (mask << 8)`; it sits inside `if (a3 == 0)` yet tests `a3`,
  so it cannot run.
- **Hidden** (`Visible = False`): `btnParkingClick`, `btn_ED_CFGClick`, `btnSetProfileClick`,
  `btnClearProfileClick`. Whether any code shows them was not determined.

## 2. Long commands *(static)*

Long transfers use `LongRead` (`0x004E5514`) and `LongTransferWrite` (`0x004E525C`); the wire
format is in [`PROTOCOL.md`](PROTOCOL.md). Host side: `LongRead` sends one `SET`, then reads
through `ReadChunk` (`0x004E4E30`), sleeping 4 ms after the request and then the `Read_Delay1`
/ `Read_Delay2` amounts of §7. A first reply frame without `0x5A` at offset 1, or a CRC-16
mismatch, fails the read; the echoed command is not checked. `LongTransferWrite` has no delay
between frames and reads no acknowledgement. `ReadParam` (`0x00411E40`) passes report ID
`0x59` as a literal; `WriteParam`, `ReadCPUID` and the short commands take it from the edit
box (default `89`).

### The command-code table (`0x00F0F748`)

`DevListBoxClick` fills a 256-byte table at `0x00F0F748` for every device with a product
string: slot `i` holds `i` for `i = 0` to `0xFE`, an identity map. For an NJoy32 it then
applies these overrides (slot 10 is first set to `0x01`, then to `0x0B`); for other devices
the table is cleared to zero. The `EEPROM` / `RAM` choice is the combo box `cmbTargetMemory`
(`TMainForm+0x770`, default `EEPROM`).

| Slot | Address | Value | Used for |
|---|---|---|---|
| 5 | `0x00F0F74D` | `0x02` | long read, `EEPROM` target |
| 6 | `0x00F0F74E` | `0x03` | long read, `RAM` target |
| 7 | `0x00F0F74F` | `0x04` | long write, `EEPROM`; the tool adds `0x20`, giving `0x24` |
| 8 | `0x00F0F750` | `0x05` | long write, `RAM`; `0x20` added, giving `0x25` |
| 10 | `0x00F0F752` | `0x0B` | `READ_CPUID` (`ReadCPUID`, `0x00410E90`) |
| 12 | `0x00F0F754` | `0x06` | macros read |
| 13 | `0x00F0F755` | `0x07` | macros write |

### Every long command

Wire byte is `cmd | 0xC0` for reads and `cmd | 0x80` for writes.

| Code | Wire | Dir. | Size | Address | Carries | Processing | Used by |
|---|---|---|---|---|---|---|---|
| `0x0B` | `0xCB` | read | `0x78` | 0 | `READ_CPUID`: token at payload bytes `0x58` to `0x67` | Token unwrapped with RC4. A second RC4 pass over the `0x80`-byte reply buffer, keyed with the token (15 bytes), has no determined purpose | `ReadCPUID`, via `ReadCPUID_N_times` (`0x00410DA8`) |
| `0x02` / `0x03` | `0xC2` / `0xC3` | read | `SIZE_OF_PAR` (§4) | 0 | Parameter block, flash / RAM copy | RC4-decrypt in place, token bytes 0 to 14, unless V20; CRC-32 check on XT2 | `ReadParam`, from `btnReadParamClick` |
| `0x02` | `0xC2` | read | `0xC00` | not determined | V20 only: the profile record, always the `EEPROM` code; skipped when bit `0x10` of the profile value is set | none | `btnReadParamClick` |
| `0x24` / `0x25` | `0xA4` / `0xA5` | write | `SIZE_OF_PAR` | 0 | Parameter block | RC4-encrypt unless V20; status read after 60 ms | `WriteParam` (`0x0041015C`) |
| `0x24` / `0x25` | `0xA4` / `0xA5` | write | `0xC00` | `profile * 0xC00 + SIZE_OF_PAR` | V20 only: the profile record | RC4 only if the encode flag is set, which it is not for V20; status read after 20 ms | `WriteParam` |
| `0x06` | `0xC6` | read | `0x400` | 0 | Macros | RC4-decrypt if the encode flag is set | `btnGetMacrosClick` (`0x0041FEF0`) |
| `0x07` | `0x87` | write | `0x400` | 0 | Macros | RC4-encrypt if the encode flag is set; no status read. The wire byte lacks the `0x20` the block writes carry | `btnSetMacrosClick` (`0x0042011C`) |
| `0x0D` | `0x8D` | write | `0x400` | 0 | The buffer at `0x00F0E5E8`, its first 9 bytes set from three dwords at `0x00DAB6C5`. Purpose not determined | RC4 with the token; no status check | `sButton6Click` (`0x00439624`) |
| `0x19` | `0xD9` | read | `0x50` | 0 | Units configuration: the first `0x48` bytes are 24 records of 3 bytes, stored at `0x00F0A5E8` | none | `sButton11Click` (`0x0043A9C0`), after short `0x0019` and 50 ms |
| `0x28` | `0xA8` | write | `0x10` | 0 | A command record for an external device (below) | none; reply must be `5A A5 88 00` with byte 5 equal to the device index | `btnCommand_Ext_DevClick` (`0x0042A110`) |
| `0x30` | `0xB0` | write, 64 times | `0x800` each | block `0` to `0x3F` | Database image, 128 KiB in all (*inferred*: display data for external devices) | none; `Sleep(10)`, then the status check must return 1, else an "Error" box | `btnWriteDataBaseClick` (`0x0043A080`) |

The `0x28` record is 16 bytes: byte 0 is the external-device slot (`0x00F086A0`); bytes 1 and
2 are a u16 from that slot's record in the block; byte 3 is a sub-command from a combo box,
where sub-command 5 carries the CRC-32 of a `0x400`-byte image and the size `0x400`. This
layout is approximate. The function is the external-device firmware loader ("ExtDev Firmware
Load - Start"). Treat `0x28` (external-device firmware) and `0x30` (flash writes) as
**dangerous**; so is the bootloader tool (`TForm16`, routines `0x00479B08` and `0x00479F04`),
which has its own traffic and CRC-32 checks of firmware images and was not decoded.

## 3. What VKBDevCfg does around a read and a write *(static)*

### Write: `btnWriteParamClick`, then `WriteParam`

`btnWriteParamClick` (`0x00410814`) runs these steps, then calls `WriteParam` (`0x0041015C`).
For a device that is not type 6 it skips them and writes nothing.

1. **Cool-down.** The click is accepted only if `0x00F081A2` ("write allowed", set to 1 for
   every recognised device, so effectively always) is set and the cool-down flag `0x00F08987`
   is clear. That flag is set just before `WriteParam` and cleared by `Timer9Timer`
   (`0x00424FBC`) after 2500 ms; the Write button is disabled meanwhile.
2. **User level.** Bits 5 to 7 of `0x00F086D0` hold a host-side level L (0 to 6), not a device
   property. It is set when `zconfig.ini` is read: 3 by default, 4 if a global string
   (`0x00F089C9`) equals "Developer", 5 or 6 if it equals a literal stored obfuscated; where
   that string comes from was not determined. `DevListBoxClick` raises L to 4 for V20 and XT
   devices.
3. **ForcedWriteID** (`0x00F08988`, `[User] ForcedWriteID`, default 0). L below 4 forces it to
   0 and L above 4 forces it to 1; at L = 4 the ini value stands. If L is below 5 and it is
   set, a Yes/No box later warns that the write mode is forced by the ini file, and anything
   but Yes cancels the write.
4. **Type-id compatibility check.** If `0x00F08194` (block byte 2 of the last block read,
   non-V20) differs from block byte 2 now in memory (`0x00F08DEA`; it may come from a loaded
   `.cfg`) and ForcedWriteID is 0, the write is refused: "Attention! This profile is not
   compatible with the selected device! Operation rejected".
5. **Profile.** The index starts as the current profile (`0x00F0895F`). A modal chooser
   (`Get_ProfileN`) may replace it: on V20 if the device is multi-device (`0x00F0819A`), the
   profile is non-zero or Ctrl is held; on XT2 if the checks so far passed and Ctrl is held.
6. **Select profile.** Short `0x17` with the profile index, then `Sleep(10)`, if the checks so
   far passed or L is 5. With `0x00F081C1` set, L = 5 and Right Shift held, `0xA1` is also
   stored in block byte 3 (V20: byte 9 of the alternate block); *inferred*: a "configured by
   user" flag, since the read side auto-configures when byte 3 is `0xA0`.
7. **PartialWrite.** If the checks passed, PartialWrite is on (`[User] PartialWrite` or the
   `cb_Partial_Write` checkbox) or Alt is held, and the profile is 0, a section chooser
   (`TForm17`) opens; unconfirmed, the write is cancelled. A mask of `0xFFFF` ("everything")
   sends nothing; any other mask goes out as short `0x14` (V20: the `0x55` form) and the tool
   waits up to 5 x 10 ms for the ack. Without one it logs "cmd_Partial_Write Fault", shows
   "Fault partial write command" and cancels the write.
8. **Go.** The cool-down flag is set and `WriteParam` runs. If the write was sent, V20 devices
   at profile 0 are then restarted (`btnResetClick`, short `0x00`); other devices are not
   restarted by the host. The Write button is disabled and `Timer9` started.

Inside `WriteParam`:

1. `RefreshParam` (`0x00711BD4`) copies the UI state into the block. The host does not compute
   the block's CRC-32 word: nothing on the write path calls the CRC-32 routine (`0x004E9468`),
   which the tool uses on the block only when reading, on XT2.
2. Size is `SIZE_OF_PAR`; the command is `0x20` plus `4` (`EEPROM`) or `5` (`RAM`). Unless
   V20, the block is RC4-encrypted (token bytes 0 to 14) and the encode flag is set.
3. `LongTransferWrite` sends the frames; after 60 ms the status routine (`0x0040FDE4`) reads
   the status word. On V20 a second write sends the `0xC00`-byte profile record, then 20 ms
   and another status read.
4. **Status handling.** The status routine returns one byte, zero-extended: **1** for
   `5A A5 88 00` (also if its `GetFeature` fails or the type is not 6), **0** for
   `11 5A A5 11`, **255** for any other word. For an error word it shows a specific message
   ("CRC Error !!!", "Erase FLASH Error !!!", "Write FLASH Error !!!", "Non-compatible profile
   !!!" or "Unknown Error !!!") in the status bar, logs it and dumps the frame. `WriteParam`
   then acts on the return value: **1** gives no dialog and a "Write data - OK" toast (1000
   ms); **0** and **255** both give a "Write data fault" dialog reading "No new data !!!" and
   no OK toast.

   **The error branch can never fire.** `WriteParam` compares the return value with `-1`
   (`0xFFFFFFFF`, asm `0x00410510`), but the routine returns 255, so the test never matches.
   The branch that would flag a fault and skip the profile write is dead: an error word
   produces the same "No new data !!!" dialog as `11 5A A5 11`, and on V20 the second write is
   still attempted. The specific message appears only in the status bar and the log.

### After the write: the 5-second timer

1. `WriteParam` (for type 6, whatever the status was) and `btnResetClick` set a flag
   (`0x00F08967`) and start `Timer11` (`TMainForm+0x634`) with a 5000 ms interval.
2. `Timer11Timer` (`0x0042A60C`) resets the interval to 250 ms and, if a device is selected
   and the flag is set, calls `HidCtlDeviceUnplug` (`0x00414700`). The timer's design-time
   interval is 20 ms and the flag is normally clear, so otherwise this does nothing.
3. `HidCtlDeviceUnplug` clears the current-device pointer, stops the auto-read and status
   timers, resets the controller type to 0, **marks the token invalid** (`0x00F08B5D`) and
   resets the UI. The next enumeration treats the stick as newly plugged in:
   `DevListBoxClick`, `TrueDeviceInit`, `ReadCPUID`, then the auto-read.

So the tool treats the device as unplugged 5 seconds after a write or restart, whether or not
it really re-enumerated, and it does not read the block back right after a write. The restart
is not visible in the host code; it was observed on the test device (box above). *Inferred*:
the grace period is meant for a device that reboots to apply the configuration. If Windows
reports the removal and arrival itself, the same path runs earlier.

### Read: `btnReadParamClick` (`0x0041133C`)

1. With no token, `ReadCPUID_N_times(2)` tries `READ_CPUID` up to twice; failure abandons the
   read ("Error CPUID read"). `ReadParam` itself refuses ("Data Read is prohibited") if the
   encode flag is set and there is no token.
2. The profile starts as the current one (V20 may open the chooser; XT2 may, with Ctrl held,
   when the firmware word is above `0x219E`). Then `Sleep(800)`, short `0x17` with
   `profile & 7`, `Sleep(50)`.
3. Long read `0x02` or `0x03` by target memory, then RC4-decrypt (non-V20). XT2: the STM32
   CRC-32 of block bytes 8 to the end is compared with bytes 4 to 7; a mismatch gives "Profile
   is not verified. Failed" and the read fails. V20: a second read, of the `0xC00`-byte
   profile record.
4. On success the block is copied to the in-memory copies, byte 2 is saved in `0x00F08194`,
   and if the profile was above 0, short `0x0017` selects profile 0 again.

After connecting, `Timer2Timer` (`0x0041F098`) calls `btnReadParamClick` (200 ms sleep,
`EEPROM` target) if "Auto Read Parameters" is set, then may read macros and, if flag
`0x00F089A9` is set, send `CMD_Error_STAT`.

## 4. Device identification and feature flags *(static)*

**Enumeration.** `HidCtlEnumerate` (`0x00414B90`) lists a device only if its vendor ID is
`0x231D` and its product ID is in `0x0100`–`0x013F` or `0x0200`–`0x41FF`, or is a bootloader
PID (`0x0912`, `0x0913`, `0x0915`, `0x0916`) or `0x0000` ("Zero Controller"). `Get_Dev_VIDPID`
(`0x0040EFFC`) returns the vendor ID XOR `0xA5FF` and the product ID XOR `0x5AFF`, which looks
like an obfuscation of the constants (*inferred*). bcdDevice goes to `0x00F08190` (`0x220C` =
2.20.C), the feature-report length to `0x00F0819E`.

**Classification** (`DevListBoxClick`), within the accepted range: keyboard GUID gives type 8,
mouse GUID type 9, no feature reports type `0x0A`; a bootloader PID gets only an icon (type
stays 0); anything else is **type 6, "VKB NJoy32"** and gets the command-table overrides.
Outside the range the bootloader PIDs give type `0x21` ("VKB-Bootloader"; Restart opens
`Form16`) and `0x0000` gives type `0x64` ("Zero Controller"). *Inferred*: the bootloader PIDs
lie inside the first range, so the type `0x21` branch looks unreachable.

**Generation flags**, from USB string `0x0C` (`GetIndexedString`):

| Flag | String `0x0C` | Effect |
|---|---|---|
| V20, `a3` | begins `V20` | `SIZE_OF_PAR` = `0xC00` plus separate `0xC00` profile records; no RC4 of blocks; partial write in the `0x55` form; user level raised to 4 |
| XT, `a4` | otherwise begins `XT` | `SIZE_OF_PAR` = `0x800` unless XT2 |
| XT2, `a5` | begins `XT2` | `SIZE_OF_PAR` = `0x1000`; CRC-32 check on read; Default button takes the mask path |

On the test stick the strings read, by index: 1 `VKB-Sim (C) Alex Oz 2023`; 2 the product
name; 5 `PRO version`; 6 an e-mail address; 7 `T-Link`; 8 `NJoy32 platform NXT`; **12
`XT2`**; 19 `#0101`; 20 `00000180` followed by the product name. The rest are empty,
including the serial number (3). The tool also reads string 10 (profile state: it looks for
`*0`, `*1`, `*2`), 13 (`Multidevice #n/m`), 20–27 (profile names) and 100–199 (button names,
`B#nn name`). ***Verified*** by standard `GET_DESCRIPTOR` requests.

With neither V20 nor XT, `SIZE_OF_PAR` is `0x400`. `GetDeviceProperty` (`0x00504B74`) sets it
(`0x00F08DD4`) and the block-copy pointers. The test device has `a3` = 0, `a4` = 1, `a5` = 1
(`0x1000`), consistent with an `XT2` tag. `0x00F081A2` ("PRO") is always set; `0x00F081BC` is
set if string `0x05` contains `EVALUATE` (the analysis also names string `0x04`); other flags
depend on product-ID ranges and only choose the UI layout.

**Firmware thresholds.** `Check_Dev_Major_Version(v)` (`0x0040F020`) returns `version >= v`.
The bcdDevice word is first normalised: if its top nibble is 1 to 9, major is that nibble and
minor is bits 4 to 11; otherwise major is bits 8 to 11 and minor the low byte; the result is
`major << 8 | minor`. So `0x220C` becomes `0x0220` and `0x0182` stays `0x0182`. The flags
`0x00F081C1` to `0x00F081D8` are that test with `v` = `0x182`, `0x183`, `0x185`, `0x188`,
`0x190`, `0x194`, `0x195`, `0x196`, `0x197`, `0x198`, `0x199`, `0x203`, `0x205`, `0x207`,
`0x208`, `0x209`, `0x210`, `0x211`, `0x212`, `0x213`, `0x214`, `0x215`, `0x216`, `0x217`, in
order. Recorded uses: `0x00F081C1` (`0x182`) gates error statistics, the Right Shift marker
and the `FIND` commands; `0x00F081BF` ("device too old": no `Timer2` auto-read) is set if the
`0x182` test fails, or on V20 if the `0x198` test (`0x00F081CA`) fails. Raw bcdDevice
comparisons also occur: `0x00F081C0` = `0x00F08190 > 0x1986` (V20: `> 0x1988`), `> 0x219E` for
the XT2 chooser, `< 0x2178` for the old external-device query.

## 5. Input reports

Offsets are into the data after the report-ID byte; every report is 63 data bytes. What the
vendor tool does with each is *static* (`HidCtlDeviceData`, `0x0042BBEC`); what the stick
sends was observed and is marked ***verified***.

**Report `0x01`: the joystick, and the stick's view of itself.** Sent about eleven times a
second at rest, and on every change.

| Bytes | Contents | |
|---|---|---|
| `0x00`–`0x0F` | eight 16-bit axes | ***verified*** |
| `0x10`–`0x1F` | 128 button bits | ***verified*** |
| `0x20`, `0x22`, `0x24`, `0x26` | hats 1–4: low nibble 0–7 clockwise from up, 8 = centred. Each is a 16-bit slot; the unused ones read 8 and are declared as padding | ***verified*** with two and four hats enabled |
| `0x28`–`0x2B` | not read by the tool; `0x2A` is `01` at rest | unknown |
| `0x2C` | bit 0 SHIFT1, bit 1 SHIFT2, bits 2–7 SubSHIFT 1–6 | ***verified*** for SHIFT1 and SubSHIFT 1 and 2 |
| `0x2D` | bit 7 SubSHIFT 7; bit 4 drives a bus-status light in the tool | ***verified*** for bit 7 |
| `0x2E` | `0xA5`: the tail is valid | ***verified*** |
| `0x2F`–`0x3E` | 128-bit map of active **physical** lines, bit *i* = line *i* + 1: raw contacts, plus anything injected at that level — axis zones, replica buttons, complementary buttons, Boolean outputs to the physical layer | ***verified*** |

The HID descriptor calls everything from `0x28` on constant padding. The vendor tool uses
the line map for its "Poll" lights on the physical layer and the shift bits for nine small
indicators; its own Test tab reads DirectInput, not these reports.

**Report `0x0C`: the layers after the physical one.** ***Verified***: the stick sends it
whenever one of these maps changes, with no request from the host. Nothing changes at rest,
which is why it had not been seen.

| Bytes | Contents | |
|---|---|---|
| `0x00`–`0x0F` | 128-bit map of **virtual** lines: each line after its physical function | ***verified*** |
| `0x10`–`0x1F` | 128-bit map of **logical** lines | ***verified*** (it matched the virtual map in every test) |
| `0x20`–`0x2F` | four 32-bit words about the Boolean records, bit *k* = record *k*: a flag, then three bit-planes of a 3-bit state | ***verified*** that active records set their bits; the meaning of the three planes is not known |
| `0x30`–`0x31` | four nibbles the tool shows as "MSw" — the modal switches | static |

**Report `0x08`: service data, by subtype in byte 0.**

| Byte 0 | Contents | |
|---|---|---|
| `0x05` | bus statistics: bytes 1–8 = eight sensor error levels; bytes `0x11`–`0x18` = one per external-device slot, 0 = not polled, otherwise error percent + 1 | ***verified***: after short command `0x16` argument 5 the stick sends this about fifteen times a second until it restarts. Slot 0, the grip, read 1: polled, no errors |
| `0x13` | encoder status: byte 1 = a running sequence number, byte 2 = number of encoders, then 16-bit positions ([`PRIOR-ART.md`](PRIOR-ART.md)) | ***verified***: sent about eight times a second while "Virtual BUS over USB" (block `0x013` bit 5) is on; one encoder, position 0 |
| `0x37` | eight signed 14-bit raw sensor positions, used by the tool's detent pages | static; only for throttle families |

**Report `0x0B`.** The tool ignores it. ***Verified***: it appears alongside `0x08`/`0x13`
when Virtual BUS is on, as `05` followed by five bytes, two of which change from report to
report. Not decoded.

**Reports `0x09` and `0x12`** are not in the descriptor by default. Turning the virtual
keyboard on (block `0x00B` bit 2) adds `0x09` — a modifier byte and sixteen key codes — and
turning Multimedia on (`0x017` bit 1) adds `0x12`, one 16-bit consumer usage. Neither was
ever seen being sent.

The tool's raw-report analyser is a developer feature (ID filter, offset, size, up to 12
user-defined fields). `Poll_Start` (`0x004246FC`) and `Poll_Stop` only flip host flags:
nothing is sent to the stick to start any of these reports.

## 6. LED test packet and other transports *(static)*

**LED test packet.** `Test_Leds_Packet_Setup` (`0x00423954`, body `0x0042395A`) builds the
`A5 0A` feature report without the `ShortCMD` builder. It is called by `btn_Set_LedsClick`
(`0x00423A98`) and `LED_Fast_Test` (`0x004298BC`) and sent with `SetFeature`, without RC4.
Offsets from the report-ID byte: 1 = `0xA5`, 2 = `0x0A`, 3 to 4 = CRC-16/MODBUS (LE), 5 to 6 =
two random bytes (`rand() % 255`), 7 = N (number of entries, at most 30), 8 on = N entries of 4
bytes, `{LED index & 0x7F, three more bytes}`. The three bytes are a 24-bit little-endian word
in the format of a stored LED event: two colours of three 3-bit channels, then a 3-bit mode
(off, constant, slow, fast, ultra-fast) and a 3-bit colour mode. No token is involved. The
override lasts until the stick restarts. The CRC covers `3N + 3` bytes from offset 5 while the
entries are 4 bytes each; both figures are as read from the code. VKB's own description is in
[`PRIOR-ART.md`](PRIOR-ART.md). `btn_Set_LedsClick` builds up to 12 entries from the LED sheet
controls, `LED_Fast_Test` one. Classified benign: a temporary LED override.

**Output report `0x58`: no sender found.** The only caller of `TJvHidDevice.WriteFile` is
`WriteBtnClick` (`0x00413F04`), in the hidden `GroupBoxSYS` (`Visible = False`); it sends
bytes typed into edit boxes, the first being the report ID from `TMainForm+0x3C0`. It looks
like a leftover from the JVCL demo code (*inferred*). All configuration traffic is feature
report `0x59`.

**Other raw senders.** `btnGetFeatureClick` (`0x0041EDBC`) does a raw `GetFeature` and hex
dump; `btnUSART_TESTClick` (`0x00424734`) clears the frame (report ID 0) and does a bare
`GetFeature` (*inferred*: legacy, non-functional with numbered reports); `btn_MaRS_TestClick`
(`0x00424C60`) toggles error statistics via `CMD_Error_STAT` (`0x0516`).

## 7. `zconfig.ini` options that affect the transport *(static)*

Read by the function at `0x00406EA4`; defaults were taken from the disassembly.

| Section / key | Stored in | Default | Effect |
|---|---|---|---|
| `[Misc] Read_Delay1` | `0x00F086CD` | 0 | Milliseconds slept before every `ReadChunk` |
| `[Misc] Read_Delay2` | `0x00F086CE` | 0 | Milliseconds slept after every received frame |
| `[User] ForcedWriteID` | `0x00F08988` | 0 | Skips the type-id check; below level 5 also shows a confirmation box. Honoured only at user level 4 (§3) |
| `[User] PartialWrite` | `0x00F08989` | 0 | Opens the partial-write chooser on every Write (also the UI checkbox) |
| `[User] PartialWriteMask` | `0x00F086E3` | `FF` | Initial 8-bit mask for short `0x14` |
| `[User] PartialWriteMaskNG` | `0x00F086E4` | `FFFF` | Initial 16-bit mask for V20 |
| `[User] PartialCalibration`, `PartialCalibrationMask` | `0x00F0898A`, `0x00F086E6` | 0, `FF` | Partial-calibration axis dialog |
| `[Common] Set After Load` | `0x00F0898D` | | After a `.cfg` loads, sleeps 300 ms and runs `btnWriteParamClick` (`LoadParamExecute`, `0x004139DD`–`0x004139E8`) |
| `[Common] Auto Read Parameters`, `Auto Read Macro` | checkboxes | | `Timer2Timer` reads the block (and macros) after connecting |
| `[User] AutoTestLeds`, `…Mode`, `…Color` | bits of `0x00F086D0` | mode 3, colour 2 | LED test defaults |
| `[Common] Autoconnect`, `Reconnect` | `0x00F0899F`, `0x00F089A0` | | Automatic selection and re-selection of the device |
| `[Common] Internal Bootloader` | | | Built-in bootloader dialog (`Form16`) or an external tool |

`PartialWrite`, `PartialWriteMask`, `PartialCalibration` and `PartialCalibrationMask` also
exist as older duplicates under `[Common]`. Other delays are fixed in the code and listed in
§2 and §3. With both read delays at 0 the tool only yields between frames; *inferred*: the HID
stack paces the transfer.

## 8. Not determined

- The effect of every short command, and the device's reply to those whose reply handling is
  not listed in §1; none was sent.
- What the argument bits mean for defaults (`0x01`), partial write (`0x14`, V20 16-bit form)
  and partial calibration (`0x15`, including `0xFF` "skip"); the mask dialogs (`TForm17`,
  `TForm18`) were not decoded.
- Whether `0x17` with `0xA0 | profile` persists the choice, and whether `0x01` with
  `1 << profile` clears one profile (both *inferred*); the meaning of `0x18` ("parking") and
  of `0x19` argument `0x21`.
- The purpose of long command `0x0D`, the exact layout of the `0x28` record, what the `0x30`
  database holds, and the protocol of the bootloader tool.
- The payload of input report `0x08` with `data[0] = 0x37`, and the use of the nibbles kept
  from report `0x0C`. The address of the V20 profile-record read (the write address is
  `profile * 0xC00 + SIZE_OF_PAR`), and why `ReadCPUID` runs a second RC4 pass over the reply
  buffer.
- What `0x00F081DE` (set to `0x67` beside the command table, `0x74` under a feature bit in
  `btnReadParamClick`) and `0x00F089A9` are, and where the string `0x00F089C9` that sets the
  user level comes from.
- Whether any code shows the hidden buttons, and whether the type `0x21` bootloader branch can
  run.
- Which USB string carries `EVALUATE` (the analysis names `0x05` in one place, `0x04` or
  `0x05` in another), and whether `0x00F0819A` is a device count or an index (the analysis
  calls it both; short `0x04` sends it as its argument).
