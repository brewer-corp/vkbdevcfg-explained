# Prior art

What was already public about talking to VKB devices at the HID level, as of
October 2026. This is a literature search, **not** something tested in this
repository: apart from the one item marked as checked, nothing below was
re-verified. The VKB forum was unreachable at the time, so forum threads were
seen only as search-engine summaries.

The short version: **LED control and one input report are public. Reading or
writing the configuration is not.** We found no project, document or capture
that covers the parameter block, the `.cfg` format, the firmware format or the
bootloader.

---

## LED control — feature report `0x59`, `A5 0A`

The one command VKB documents itself, in a two-page sheet,
*Protocol for LEDs control* (`LEDs_Protocol.pdf`), attached to
[MobiFlight-Connector issue #1789](https://github.com/MobiFlight/MobiFlight-Connector/issues/1789).

```
before firmware 2.08.5:   59 | A5 0A | crc16 | reserved ×2 | N | N × LED block
firmware 2.08.5 onward:   59 | A5 0A | reserved ×4         | N | N × LED block
```

- CRC-16/MODBUS over the `3N + 3` bytes that follow the CRC field.
- At most 30 LED blocks per report.
- An LED block is four bytes: the LED number, then 24 bits little-endian —
  `R1 G1 B1 R2 G2 B2` at three bits each, a 3-bit mode, a 3-bit colour mode.

| Mode | | Colour mode | |
|---|---|---|---|
| 0 | off | 0 | colour 1 |
| 1 | constant | 1 | colour 2 |
| 2 | slow blink | 2 | colour 1 / colour 2 |
| 3 | fast blink | 3 | colour 2 / colour 1 |
| 4 | ultra-fast blink | 4 | colour 1 + colour 2 |

The state is volatile: it lasts until the device is replugged, and while the
host controls an LED the stick's own LED events do not drive it.

Implementations:

- [ventorvar/pyvkb](https://github.com/ventorvar/pyvkb) — Python, Windows,
  LED set and read-back. Several forks add device IDs or a hidapi backend.
- [MobiFlight Connector](https://github.com/MobiFlight/MobiFlight-Connector)
  (`MobiFlight/Joysticks/VKB/`) — C#. Its device table includes `231d:0200`,
  with LED 0 as the base's system LED and 10–11 on the grip.

The same framing shows up in this repository's own findings: `59 A5 …` followed
by a command byte, and the same CRC-16. See [`PROTOCOL.md`](PROTOCOL.md).

## Input report `0x08` — the "virtual bus"

MobiFlight reads encoder positions from input report `0x08`, which VKB calls a
general service packet. Byte 1 is a subtype; only `0x13`, encoder status, is
documented:

```
08 | 13 | sequence | count | position 0 (u16 LE) | position 1 | …
```

It requires **Virtual BUS over USB** to be enabled in VKBDevCfg. Windows' HID
parser reportedly drops this report from the descriptor it reconstructs,
because it is declared as constant.

## Descriptors and Linux

- A Gladiator EVO R report descriptor is published in
  [miguelsilva5989/vkbdevcfg-wine-workaround](https://github.com/miguelsilva5989/vkbdevcfg-wine-workaround).
  **Checked:** its tail is byte-identical to the descriptor read from the test
  device here.
- That project also reports VKBDevCfg reading a configuration under Wine 11
  with hidraw access; writes were not tested there.
- The Linux kernel has no quirk entries for vendor `231d`. The usual advice for
  devices that present several virtual controllers is
  `usbhid.quirks=0x231d:0x0200:0x040` (see
  [Proton issue #8589](https://github.com/ValveSoftware/Proton/issues/8589)).
- VKBDevCfg's **Save report** output, `.fp3`, is FastReport XML containing a
  human-readable rendering of the mapping. It is not the `.cfg` format.

## A different layer: the module bus

[levi-pl/Njoy32-VKB-slave-device-protocol-parser](https://github.com/levi-pl/Njoy32-VKB-slave-device-protocol-parser)
decodes the UART link between a base and its modules (500 000 baud, frames
starting `5A`, host frames carrying `AA AA A5`). That is not USB, and its
checksum was still undetermined, but the `A5`/`5A` framing bytes are the same
ones the USB protocol uses.

## What nobody had published

- Any read or write of the configuration block, or any `0x59` command other
  than `A5 0A`. ([pyvkb issue #2](https://github.com/ventorvar/pyvkb/issues/2)
  proposes it and stops there.)
- Any use of output report `0x58`, or the meaning of input reports `0x0B` and
  `0x0C`.
- The `.cfg` cipher or layout, the `.vkb` firmware format, the bootloader
  protocol.
