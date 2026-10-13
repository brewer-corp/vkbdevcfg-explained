# The VKB configuration protocol

How VKBDevCfg talks to an NJoy32 device, reconstructed by decompiling
`VKBDevCfg-C.exe` v0.93.89 and **verified against a real VKBsim Gladiator EVO R**
(`231d:0200`, firmware 2.20.C) from Linux — including reading the
configuration, changing one setting, and restoring the original.

Two labels are used throughout:

- ***verified*** — observed on the wire with the test device.
- ***static*** — read out of the binary, not exercised on hardware.

`tools/vkb_hid.py` implements everything marked *verified*.

---

## 1. Transport

All configuration traffic uses **one HID feature report, ID `0x59`** — 128 data
bytes, 129 with the report ID. The device has no OUT endpoint, so both
directions are control transfers:

| Direction | USB request | Windows API | Linux hidraw |
|---|---|---|---|
| host → device | `SET_REPORT(Feature, 0x59)` | `HidD_SetFeature` | `HIDIOCSFEATURE(129)` |
| device → host | `GET_REPORT(Feature, 0x59)` | `HidD_GetFeature` | `HIDIOCGFEATURE(129)` |

Output report `0x58` plays no part in reading or writing the configuration.

A `GET_REPORT` on an idle device returns 128 zero bytes. The device only has
something to say after it has been asked.

> An earlier revision of this repository concluded that feature reports were
> "blocked by the kernel" on Linux. That was wrong. `HIDIOCGFEATURE` works as
> root on kernel 7.0; the earlier `EINVAL` came from a malformed request, not
> from the kernel or the device.

## 2. Framing

Every transfer starts with the report ID followed by an 8-byte header:

```
offset  size  field
0       1     report id            0x59
1       1     prefix               0xA5 host→device, 0x5A device→host
2       1     command | flags
3       2     size   (LE)          payload bytes in the whole transfer
5       2     addr   (LE)          offset inside the addressed object
7       2     crc16  (LE)          CRC-16/MODBUS of the whole payload
9       120   payload              first frame
```

Continuation frames carry no header: report ID, then 128 payload bytes. The
last frame is zero-padded.

| Flags | Meaning | Vendor routine |
|---|---|---|
| `0xC0` | long read — host requests `size` bytes at `addr` | `0x004E5514` |
| `0x80` | long write — host sends `size` bytes to `addr` | `0x004E525C` |

`crc16` is zero in a read request and filled in by whichever side is sending
payload. It is CRC-16/MODBUS: initial value `0xFFFF`, reflected polynomial
`0xA001`, no final XOR (`0x004E955C`).

### Long read *(verified)*

```
SET  59 A5 cmd|C0 size addr 00 00 …
GET  59 5A cmd|C0 size addr crc  <120 bytes>
GET  59 <128 bytes>
…    until `size` bytes have arrived
```

A 4096-byte read is one `SET` and 33 `GET`s. The device echoes the command and
address, which is how a reply is matched to its request.

### Long write *(verified)*

```
SET  59 A5 cmd|80 size addr crc  <120 bytes>
SET  59 <128 bytes>
…    until `size` bytes have been sent      (33 frames for 4096 bytes)
     wait 60 ms
GET  59 <status word> …
```

The four bytes after the report ID in that final `GET` are a status word
(decoded by the tool at `0x0040FDE4`):

| Bytes | As LE dword | Meaning | Seen on hardware |
|---|---|---|---|
| `5A A5 88 00` | `0x0088A55A` | block written | yes |
| `11 5A A5 11` | `0x11A55A11` | the tool reports this as "No new data !!!" | no |
| `22 22 22 22` | `0x22222222` | CRC error | yes — see §7 |
| `31 AD DE 31` | `0x31DEAD31` | erase FLASH error | no |
| `33 AD DE 33` | `0x33DEAD33` | write FLASH error | no |
| `33 5A A5 33` | `0x33A55A33` | non-compatible profile | no |

### Short command *(static)*

```
59 A5 5A code_lo code_hi …
```

