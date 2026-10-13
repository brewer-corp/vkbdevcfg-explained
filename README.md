# VKBDevCfg Explained

Documentation and reverse-engineering notes for **VKBDevCfg**, VKB's joystick
configuration utility — a genuinely capable program shipped behind a genuinely
opaque interface.

Two questions started this: *what does the thing actually do*, and *could we put
a better interface on top of it*. This repository holds what we found.

> **Status.** The first question is answered and published in [`site/`](site/).
> The second now has a concrete answer too: **yes, and without VKBDevCfg.** The
> USB protocol and the profile file format are both solved, and a stick's
> configuration has been read, changed and restored from Linux with the tools
> here. What remains is mapping the meaning of the configuration's fields,
> which is partly done. Start with [`docs/FINDINGS.md`](docs/FINDINGS.md).

---

## The short version

VKBDevCfg configures VKB flight-sim hardware: it remaps buttons and axes, drives
LEDs, defines macros, calibrates, and flashes firmware. It is the only tool VKB
ships for any of that.

It is also the tool whose one idea — **physical inputs versus logical inputs** —
is never stated anywhere in its own documentation. That single omission accounts
for most of the confusion. The site here fixes it.

Underneath the interface the design is simple. **The stick is a real-time
signal processor, and its entire configuration is one 4096-byte block in
flash.** The PC tool reads that block, lets you edit it, and writes it back.
Everything else — the encryption, the file format, the sixty-nine forms — is
packaging around those 4096 bytes.

So the seam for a better UI is not the vendor program. It is the block.

---

## What's here

| Path | What it is |
|---|---|
| [`site/`](site/) | The website: `index.html` is the reverse-engineering debrief, `guide.html` the plain-language guide to the vendor tool. Static, no build step. `.github/workflows/pages.yml` publishes this directory once GitHub Pages is enabled. |
| [`docs/FINDINGS.md`](docs/FINDINGS.md) | Every technical finding, split into observed vs inferred. **Start here.** |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md) | The USB/HID configuration protocol: framing, handshake, read, write. Verified on hardware. |
| [`docs/CFG-FILE-FORMAT.md`](docs/CFG-FILE-FORMAT.md) | The `.cfg` profile format and its cipher. Verified on real profiles. |
| [`docs/PARAMETER-BLOCK.md`](docs/PARAMETER-BLOCK.md) | What the 4096 bytes mean, as far as that is known. From static analysis. |
| [`docs/COMMANDS.md`](docs/COMMANDS.md) | Every other command the tool can send — reset, defaults, calibration, bootloader. From static analysis; none was sent. |
| [`docs/PRIOR-ART.md`](docs/PRIOR-ART.md) | What was already public (LED control, mostly). |
| [`docs/ENCRYPTION-ANALYSIS.md`](docs/ENCRYPTION-ANALYSIS.md) | What the three RC4 layers are for, and where the earlier assessment went wrong. |
| [`docs/WINDOWS-EXPERIMENTS.md`](docs/WINDOWS-EXPERIMENTS.md) | What a Windows machine with VKBDevCfg is still useful for. |
| [`docs/MANUAL-DIGEST.md`](docs/MANUAL-DIGEST.md) | Digest of VKB's official NJoy32 User Guide v2.19. |
| [`tools/`](tools/) | The device and profile tools, and the analysis scripts. |
| [`data/forms/`](data/forms/) | Index of all 69 UI forms decoded from the application binary. |

### Running the site

```bash
cd site && python3 -m http.server 8899
# http://127.0.0.1:8899/
```

### Reading a stick

```bash
sudo python3 tools/vkb_hid.py info      # firmware, type id, CRC check — read-only
sudo python3 tools/vkb_hid.py read      # -> vkb_feature_block.bin
python3 tools/vkb_cfg.py encrypt vkb_feature_block.bin backup.cfg
```

Writing is `vkb_hid.py write`, which is a dry run unless given `--yes`. Read
[`tools/README.md`](tools/README.md) first: it has been verified on exactly one
device and firmware version.

---

## Headline findings

**The application.** C++Builder on the Delphi VCL, 32-bit x86, 23 MB, single
`.exe`. AlphaSkins for UI, FastReport for PDF export, DirectInput 8 for
enumeration, the Win32 HID class driver for device I/O.

