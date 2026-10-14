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

Needs Chrome or a browser built on it: Edge, Opera, Vivaldi, Brave (WebHID; not on Android or iOS).
The first screen says so when it can tell the browser is something else. On Linux the browser also
needs access to the device node:

```
# /etc/udev/rules.d/70-vkb.rules
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="231d", MODE="0660", GROUP="plugdev", TAG+="uaccess"
```

## The chart

The first screen is a picture of the stick with a box for every control and a row for every
switch in it, laid out like the fill-in charts pilots already use. Each row says what that
switch sends. Press a control and its row lights, whatever it is mapped to; click a row to
change it. There is a row for each axis too, with its live value, deadzones and curve.

- **One stick at a time**, and the picture follows it, with a drawing of its own for each of the
  four: left or right hand from the grip type in the configuration, standard or Omni from the USB
  product ID. `?look=left-omni` (or
  `right-standard`, and so on) forces a variant.
- **Layers.** Any button can be made the SHIFT1 or SHIFT2 key. The layer switch above the chart
  then shows what every other control sends while it is held, and a control can be given its own
  output there. The stick does that through a spare line; the chart picks one and never shows it.
- **The mini-stick.** From the factory its click switches it between a hat and two axes. Its push
  row offers the other arrangements: always a hat, or always axes, with the click freed to be a
  button or a shift key. VKB's tables also give A1 a push on line 34 and directions on 17–20; those
  are a plain hat's, which a mini-stick grip does not have, so the chart leaves them out.
- **One choice per control:** "This button should be" a button (with its number), the SHIFT1 or
  SHIFT2 key, or nothing; on a shift layer, the same as normal, a button, or nothing.
- **What it does not edit yet:** hats, keys and the rarer functions (they are shown, and edited
  on the table tabs), LEDs, calibration.
- **Applying** is a bar along the bottom and a drawer: the list of changed bytes, the write, the
  check, and profiles. The bar also says what is connected; the site's own navigation has the top.

The chart exists for a Gladiator EVO with an SCG grip. Other hardware gets the tables.

The drawings are made by program from the photographs on VKB's own fill-in charts, one for each
of the four sticks. `dev/photo-to-lines.mjs` finds the stick's silhouette, runs edge detection
inside it and follows the edges into vector paths. `dev/chart-spots.mjs` reads where each control
is from the same chart: the end of the leader line that points at it. Both results are in
`src/ui/stickart.paths.ts`; the charts and photographs themselves are not in the repository. A
photo of any other stick against a plain background goes through the first script the same way.

**After a write the browser asks for the stick again.** A write restarts the stick, which to the
browser is an unplug. Chrome keeps a site's permission across an unplug only for devices that
report a USB serial number, and these sticks report none. So the tool waits a few seconds, and
if the stick is not offered back it shows a **Pick the stick again** button; the write has
already happened by then, and picking the stick lets the tool read it back and check. The
**Reconnect** button on the first screen needs no prompt because nothing was unplugged: Chrome
keeps the permission for as long as the browser runs and the stick stays connected.

**Checking that a write lasted.** Every write is read back after the stick has restarted, so what
is compared is what the stick loaded from its own storage. **Check the stick now**, in the drawer
that **Profiles** opens, repeats that read at any time — after unplugging the stick, say, or after another program
has been at it — and lists any bytes that differ from what the page last read or wrote. If a
write is accepted but the read-back never happens (the tab was closed, the stick was not picked
again), the page remembers what it wrote and says, the next time a stick is connected, whether
that stick holds it.

**A profile from another stick gets a warning.** A `.cfg` records neither a name nor a serial
number, and sticks of one family share a type id, so the left stick's profile loads onto the
right stick without complaint. Two things in it do belong to one stick: the calibration, and the
grip it is set up for. When a loaded profile differs from the connected stick in either, the
review says so and will not write until that is acknowledged. File names of saved profiles
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
- Fields are marked `verified` in the schema only if they were changed on a real stick, with the
  predicted effect observed. Changing any other field first shows a red warning that has to be
  accepted; it then stays unlocked until the page is reloaded.

Used on two sticks so far, a Gladiator EVO R and a Gladiator Omni L, both on firmware 2.20.C. See
[`../docs/PROTOCOL.md`](../docs/PROTOCOL.md).