A payload-free command: `code_lo` selects the command, `code_hi` is its
argument. Once a block has been read, the tool sends short commands in an
"encoded" form: the 16-byte session token (§3) is placed at frame offset
`0x58`, and frame bytes `5..124` are RC4-encrypted using frame bytes `1..4` —
`A5 5A code_lo code_hi`, sent in the clear — as the key (`0x00412354`).

Short commands are what reset the stick to factory defaults, start a
calibration and enter the bootloader. **None is needed to read or write the
configuration.** Only two benign ones were ever sent, while investigating the
`RAM` target (§5). The catalogue is in
[`COMMANDS.md`](COMMANDS.md).

### LED command *(public, not re-tested here)*

`59 A5 0A …` sets LED states at runtime. VKB documents this one itself; see
[`PRIOR-ART.md`](PRIOR-ART.md).

## 3. The session token

Before anything else the tool issues long read **command `0x0B`**, size `0x78`
— `cmd_READ_CPUID` in the tool's own log strings.

The 120-byte reply is mostly leftover buffer content. The meaningful part is
16 bytes at payload offset `0x58`. Those are RC4-decrypted with a fixed 13-byte
key to give the **session token**:

```
key   = F9 14 62 A0 D2 6C 8D 4E 88 C6 B0 4C 29
token = RC4(reply[0x58:0x68], key)
```

The key is built at `0x00410E90` from 16 bytes at `.data:0x00DAB588`, with the
second dword overwritten by `0x4E8D6CD2` and the fourth shifted right by three.

On the test device the token has this shape (identifying bytes redacted):

```
xx xx xx xx  xx xx xx xx  57 36 32 20  xx xx xx xx
└────────── STM32 unique ID ─────────┘  └─ 4 more ─┘
```

The first twelve bytes are the STM32 96-bit unique ID — bytes 8–11 are the
ASCII lot number `"W62 "`, which is what gives it away. The token is
**constant for a given device**: it was the same in every session, including
across the restarts that follow a write.

Because it is a hardware serial number, treat a captured token like one: it is
not a credential, but it does identify one physical stick. `tools/vkb_hid.py`
prints it redacted unless asked.

The token is used in two ways:

1. Its first **15 bytes are the RC4 key for the parameter block** in transit.
2. All 16 bytes are embedded in encoded short commands.

This resolves the question the earlier analysis left open. The buffer at
`0x00F08B5E` is not a file key derived from mysterious device state — it is
the microcontroller's serial number, lightly obfuscated in transit, and it has
nothing to do with `.cfg` files ([`CFG-FILE-FORMAT.md`](CFG-FILE-FORMAT.md)).

## 4. Reading the configuration *(verified)*

The whole configuration is one **4096-byte parameter block**.

```
token       = read_cpuid()
ciphertext  = long_read(cmd=0x02, size=0x1000, addr=0)
block       = RC4(ciphertext, key=token[0:15])
```

| Command | Reads | In the tool |
|---|---|---|
| `0x02` | the block stored in flash | `cmbTargetMemory` = `EEPROM` |
| `0x03` | the copy in RAM | `cmbTargetMemory` = `RAM` |

Both returned identical data at every point they were compared.

The plaintext begins:

```
offset  size  field
0x000   4     FF FF 11 FF      byte 2 = device type id
0x004   4     CRC-32 of block[8:0x1000]
0x008   2     firmware version, LE   (0x220C = 2.20.C)
…
```

The CRC-32 is the **STM32 hardware CRC**: polynomial `0x04C11DB7`, initial value
`0xFFFFFFFF`, fed 32-bit little-endian words most-significant-bit first, no
final XOR. The tool emulates it at `0x004E9468`. On the test device the stored
and computed values agree, which is the proof that the transport, the token
derivation and the cipher are all correct.

The device also answers shorter reads of the same object (`0x400`, `0x800`,
`0xC00`); older firmware generations use those as their block size. Only the
full `0x1000` read satisfies the CRC-32.

The read is deterministic: the same block produces the same ciphertext every
time. There is no per-session nonce.

The field-level layout of the block is in
[`PARAMETER-BLOCK.md`](PARAMETER-BLOCK.md).

## 5. Writing the configuration *(verified)*

