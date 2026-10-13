# The `.cfg` profile format

What VKBDevCfg writes when you press **Save**, reconstructed from
`VKBDevCfg-C.exe` v0.93.89 and **verified on two real profiles**: both decrypt,
both pass their CRC, and re-encrypting the plaintext reproduces each file byte
for byte.

`tools/vkb_cfg.py` implements everything on this page.

---

## The short version

A `.cfg` is the device's 4096-byte parameter block with its CRC word removed,
RC4-encrypted under a key that is **compiled into VKBDevCfg**. Nothing in the
file depends on the stick it came from.

That overturns the working assumption this repository held until now — that the
key was "derived at runtime from device state" and a profile might be locked to
its device. The 15-byte buffer at `0x00F08B5E` that the earlier analysis chased
is the key for the **USB transport** ([`PROTOCOL.md`](PROTOCOL.md) §3), not for
the file. The file has its own cipher call, in a different function, with a
different key.

## Layout

For current devices the file is exactly as long as the parameter block, 4096
bytes:

```
offset  size   content
0x000   4      file CRC, little-endian, in the clear
0x004   4092   RC4(plain)
```

where

```
plain    = block[0:4] + block[8:4096]          the block without block[4:8]
file CRC = ~CRC32_STM32(plain)                 bitwise NOT of the STM32 CRC
key      = K[0:7] + fileCRC[0:4] + K[11:13]    13 bytes
K        = F3 5D F5 31 F0 A8 DB BC BB AF CD 03 03 71 3A 7F
```

`K` is a 16-byte constant stored three times in `.data`, at `0x00EC5C64`,
`0x00EC5C74` and `0x00EC5C84`. The four bytes of the file CRC, exactly as they
appear at the start of the file, overwrite `K[7:11]`; only the first 13 bytes of
the result are used as the RC4 key.

`CRC32_STM32` is the STM32 hardware CRC: polynomial `0x04C11DB7`, initial value
`0xFFFFFFFF`, 32-bit little-endian words fed most-significant-bit first, no
final XOR.

### Why the earlier statistics looked the way they did

Mixing the CRC into the key means **any change to the plaintext changes the
whole keystream**. Two saves that differ in a single setting share no ciphertext
bytes beyond chance. That is what made the two sample profiles look "randomised
per save" (4080 of 4096 bytes different, XOR indistinguishable from noise).
There is no nonce and no randomness: the same block always produces the same
file.

Decrypted, those two samples differ in **two bytes**.

## Save — `0x00726F00`

```
copy      = block                                   4096 bytes
copy[4:8] = block[0:4]                              the device CRC word is dropped…
copy[0:4] = ~CRC32_STM32(copy[4:])                  …and the file CRC goes in front
key       = K[0:7] + copy[0:4] + K[11:13]
RC4(copy[4:], key)                                  0x0072416C
write copy
```

Called from `TMainForm::btnSaveParamClick` (`0x00413B20`).

## Load — `0x00724868`

```
buf       = file
key       = K[0:7] + buf[0:4] + K[11:13]
RC4(buf[4:], key)
require   ~CRC32_STM32(buf[4:]) == buf[0:4]         else "! CRC Error !"
block     = buf[4:8] + buf[0:4] + buf[8:]           swap the first two words back
```

So after a load, `block[4:8]` holds the **file** CRC, not the CRC the device
keeps there. VKBDevCfg does not recompute it before sending the block to a
stick.

Called from `TMainForm::LoadParamExecute` (`0x004134F8`), which is reached from
the **Load** button and from dropping a `.cfg` on the window (`0x00436EA0`,
which insists on exactly one file with a `.cfg` extension and a selected
device).

### What the loader checks

| Check | Rule | On failure |
|---|---|---|
| File CRC | as above | "Read data error, probably file is corrupted" — nothing is loaded |
| Device type | `block[2]` must equal `block[2]` of the block last read from the selected device | The profile is loaded into the UI, but **Set After Load** is suppressed and a warning is shown |
| Firmware version | none — `block[8:10]` is only displayed | — |
| File size | none | — |

Pressing **Set** repeats the device-type check and refuses to write on a
mismatch. The `ForcedWriteID=1` option in `zconfig.ini` bypasses that refusal
and nothing else; it has no effect on the file format.

## Other shapes of the same file

Recognised by the loader, not exercised here:

- **Non-inverted CRC.** A file whose first word equals `CRC32_STM32(plain)`
  without the inversion is accepted and copied through unswapped. Presumably an
  older writer.
- **Header format.** Devices on the alternate layout (the tool's internal
  "profile" structure, a 0xC00-byte record per profile) get a 0x40-byte header
  in front, carrying a magic `31 F5 5D F3 CE 0A A2 0C`, the payload size and its
  own CRC, with bytes `0x10..0x3F` RC4-encrypted under the first **15** bytes of
  `K`. The loader tries this first and falls back to the plain layout if the
  header CRC does not verify.

## What this unlocks

- **Profiles can be diffed.** `vkb_cfg.py diff a.cfg b.cfg`.
- **Profiles can be authored.** `vkb_cfg.py encrypt block.bin out.cfg` produces
  a file by the same steps VKBDevCfg uses; on the two samples the output is
  identical to the vendor's.
- **A stick can be backed up without VKBDevCfg.** `vkb_hid.py read` gives the
  plaintext block, and `vkb_cfg.py encrypt` turns it into a profile.

What it does not give is the *meaning* of the 4096 bytes. That is
[`PARAMETER-BLOCK.md`](PARAMETER-BLOCK.md).
