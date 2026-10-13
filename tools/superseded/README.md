# Superseded tools

Scripts written while two wrong conclusions were still standing. They are kept
because this project records its mistakes rather than deleting them, and
because each one fails in an instructive way. **Do not use them.** What
replaces each is in the parent directory.

## The Linux feature-report attempts

`vkb_read_config.py` · `vkb_usb_get.py` · `vkb_hidgeneric_get.py` ·
`probe_feature.py`

All four returned `EINVAL` (or `ENOTTY`), and the conclusion drawn was that the
kernel blocks feature reports for this device. It does not.

The ioctl was wrong. These scripts issue request number `0x02` with only the
write direction bit set:

```
_IOC(_IOC_WRITE, 'H', 0x02, len)              what they send
_IOC(_IOC_WRITE|_IOC_READ, 'H', 0x07, len)    HIDIOCGFEATURE, per <linux/hidraw.h>
_IOC(_IOC_WRITE|_IOC_READ, 'H', 0x06, len)    HIDIOCSFEATURE
```

`0x02` is `HIDIOCGRDESC`'s number, so the kernel rejected the call before any
device was involved — which is exactly the uniform, device-independent `EINVAL`
the scripts observed and then misattributed. The comment these files carry,
that "`hidraw.h` inverts the G/S direction flags", is also wrong: both feature
ioctls set both bits.

Even with the right ioctl, a bare `GET_REPORT` on report `0x59` returns 128
zero bytes. The device answers only after being sent a request.

**Replaced by** `../vkb_hid.py`.

## The `.cfg` key hunt

`rc4key.ps1` · `rc4cfg.py` · `cfgdiff.py`

Built on the belief that the `.cfg` key is the 15-byte buffer at `0x00F08B5E`
in the running process.

- `rc4key.ps1` reads that buffer. It works, but the buffer is the USB
  *transport* key — the device's unique ID — not the file key.
- `rc4cfg.py` tries to decrypt a profile with it, under two framings. Neither
  can succeed: the file uses a different key.
- `cfgdiff.py` XORs two profiles on the theory that a stream cipher under one
  key gives `C1 ⊕ C2 = P1 ⊕ P2`. The premise fails: each file's key includes
  its own CRC, so no two different profiles share a keystream.

**Replaced by** `../vkb_cfg.py`, which needs no captured key at all.
