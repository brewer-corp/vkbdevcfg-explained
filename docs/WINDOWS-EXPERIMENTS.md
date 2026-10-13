# Windows experiments

This file used to be a plan: five experiments, all needing a Windows machine,
to close the questions static analysis had left open. **None of them turned out
to need Windows, and all but one are answered.** What follows is the record of
that, and then the short list of things a Windows machine with VKBDevCfg is
still genuinely useful for.

Background: [`FINDINGS.md`](FINDINGS.md).

---

## What happened to the original plan

| # | Experiment | Asked | Outcome |
|---|---|---|---|
| 5 | Read the RC4 key out of the running process | What is the `.cfg` key? | **Not needed.** The buffer at `0x00F08B5E` is the USB transport key, not the file key, and it is obtainable from the device directly ([`PROTOCOL.md`](PROTOCOL.md) §3). The file key is a constant in the executable ([`CFG-FILE-FORMAT.md`](CFG-FILE-FORMAT.md)). |
| 1 | Save the same profile twice | Is there per-save randomisation? | **Answered: no.** The file's CRC is mixed into its key, so one changed byte changes every ciphertext byte. Identical content gives an identical file. |
| 3 | Read feature report `0x59` | What does the device hold? | **Answered, from Linux.** A 4096-byte parameter block; `tools/vkb_hid.py read`. A bare `GET_REPORT` returns zeros — the device has to be asked first, which is why the earlier attempts saw nothing. |
| 4 | Single-setting diff | What does one setting change? | **Now possible offline:** `tools/vkb_cfg.py diff a.cfg b.cfg`. |
| 2 | Dump the **Copy cell** clipboard | Is the clipboard a plaintext seam? | **Never run, and no longer needed.** It was the fallback in case the file and the wire both stayed opaque. |

The plan also carried two warnings that should be read as superseded:

- *"Anything writing device configuration … is unexplored and a mistake there
  is unrecoverable without reflashing."* The write path is now understood and
  was exercised: a whole-block write, a one-setting change, and a restore. It
  goes through feature report `0x59`, not output report `0x58`.
- *"Wine does not implement the HID feature-report path."* Not established, and
  others report VKBDevCfg reading a configuration under Wine with hidraw access
  ([`PRIOR-ART.md`](PRIOR-ART.md)).

`tools/rc4key.ps1` still does what it says — it reads 16 bytes from the running
process — but what it captures is the transport token, which
`vkb_hid.py info --show-token` prints without a debugger.

---

## What VKBDevCfg is still good for

The vendor tool is now the fastest way to **map and check the parameter
block**, because it is the one program that knows what every byte means.

### A. Map a setting — no hardware risk

The basic loop needs no writes to the stick beyond what you would do anyway:

1. In VKBDevCfg: **Get**, then **Save** → `before.cfg`.
2. Change exactly one setting in the UI. **Save** → `after.cfg`. (No **Set**
   needed — Save writes what is on screen.)
3. On any machine:

   ```
   python3 tools/vkb_cfg.py diff before.cfg after.cfg
   ```

The output is the offset and the bytes that setting controls. Repeat per
setting. Each result either confirms a row of
[`PARAMETER-BLOCK.md`](PARAMETER-BLOCK.md) or corrects it — and that table is
built from static analysis, so every row is worth checking.

Settings worth doing first, because a UI needs them and the static map is least
certain about them: a button's physical function and its parameters; a logical
button assignment; a shift layer; an LED event; an axis curve.

### B. Confirm an authored profile loads

`vkb_cfg.py encrypt` reproduces the two sample profiles byte for byte, so its
output *should* be indistinguishable from a file VKBDevCfg saved. It has not
been loaded into VKBDevCfg.

1. `sudo python3 tools/vkb_hid.py read` on the Linux side.
2. `python3 tools/vkb_cfg.py encrypt vkb_feature_block.bin mine.cfg`.
3. In VKBDevCfg, with the same stick selected: **Load** `mine.cfg`.

Expected: it loads without a CRC error, and the UI shows the stick's current
configuration. Do not press **Set** unless you mean to.

### C. Cross-check the protocol against a second observer

Capture USB traffic (USBPcap / Wireshark) while pressing **Get** and then
**Set** in VKBDevCfg, and compare with `vkb_hid.py --trace`. Two things static
analysis predicts and this would confirm:

- VKBDevCfg sends a short command, `59 A5 5A 17 00 …` ("select profile"),
  before reading and before writing. `vkb_hid.py` does not, and the device did
  not need it.
- After the first read, VKBDevCfg's short commands are RC4-obfuscated beyond
  the fourth byte.

### D. Another device or firmware

Everything here was verified on one Gladiator EVO R at firmware 2.20.C. On
anything else, start with `vkb_hid.py info` — a read cannot change the device —
and check that the block CRC verifies before trusting any of it.

---

## Safety

A and B never write to the stick. C is the vendor tool doing what it always
does. D starts read-only.

A `.cfg` is not obviously sensitive, but it is a verbatim copy of a device's
configuration, calibration included. `.gitignore` excludes `*.cfg` and block
dumps for that reason.
