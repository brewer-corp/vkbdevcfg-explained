#!/usr/bin/env python3
"""
Pure helpers shared by vkb_hid.py and vkb_cfg.py: the two CRCs, RC4, and the
`.cfg` profile container. No I/O, no platform dependencies, standard library only.

Everything here was reconstructed from VKBDevCfg-C v0.93.89; the addresses in
the comments are where the vendor tool does the same thing.
"""
import struct

BLOCK_SIZE = 0x1000

# 13-byte RC4 key that unwraps the session token returned by READ_CPUID.
# Built at 0x00410E90 from .data:0x00DAB588 with dword[1] := 0x4E8D6CD2 and
# dword[3] >>= 3.
CPUID_KEY = bytes.fromhex('f91462a0' 'd26c8d4e' '88c6b04c' '29')

# 16-byte constant behind the `.cfg` file cipher. Three identical copies sit at
# .data:0x00EC5C64 / 0x00EC5C74 / 0x00EC5C84; bytes 7..10 are replaced by the
# file's CRC word and only the first 13 bytes are used (0x0072416C).
CFG_KEY = bytes.fromhex('f35df531f0a8dbbcbbafcd0303713a7f')


def crc16(data, crc=0xFFFF):
    """CRC-16/MODBUS, as carried in every transfer header (0x004E955C)."""
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def crc32_stm32(data):
    """The STM32 hardware CRC unit, as emulated at 0x004E9468: polynomial
    0x04C11DB7, init 0xFFFFFFFF, little-endian words fed MSB first, no final
    xor. A trailing partial word is ignored, as in the original."""
    crc = 0xFFFFFFFF
    for i in range(0, len(data) & ~3, 4):
        crc ^= struct.unpack_from('<I', data, i)[0]
        for _ in range(32):
            crc = ((crc << 1) ^ 0x04C11DB7) if crc & 0x80000000 else (crc << 1)
            crc &= 0xFFFFFFFF
    return crc


def rc4(data, key):
    """RC4, in the vendor tool at 0x004E99E8 (KSA) and 0x004E9A58 (PRGA)."""
    S = list(range(256))
    j = 0
    for i in range(256):
        j = (j + S[i] + key[i % len(key)]) & 0xFF
        S[i], S[j] = S[j], S[i]
    out = bytearray(data)
    i = j = 0
    for n in range(len(out)):
        i = (i + 1) & 0xFF
        j = (j + S[i]) & 0xFF
        S[i], S[j] = S[j], S[i]
        out[n] ^= S[(S[i] + S[j]) & 0xFF]
    return bytes(out)


# ------------------------------------------------------ parameter block ---
def block_crc(block):
    """The CRC-32 the device keeps at block[4:8]; it covers block[8:]."""
    return crc32_stm32(block[8:])


def block_crc_ok(block):
    return block_crc(block) == struct.unpack_from('<I', block, 4)[0]


def firmware_version(block):
    """block[8:10] as text: 0x220C -> '2.20.C'."""
    fw = struct.unpack_from('<H', block, 8)[0]
    return '%x.%02x.%X' % (fw >> 12, (fw >> 4) & 0xFF, fw & 0xF)


# ------------------------------------------------------- .cfg container ---
#
#   file[0:4]  = ~CRC32_STM32(plain)                 stored in the clear
#   file[4:]   = RC4(plain, key)
#   plain      = block[0:4] + block[8:]              the block minus its CRC word
#   key        = CFG_KEY[0:7] + file[0:4] + CFG_KEY[11:13]
#
# Nothing in it depends on the device the profile came from.

def _cfg_key(crc_word):
    return CFG_KEY[:7] + crc_word + CFG_KEY[11:13]


def cfg_decrypt(data):
    """`.cfg` bytes -> (parameter block, crc_ok).

    The block's own CRC word is not stored in the file. Like the vendor tool
    (0x00724868) this puts the file CRC in that slot; `fix_block_crc` gives the
    value the device would report instead."""
    crc_word = bytes(data[:4])
    plain = rc4(data[4:], _cfg_key(crc_word))
    ok = (crc32_stm32(plain) ^ 0xFFFFFFFF) == struct.unpack('<I', crc_word)[0]
    return plain[:4] + crc_word + plain[4:], ok


def cfg_encrypt(block):
    """Parameter block -> `.cfg` bytes (0x00726F00). block[4:8] is ignored."""
    plain = bytes(block[:4]) + bytes(block[8:])
    crc_word = struct.pack('<I', crc32_stm32(plain) ^ 0xFFFFFFFF)
    return crc_word + rc4(plain, _cfg_key(crc_word))


def fix_block_crc(block):
    """Return the block with block[4:8] set to the CRC-32 the device computes."""
    return bytes(block[:4]) + struct.pack('<I', block_crc(block)) + bytes(block[8:])


if __name__ == '__main__':
    # Self-test against published vectors; needs no device and no vendor file.
    assert crc16(b'123456789') == 0x4B37                          # CRC-16/MODBUS check value
    # The STM32 unit is CRC-32/MPEG-2 with each 32-bit word byte-swapped on the way in.
    assert crc32_stm32(b'43218765') == 0x49E3C2FB                   # CRC-32/MPEG-2 of "12345678"
    assert crc32_stm32(bytes(4)) == 0xC704DD7B                    # CRC-32/MPEG-2 of 00 00 00 00
    assert rc4(b'Plaintext', b'Key').hex() == 'bbf316e8d940af0ad3'
    assert rc4(rc4(b'round trip', b'k'), b'k') == b'round trip'
    block = bytes([0xFF, 0xFF, 0x11, 0xFF]) + bytes(4) + bytes(range(256)) * 16
    block = fix_block_crc(block[:BLOCK_SIZE])
    cfg = cfg_encrypt(block)
    back, ok = cfg_decrypt(cfg)
    assert ok and len(cfg) == BLOCK_SIZE
    assert back[:4] == block[:4] and back[8:] == block[8:]
    assert fix_block_crc(back) == block and block_crc_ok(block)
    assert not cfg_decrypt(cfg[:100] + bytes([cfg[100] ^ 1]) + cfg[101:])[1]
    print('vkblib self-test passed')
