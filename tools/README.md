# Tools

Python 3.8+, standard library only. Nothing here needs a third-party package.

One tool can change a device: **`vkb_hid.py write --yes`**. Everything else
only reads — files, the binary, or the stick.

| Want to… | Use |
|---|---|
| Read a stick's configuration | `vkb_hid.py read` |
| Write a configuration to a stick | `vkb_hid.py write` |
| Decrypt, create or compare `.cfg` profiles | `vkb_cfg.py` |
| Name the functions in the vendor binary | `rtti.py`, `ghidra-scripts/` |
| Decode the vendor UI's forms | `dfm.py`, `extract_forms.py` |

Several scripts analyse `VKBDevCfg-C.exe`. It is **not** in this repository.
Download it from <https://vkbsimcontrollers.com/pages/downloads>:

```bash
mkdir -p VKBDevCfg
unzip VKBDevCfg-C_v0.93.89.zip -d VKBDevCfg
```

---

## Talking to the device

### `vkb_hid.py` — read and write the configuration (Linux)

```bash
sudo python3 vkb_hid.py info                 # firmware, type id, CRC check
sudo python3 vkb_hid.py read                 # -> vkb_feature_block.bin
sudo python3 vkb_hid.py read --ram           # the RAM copy instead of flash
sudo python3 vkb_hid.py write new.bin        # dry run: what would change
sudo python3 vkb_hid.py write new.bin --yes  # write, wait for restart, verify
sudo python3 vkb_hid.py write profile.cfg --yes
```

The protocol is in [`../docs/PROTOCOL.md`](../docs/PROTOCOL.md). `read` and
`info` send only read requests. `write`:

- shows a diff against the stick's current block and stops, unless `--yes`;
- refuses a block of the wrong size, type id or firmware version;
- saves the current block to `vkb_feature_backup_<time>.bin` first;
- checks the device's status word, waits for the stick to restart, reads the
  block back and compares.

It sends no short commands, so it cannot reset a stick to defaults, start a
calibration or enter the bootloader.

Needs read/write access to the hidraw node: run as root, or add a udev rule
such as `SUBSYSTEM=="hidraw", ATTRS{idVendor}=="231d", TAG+="uaccess"`.

**Verified on one device** — a Gladiator EVO R at firmware 2.20.C. Start with
`info` on anything else.

### `vkb_cfg.py` — `.cfg` profiles, offline

```bash
python3 vkb_cfg.py info    profile.cfg
python3 vkb_cfg.py decrypt profile.cfg block.bin
python3 vkb_cfg.py encrypt block.bin   profile.cfg
python3 vkb_cfg.py diff    a.cfg b.cfg
```

Works on any OS; no device and no captured key required. The format is in
[`../docs/CFG-FILE-FORMAT.md`](../docs/CFG-FILE-FORMAT.md). `diff` accepts
profiles or plaintext blocks on either side, which makes it the tool for
mapping settings: save, change one thing, save, diff.

### `vkblib.py` — the shared pieces

RC4, CRC-16/MODBUS, the STM32 CRC-32 and the `.cfg` container, as pure
functions. Import this from anything that needs to handle a block.
`python3 vkblib.py` runs a self-test against published check values; it needs
no device and no vendor file.

### `capture.py` — live input capture

```bash
sudo python3 capture.py /dev/hidraw0 3
```

Opens `O_RDONLY`, issues no control transfers, prints a report-ID histogram and
decodes report `0x01`.

### `hidparse.py` / `reportmap.py` — report descriptor

```bash
sudo cat /sys/kernel/debug/hid/0003:231D:0200.*/rdesc > rdesc.txt
python3 reportmap.py rdesc.txt
```

`reportmap.py` parses the kernel's *annotated* dump, which is more reliable than
re-decoding the hex.

---

## Analysing the binary

### `rtti.py` — recover class and method names

```bash
python3 rtti.py VKBDevCfg/VKBDevCfg-C.exe rtti.json symbols.tsv
```

VCL classes carry published-method tables: handler name → code address. This
reads them straight from the PE and yields 1,667 classes and 1,277 named
methods, including every event handler of the main form. `symbols.tsv` feeds
`ghidra-scripts/ApplyNames.java`.

This is the single most useful step in the whole analysis. With it,
`FUN_0041133c` is `TMainForm::btnReadParamClick`.

### `ghidra-scripts/` — headless Ghidra

