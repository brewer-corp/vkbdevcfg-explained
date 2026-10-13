#!/usr/bin/env python3
"""
Decrypt, re-encrypt and compare VKBDevCfg `.cfg` profiles. Works offline, on any OS.

A `.cfg` is the device's 4096-byte parameter block, RC4-encrypted with a key
that is compiled into VKBDevCfg (see docs/CFG-FILE-FORMAT.md). No device and no
captured key are needed.

    python3 vkb_cfg.py info    profile.cfg
    python3 vkb_cfg.py decrypt profile.cfg block.bin
    python3 vkb_cfg.py encrypt block.bin   profile.cfg
    python3 vkb_cfg.py diff    a.cfg b.cfg          # either side may be a plaintext block

`block.bin` is the same plaintext that `vkb_hid.py read` produces, so a block
read from a stick can be turned into a profile VKBDevCfg will load, and back.
"""
import argparse
import struct
import sys

from vkblib import (BLOCK_SIZE, block_crc, cfg_decrypt, cfg_encrypt,
                    firmware_version, fix_block_crc)


def looks_like_block(data):
    return len(data) >= 12 and data[0] == 0xFF and data[1] == 0xFF and data[3] in (0xFF, 0xA1)


def load_block(path):
    """Read a profile or a plaintext block; return (block, description)."""
    data = open(path, 'rb').read()
    if looks_like_block(data):
        return data, 'plaintext block'
    block, ok = cfg_decrypt(data)
    if not ok:
        sys.exit('%s: neither a plaintext block nor a profile that decrypts '
                 '(file CRC mismatch)' % path)
    return block, 'profile'


def cmd_info(args):
    block, kind = load_block(args.file)
    print('file        : %s (%s, %d bytes)' % (args.file, kind, len(block)))
    print('type id     : 0x%02x' % block[2])
    print('firmware    : %s' % firmware_version(block))
    print('crc word    : %08x' % struct.unpack_from('<I', block, 4)[0])
    print('device crc  : %08x  (what the stick stores for this content)' % block_crc(block))
    if len(block) != BLOCK_SIZE:
        print('note        : %d bytes, not the %d of current firmware' % (len(block), BLOCK_SIZE))


def cmd_decrypt(args):
    data = open(args.src, 'rb').read()
    block, ok = cfg_decrypt(data)
    if not ok:
        sys.exit('file CRC mismatch: not a profile this tool understands')
    with open(args.dst, 'wb') as f:
        f.write(fix_block_crc(block))
    print('%s -> %s (%d bytes, firmware %s)' % (args.src, args.dst, len(block), firmware_version(block)))


def cmd_encrypt(args):
    block = open(args.src, 'rb').read()
    if not looks_like_block(block):
        sys.exit('%s does not start like a parameter block (FF FF tt FF)' % args.src)
    with open(args.dst, 'wb') as f:
        f.write(cfg_encrypt(block))
    print('%s -> %s (%d bytes)' % (args.src, args.dst, len(block)))


def cmd_diff(args):
    a, _ = load_block(args.a)
    b, _ = load_block(args.b)
    if len(a) != len(b):
        print('sizes differ: %d vs %d; comparing the common prefix' % (len(a), len(b)))
    runs = []
    for i in range(8, min(len(a), len(b))):          # skip the header and CRC word
        if a[i] != b[i]:
            if runs and i <= runs[-1][1] + 1:
                runs[-1][1] = i
            else:
                runs.append([i, i])
    if not runs:
        print('identical from offset 8')
        return
    print('%d differing bytes in %d runs' % (sum(e - s + 1 for s, e in runs), len(runs)))
    for s, e in runs:
        print('  0x%03x..0x%03x   %-36s | %s' % (s, e, a[s:e + 1].hex(' '), b[s:e + 1].hex(' ')))


def main():
    ap = argparse.ArgumentParser(description='Work with VKBDevCfg .cfg profiles.')
    sub = ap.add_subparsers(dest='command', required=True)
    p = sub.add_parser('info');    p.add_argument('file');                        p.set_defaults(fn=cmd_info)
    p = sub.add_parser('decrypt'); p.add_argument('src'); p.add_argument('dst');  p.set_defaults(fn=cmd_decrypt)
    p = sub.add_parser('encrypt'); p.add_argument('src'); p.add_argument('dst');  p.set_defaults(fn=cmd_encrypt)
    p = sub.add_parser('diff');    p.add_argument('a');   p.add_argument('b');    p.set_defaults(fn=cmd_diff)
    args = ap.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
