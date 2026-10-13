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

Verified on one model and firmware: a Gladiator EVO at 2.20.C. See
[`../docs/PROTOCOL.md`](../docs/PROTOCOL.md).
