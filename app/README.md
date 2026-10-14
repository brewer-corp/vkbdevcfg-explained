# VKB Config

A browser-based configuration tool for VKB NJoy32 sticks. It reads the stick's
4096-byte parameter block over WebHID, shows it as axes, buttons and LEDs, and
writes it back. No install and no vendor software.

Live: <https://spadaval.github.io/vkbdevcfg-explained/app/>

```bash
npm install
npm run dev        # http://localhost:5173 — "Try the demo" needs no stick
npm test
npm run build
```

Needs Chrome or Edge (WebHID). On Linux the browser also needs access to the
device node:

```
# /etc/udev/rules.d/70-vkb.rules
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="231d", MODE="0660", GROUP="plugdev", TAG+="uaccess"
```

## The chart

The first screen is a picture of the stick with a box for every control and a row for every
switch in it, laid out like the fill-in charts pilots already use. Each row says what that
switch sends. Press a control and its row lights, whatever it is mapped to; click a row to
change it. There is a row for each axis too, with its live value, deadzones and curve.

- **One stick at a time**, and the picture follows it: left or right hand from the grip type in
  the configuration, standard or Omni from the USB product ID. `?look=left-omni` (or
  `right-standard`, and so on) forces a variant.
- **Layers.** Any button can be made the SHIFT1 or SHIFT2 key. The layer switch above the chart
  then shows what every other control sends while it is held, and a control can be given its own
  output there. The stick does that through a spare line; the chart picks one and never shows it.
- **What it does not edit yet:** hats, keys and the rarer functions (they are shown, and edited
  on the table tabs), LEDs, calibration.
- **Applying** is a bar along the bottom and a drawer: the list of changed bytes, the write, the
  check, and profiles.

The chart exists for a Gladiator EVO with an SCG grip. Other hardware gets the tables.

The drawings are made by program from photographs: `dev/photo-to-lines.mjs` finds the stick's
silhouette, runs edge detection inside it and follows the edges into vector paths
(`src/ui/stickart.paths.ts`). The two in the app come from product photographs, an upright
right-hand stick and a left-hand one on an Omni adapter; the photographs themselves are not in
the repository, and the other two sticks are mirror images. Where each control sits on a drawing
was measured on the same photograph (`src/ui/StickArt.tsx`). A photo of your own stick against a
plain background goes through the same script.

**After a write the browser asks for the stick again.** A write restarts the stick, which to the
browser is an unplug. Chrome keeps a site's permission across an unplug only for devices that
report a USB serial number, and these sticks report none. So the tool waits a few seconds, and
if the stick is not offered back it shows a **Pick the stick again** button; the write has
already happened by then, and picking the stick lets the tool read it back and check.

**Checking that a write lasted.** Every write is read back after the stick has restarted, so what
is compared is what the stick loaded from its own storage. **Check the stick now**, on the Review
tab, repeats that read at any time — after unplugging the stick, say, or after another program
has been at it — and lists any bytes that differ from what the page last read or wrote. If a
write is accepted but the read-back never happens (the tab was closed, the stick was not picked
again), the page remembers what it wrote and says, the next time a stick is connected, whether
that stick holds it.

**A profile from another stick gets a warning.** A `.cfg` records neither a name nor a serial
number, and sticks of one family share a type id, so the left stick's profile loads onto the
right stick without complaint. Two things in it do belong to one stick: the calibration, and the
grip it is set up for. When a loaded profile differs from the connected stick in either, the
Review tab says so and will not write until that is acknowledged. File names of saved profiles
carry the stick's name for the same reason.

**A stale connection never answers.** After a stick has restarted or been replugged, Chrome
leaves calls on the old device object pending for ever — they neither resolve nor reject. Every
call to the stick therefore has a time limit, after which the tool looks for the stick again.

## How it is put together

| Path | What |
|---|---|
| `src/core/bytes.ts` | RC4, CRC-16/MODBUS, the STM32 CRC-32 |
| `src/core/block.ts` | The parameter block, the `.cfg` container, diffing, the checks made before a write |
| `src/core/protocol.ts` | The protocol over feature report `0x59`, against a two-method `Transport` |
| `src/core/webhid.ts` | The WebHID transport — the only file that touches the browser's device API |
| `src/core/mock.ts` | An in-memory stick that speaks the real protocol, quirks included. Tests and demo mode |
| `src/core/schema.ts` | What the bytes mean, with a confidence for each field |
| `src/session.ts` | Connect, read, and the guarded write: check, write, wait for the restart, read back |
| `src/ui/` | The screens |
| `dev/hw-test.html` | Developer tool: a change-verify-restore round trip on a real stick |

The core has no UI or browser dependencies apart from `webhid.ts`. A desktop
build needs only another `Transport`.

## Safety model

The stick checks that a transfer arrived intact and nothing else: it accepted a
block carrying the wrong model ID. So the checks are here.

- Reading never changes the stick.
- Nothing is sent while editing. One explicit write, after a byte-level review.
- A backup `.cfg` is downloaded before every write.
- A block for another model or firmware is refused.
- After the stick restarts, the block is read back and compared.
- Fields are editable only if marked `verified` in the schema — changed on a
  real stick, with the predicted effect observed. Everything else is locked unless **Experimental
  fields** is switched on.

Used on two sticks so far, a Gladiator EVO R and a Gladiator Omni L, both on firmware 2.20.C. See
[`../docs/PROTOCOL.md`](../docs/PROTOCOL.md).
