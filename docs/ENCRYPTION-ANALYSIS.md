# What the encryption is for — and what it isn't

An assessment of the RC4 layers in VKB's configuration system, written twice.

The first version was written when one RC4 call had been found and no byte of
plaintext had been seen. It reasoned from that to a model — a key derived from
device identity, profiles possibly bound to a device — and set out which
observations would test it. Those observations have now been made, and **the
model was wrong in its central claim.** This version says what is true, and
keeps the record of what was predicted, because the way it went wrong is the
useful part.

The evidence is in [`PROTOCOL.md`](PROTOCOL.md) and
[`CFG-FILE-FORMAT.md`](CFG-FILE-FORMAT.md).

---

## 1. What is actually there

Not one cipher. Three uses of the same hand-rolled RC4 routine, with three
different keys:

| # | Where | Key | Protects |
|---|---|---|---|
| 1 | The `READ_CPUID` reply | 13 bytes, a constant in the executable | 16 bytes: the microcontroller's unique ID |
| 2 | The parameter block in transit, both directions | the first 15 bytes of what (1) yields | the configuration, on the USB cable |
| 3 | The `.cfg` file | 13 bytes: 9 from a constant in the executable, 4 from the file's own CRC | the configuration, on disk |

Layers 1 and 2 are a chain. Layer 3 is independent of both.

Every key is either compiled into a program anyone can download, or handed out
by the device to any host that asks. **There is no secret anywhere in the
system.**

## 2. What the earlier analysis got wrong

### It found layer 2 and took it for layer 3

The earlier work located RC4 by searching the code reachable from the save
function for XOR-in-a-loop shapes. It then looked for call sites, found one
that pushed a 15-byte key from a buffer at `0x00F08B5E`, saw that buffer was
filled at run time, and concluded the `.cfg` key was derived from device state.

That call site is in the routine that sends the block to the stick. The buffer
is the transport key. The file cipher is called from somewhere else, with a key
that was sitting in `.data` the whole time — but with four of its bytes
replaced by the file's CRC before use, so a search that tried constants from
the binary as literal keys could never have hit it.

The lesson is narrow and worth keeping: **finding the cipher routine is not
finding the cipher.** A routine has callers, and each caller is a separate
question.

### "Per-save randomisation"

Two sample profiles differed in 4080 of 4096 bytes and their XOR looked random.
The earlier text read that as "the signature of per-save randomisation".

There is no randomisation. The file's CRC is part of its key, so any change to
the content changes the entire keystream. The two samples differ in **two
bytes** of plaintext.

A stream cipher keyed on a checksum of its own plaintext is statistically
indistinguishable, from the outside, from one keyed on a random nonce. The
statistics were right; the inference from them was one of two possibilities,
and the wrong one.

### "The key cannot come from a serial number"

The earlier text observed that the stick reports an empty USB serial string and
concluded that no serial-like identity could be in play. The transport key *is*
a serial number — the STM32's factory-programmed unique ID — which the device
does not expose through any standard descriptor and does expose through its own
protocol.

Absence from the USB descriptors was never evidence of absence from the device.
This is the same shape of mistake as the earlier "no crypto imports, therefore
no encryption".

### "Profiles may be locked to the device that produced them"

They are not. Nothing in a `.cfg` depends on the device. The only device
coupling is a one-byte type ID inside the block, which the tool compares before
writing and which `ForcedWriteID=1` overrides.

## 3. What it got right

- **It is not DRM.** The argument was that the owner holds the device and the
  tool, so nothing can be enforced against them. True, and stronger than
  claimed: the owner does not even need a debugger.
- **It is not a handshake in the cryptographic sense.** `READ_CPUID` is a
  request for an identifier. No challenge is issued, nothing is negotiated, and
  the result is the same every session.
- **The CRC is integrity, not authentication.** It is recomputable by anyone
  with the file — and, for the block itself, recomputed by the device on every
  write, whatever the host sends.
- **The firmware encryption is a separate matter.** `.vkb` images carry a
  plaintext header and an encrypted body. That is the one place in the
  ecosystem where a key is genuinely not available to the host, and it has
  nothing to do with configuration.

## 4. So what is it for?

With the facts in hand, the charitable reading and the likely reading are the
same: **obfuscation, to keep the format out of casual hands.**

- On disk, it stops profiles being edited in a hex editor and loaded back —
  which would otherwise generate support requests about sticks misconfigured by
  hand, and pin the layout in place.
- On the wire, it stops a USB capture from being immediately readable.

Tying the transport key to the unique ID should do one more thing, probably
by design: **a captured write cannot be replayed to a different stick**, where
it would decrypt to noise. (Inferred — only one stick was available.) That
would be a real, if modest, safety property: it makes it harder to push one
device's calibration into another by accident.

It is not device *binding* of the configuration: Load → Set takes a profile
saved from any stick and re-encrypts it for whichever one is connected. And it
is not host authentication, because the device accepted reads and writes from
a client that is not VKBDevCfg.

## 5. Status

| Question | State |
|---|---|
| Is the cipher RC4? | **Yes** — three uses of one routine |
| Is there a CRC-32 alongside it? | **Yes** — the STM32 hardware CRC, as integrity |
| Where does the transport key come from? | **The STM32 unique ID**, read from the device each session |
| Where does the file key come from? | **A constant in the executable**, mixed with the file's CRC |
| Are profiles bound to a device? | **No** |
| Is there per-save randomisation? | **No** |
| What is in the plaintext? | The 4096-byte parameter block — see [`PARAMETER-BLOCK.md`](PARAMETER-BLOCK.md) |
| Is it DRM? | **No** |