```
token       = read_cpuid()
…             one complete long read, so the write is not the request after READ_CPUID
ciphertext  = RC4(block, key=token[0:15])
status      = long_write(cmd=0x24, addr=0, data=ciphertext)
              status must be 5A A5 88 00
…             the stick restarts
```

What was observed, in order:

1. **The stick's own block, unchanged**, written back → `block written`. Stored
   configuration afterwards byte-identical.
2. **One setting changed** — the filter grade of an unused physical axis slot,
   one byte at `0x0B5` — → `block written`. Both the flash and RAM copies read
   back as the new block immediately, and again after the restart.
3. **The original restored** → `block written`. The stick's configuration then
   hashed identically to the backup taken before any write.

Things worth knowing:

- **The stick restarts after an accepted write.** It leaves the bus about 0.3 s
  after returning the status and re-enumerates about 2.4 s later, with the same
  VID/PID and the same token. VKBDevCfg does not wait for this explicitly; it
  arms a 5-second timer and then treats the device as newly plugged in.
- **The device recomputes `block[4:8]`.** A block sent with a different value
  in the CRC word — the file CRC a loaded `.cfg` leaves there, exactly as
  VKBDevCfg sends it after Load → Set — was accepted, and read back carrying
  the correct CRC. A host does not need to compute it.
- **No short command is required.** VKBDevCfg sends "select profile"
  (`0x17`) before a write; the device accepted writes without it.
- **Command `0x25`, the `RAM` target, does not visibly apply anything.** The
  device acknowledged it with `block written` and restarted, but neither copy
  changed, before or after the restart. Use `0x24`. The same happened with
  short command `0x17` sent first (plain and encoded), with an 8-byte write at
  an offset (two keystream alignments), and with short command `0x14` sent
  first. So `block written` only confirms the transfer, and any write to this
  target is followed by a restart, however small.
- **Two short commands have now been sent.** `0x17` with argument 0 ("select
  profile") produces no restart, no change and no acknowledgement. `0x14` with
  argument 1 ("partial-write mask") is acknowledged with `5A A5 FE 00`.
- **The device does not reject a block it already holds.** An identical write
  returns `block written`, not `no new data`, and still triggers a restart.

What was *not* tested: writing a block for a different device type or firmware
version, a block with deliberately invalid field values, an interrupted
transfer, and any other device or firmware. The tool itself warns
(`msg_WRITE_MODE_IS_FORCED_BY_USER`) that an incompatible profile "may cause
device inoperability", so `vkb_hid.py write` refuses a block whose type id or
firmware word differs from the device's.

## 6. What the encryption is

Three RC4 uses, none of which protects a secret:

| Layer | Key | Covers |
|---|---|---|
| Token unwrap | 13-byte constant compiled into the tool | the 16-byte token in the `READ_CPUID` reply |
| Block in transit | first 15 bytes of the token — the device's own serial number, which it hands out on request | the parameter block, both directions |
| `.cfg` on disk | 13 bytes built from a constant and the file's CRC | saved profiles |

Any host that can send a feature report can obtain the transit key. The scheme
stops a passive observer with a USB capture from reading a configuration
without knowing the algorithm. It does not authenticate the host: the device
accepted reads and writes from a client that is not VKBDevCfg.

## 7. Quirks

**The request after `READ_CPUID` gets someone else's answer.** Observed every
time: the first long read issued after a `READ_CPUID` is answered with a frame
headed `5A 4B …` — a stale buffer, not the requested data. Repeating the request
works. The vendor tool is not immune; it never checks the echoed command, and
it issues `READ_CPUID` through a routine named `ReadCPUID_N_times`.
`vkb_hid.py` checks the echoed command and address and retries, and never
issues a write as the first request after `READ_CPUID`.

**An unfinished transfer poisons the next request.** If the host stops issuing
`GET`s before `size` bytes have been delivered, the next request is answered
with `22 22 22 22` — the CRC-error status word — in place of a header. One more
request clears it.

**`READ_CPUID` leaks the previous transfer.** The 104 bytes of its reply that
are not the token are whatever was last in the device's transfer buffer —
including, after a parameter read, part of the parameter block *in plaintext*.