**It is full of names.** Every form class carries run-time type information
mapping handler names to code addresses. `tools/rtti.py` recovers 1,277 named
methods — `btnReadParamClick`, `btnWriteParamClick`, `ReadCPUID`,
`btnSaveParamClick` — which is what turned a 23 MB binary into something that
could be followed.

**The UI, fully recovered.** All 69 embedded form definitions decode cleanly
(`tools/dfm.py`). This surfaced a long list of features the source material
never mentions — Visual Diagram, Curve Wizard, MobiFlight JSON export,
Comparators, Detents, a functional generator, scriptable tests.

**The device.** `231d:0200`, one HID interface, one interrupt IN endpoint, no
OUT endpoint. All configuration travels over **one feature report, `0x59`**, in
both directions.

**The protocol.** Frames headed `A5 command size address crc16`. A handshake
returns the microcontroller's unique ID; that ID is the RC4 key for the
configuration in transit. Reading is one request and 33 replies. Writing is 33
frames and a status word, after which the stick restarts.

**The `.cfg` files.** RC4 under a key compiled into VKBDevCfg, mixed with the
file's own CRC. **Not tied to any device.** They can be decrypted, compared and
created offline.

**Verified on hardware.** A Gladiator EVO R's configuration was read from
Linux, written back unchanged, changed by one setting, and restored to a state
byte-identical to the original.

---

## Method

- **The guide** — built from the source video (credited below), reorganised
  around the model the video describes but never names.
- **Binary analysis** — a PE resource walker, a binary-DFM decoder and an RTTI
  reader, all written from scratch (`tools/peutil.py`, `tools/dfm.py`,
  `tools/rtti.py`).
- **Decompilation** — headless Ghidra 12.1.4, driven by the scripts in
  `tools/ghidra-scripts/`: apply the recovered names, correct the calling
  conventions, decompile the application's 2,061 functions to one file each.
  Where the decompiler gave up, assembly.
- **Device** — every protocol claim marked *verified* was made on the wire from
  Linux, through `hidraw`. Writes came last, after the read path had proved the
  framing, the cipher and both checksums, and after a backup. The first write
  sent the device its own bytes.
- **Profiles** — the cipher was confirmed by decrypting two real profiles and
  re-encrypting them to the identical bytes.

Several conclusions were **overturned by evidence** during this work. They are
recorded rather than quietly fixed:

1. *"The tool imports no cryptographic functions, so it cannot be encrypting."*
   A hand-rolled RC4 is ~190 bytes and leaves no trace in an import table.
2. *"Feature reports are blocked by the Linux kernel; this needs Windows."* The
   request was malformed. See [`tools/superseded/`](tools/superseded/README.md).
3. *"The `.cfg` key is derived at runtime from device state, and profiles may be
   locked to their device."* That buffer is the USB transport key. The file key
   is a constant. See [`docs/ENCRYPTION-ANALYSIS.md`](docs/ENCRYPTION-ANALYSIS.md).
4. *"Report `0x58` is Set and `0x59` is Get."* Both are `0x59`.
5. *"The `.cfg` route is closed, so the clipboard is the best remaining seam."*
   The `.cfg` route is open, and so is the direct one.

The pattern in 1–3 is the same each time: absence of the obvious evidence was
read as evidence of absence.

---

## Credits and provenance

- **The source material is [“VKBDevCfg Basics” by DCS Tutorial](https://www.youtube.com/watch?v=KkrukbU1-rE)**
  (27 June 2022). The explainer site is built from that walkthrough, which is
  credited throughout, in the site header, and in the site footer.
- The configuration model comes from VKB's official **NJoy32 Configuration
  Utility User Guide v2.19** (August 2023), linked from
  <https://vkbsimcontrollers.com/pages/downloads>.
- All analysis was performed on software obtained from VKB's public downloads
  page, and on a VKBsim Gladiator EVO R owned by the project.

**This repository contains no VKB binaries, firmware images, or copyrighted
documentation.** Those were analysed locally and deliberately not redistributed.
It also contains no dump of any device's configuration and no device serial
number. It does contain two short constants from the vendor binary, without
which neither the protocol nor the file format can be described.

VKB and VKBsim are trademarks of their respective owners. This is an independent,
unaffiliated documentation and interoperability project, for configuring
hardware you own.

## Licence

[MIT](LICENSE). The tools here can rewrite a device's configuration; they come
with no warranty, and what you do to your own hardware is on you.