Plain `GhidraScript` subclasses, used with Ghidra 12.1.4 and Java 21.

```bash
G=ghidra/support/analyzeHeadless

# once: import and analyse (about six minutes)
$G ~/ghidra_proj VKB -import VKBDevCfg/VKBDevCfg-C.exe -analysisTimeoutPerFile 3000

# name the functions, then fix the calling conventions
$G ~/ghidra_proj VKB -process VKBDevCfg-C.exe -noanalysis \
    -scriptPath tools/ghidra-scripts -postScript ApplyNames.java symbols.tsv
$G ~/ghidra_proj VKB -process VKBDevCfg-C.exe -noanalysis \
    -scriptPath tools/ghidra-scripts -postScript FixConv.java

# decompile the application's own code, one file per function
$G ~/ghidra_proj VKB -process VKBDevCfg-C.exe -noanalysis -readOnly \
    -scriptPath tools/ghidra-scripts -postScript DumpAll.java out/ 00401000 0076a000
```

| Script | Purpose |
|---|---|
| `ApplyNames.java` | Applies `symbols.tsv`: creates functions, names them, labels VMTs. |
| `FixConv.java` | Marks functions as `__cdecl` when their callers clean up the stack. **Do not skip this.** The application is C++Builder; Ghidra's Borland profile assumes the register convention, and without this step the decompiler shows calls with their stack arguments missing. |
| `DumpAll.java` | Parallel-decompiles every function in an address range to `<addr>_<name>.c`, each prefixed with its callers, callees and the string literals it references. |
| `DecompAt.java` | Decompile one function, optionally following callees. |
| `CallSite.java` | Instructions preceding a call, to read arguments. |
| `KeyRefs.java` | All references to an address, in context. |
| `Callers.java` | Callers of a function. |
| `CfgSaveLoad.java`, `SavePathCipher.java`, `FindCipher.java`, `XorContext.java` | The original hunt for the cipher: anchor on the `"Config files\|*.cfg"` string, walk the save path, flag XOR-in-a-loop shapes. Superseded as a method by `rtti.py`, but they are how RC4 was first found. |

Two practical warnings:

- **Eighteen functions will not decompile** — they time out or grow past
  several gigabytes. Most are giant `switch` statements over control IDs. Read
  those as assembly.
- If a headless run is interrupted, **check for orphaned `decompile`
  processes**. They keep running, and a few of them will exhaust a 12 GB
  machine.

### `dfm.py` — binary DFM decoder

Decodes the `TPF0` form streams in the resource section. Three things that are
easy to get wrong, each of which produces plausible-looking garbage rather than
an error:

- `TValueType` ordinals: `vaInt8=2`, `vaInt16=3`, `vaString=6`, `vaIdent=7`,
  `vaSet=11`, `vaCollection=14`.
- `vaList` is a sequence of typed values terminated by a **zero type byte**.
- `vaCollection` items start with a **flag byte** — bit 0 = has properties,
  bit 1 = has children — and the collection ends with a zero flag byte.

### `peutil.py`, `extract_forms.py` — dump every form

```bash
python3 extract_forms.py
```

Walks the resource tree and writes one readable text file per form, plus
`_index.tsv` / `_index.json`.

### `imports.py` — full import table

```bash
python3 imports.py VKBDevCfg/VKBDevCfg-C.exe
```

Every import from every DLL. It shows the application imports no cryptographic
API — which says nothing about whether it encrypts. The RC4 is ~190 bytes of
inline code.

### `strings.py` — filtered string dump

```bash
python3 strings.py VKBDevCfg/VKBDevCfg-C.exe
```

ASCII and UTF-16 strings, with embedded Photoshop XMP and FastReport XML blobs
filtered out.

---

## Windows helpers

### `VkbConfigDump.cs`, `vkb_feature_read.py`

Call `HidD_GetFeature` on report `0x59` and print what comes back. They predate
the protocol work and issue a **bare** read, which an idle device answers with
zeros. They confirm the report exists and nothing more; a Windows port of
`vkb_hid.py` would need `HidD_SetFeature` as well.

### `ClipboardDump.cs`

Enumerates every clipboard format with hex and entropy. Written for the
**Copy cell** experiment, which was never needed.

---

## `superseded/`

Seven scripts built on two conclusions that turned out to be wrong, kept with
an explanation of why each fails. See
[`superseded/README.md`](superseded/README.md).
