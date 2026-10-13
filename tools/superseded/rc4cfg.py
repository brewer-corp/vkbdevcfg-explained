#!/usr/bin/env python3
"""
Decrypt a VKB .cfg profile with the RC4 key recovered from a running
VKBDevCfg-C.exe, and prove whether the key is correct.

The cipher was identified by decompiling VKBDevCfg-C.exe (Ghidra 12.1.4):

    0x004E99E8  RC4 Key Scheduling Algorithm
    0x004E9A58  RC4 PRGA
    0x004E9468  CRC-32 (reversed IEEE poly 0xEDB88320, integrity only)
    0x00410403  call site, pushes key length 0x0F
    0x00F08B5E  the key buffer (zero-initialised .data tail, filled at runtime)

This script tries two plausible framings, because the call site alone does not
settle which one the save path uses:

    stream   one RC4 keystream applied across the whole 4096-byte file
    block    the KSA is re-run per 128-byte block, so every block restarts the
             same 15-byte key

It scores each attempt rather than trusting either, using independent signals:

  * Shannon entropy of the plaintext          (7.95 bits/byte = still ciphertext)
  * per-block entropy                          (real config has dead flat regions)
  * index of coincidence                       (1/255 = random)
  * a stored-CRC-32 match                      (a hard yes/no oracle)

The CRC check is the decisive one. If any 4-byte field of the plaintext equals
CRC-32 of the plaintext around it, the key is correct beyond doubt -- entropy
alone can be fooled, a 32-bit integrity match cannot.

Usage
    python3 rc4cfg.py --key <hex> <profile.cfg> [<profile2.cfg> ...]
    python3 rc4cfg.py --key-file keylog.csv <profile.cfg>
    python3 rc4cfg.py --entropy <profile.cfg>          # no key needed
"""
import argparse
import binascii
import collections
import math
import struct
import sys
import zlib

BLOCK = 128
DEFAULT_BLOCKS = 32


# ---------------------------------------------------------------- RC4 ------
def rc4_ksa(key):
    s = list(range(256))
    j = 0
    klen = len(key)
    for i in range(256):
        j = (j + s[i] + key[i % klen]) & 0xFF
        s[i], s[j] = s[j], s[i]
    return s


def rc4_prga(s, n):
    """Yield n keystream bytes from a KSA'd state (mutates s, as RC4 does)."""
    i = j = 0
    out = bytearray(n)
    for k in range(n):
        i = (i + 1) & 0xFF
        j = (j + s[i]) & 0xFF
        s[i], s[j] = s[j], s[i]
        out[k] = s[(s[i] + s[j]) & 0xFF]
    return out


def rc4_crypt(key, data):
    s = rc4_ksa(key)
    ks = rc4_prga(s, len(data))
    return bytes(a ^ b for a, b in zip(data, ks))


def rc4_crypt_blockwise(key, data):
    ks = rc4_ksa(key)
    out = bytearray()
    for off in range(0, len(data), BLOCK):
        chunk = data[off:off + BLOCK]
        out += bytes(a ^ b for a, b in zip(chunk, rc4_prga(ks, len(chunk))))
    return bytes(out)


# ------------------------------------------------------------- metrics -----
def entropy(b):
    if not b:
        return 0.0
    n = len(b)
    c = collections.Counter(b)
    return -sum((v / n) * math.log2(v / n) for v in c.values())


def index_of_coincidence(b):
    n = len(b)
    if n < 2:
        return 0.0
    c = collections.Counter(b)
    return sum(v * (v - 1) for v in c.values()) / (n * (n - 1))


def crc_oracle(pt, label=''):
    """
    Look for an embedded CRC-32 field. For each 4-byte window, test whether it
    equals CRC-32 of the plaintext with that window removed (the usual layout)
    or of the plaintext before it (a trailing-checksum layout).

    Returns (best_result, hits) where result is None on no match.
    """
    n = len(pt)
    hits = []
    for i in range(0, n - 3):
        w = pt[i:i + 4]
        le = struct.unpack('<I', w)[0]
        be = struct.unpack('>I', w)[0]
        around = zlib.crc32(pt[:i] + pt[i + 4:]) & 0xFFFFFFFF
        before = zlib.crc32(pt[:i]) & 0xFFFFFFFF
        after = zlib.crc32(pt[i + 4:]) & 0xFFFFFFFF
        for name, val in (('LE', le), ('BE', be)):
            for how, want in (('rest', around), ('prefix', before), ('suffix', after)):
                if val == want and want != 0:
                    hits.append((i, name, how, want))
    if not hits:
        return None, []
    # Prefer a match whose stored value is non-trivial.
    hits.sort(key=lambda h: (h[3] in (0, 1), h[3] == 0))
    return hits[0], hits


def describe(data, blocks=DEFAULT_BLOCKS):
    ent = entropy(data)
    ioc = index_of_coincidence(data)
    hist = collections.Counter(data)
    top = ', '.join('%02x:%d' % (b, c) for b, c in hist.most_common(6))
    return ent, ioc, top


def hexdump(b, width=16, limit=None):
    data = b if limit is None else b[:limit]
    lines = []
    for off in range(0, len(data), width):
        row = data[off:off + width]
        hx = ' '.join('%02x' % c for c in row)
        asc = ''.join(chr(c) if 0x20 <= c <= 0x7E else '.' for c in row)
        lines.append('%04x  %-*s  %s' % (off, width * 3 - 1, hx, asc))
    return '\n'.join(lines)


# ------------------------------------------------------------- report ------
def attempt(mode, key, data, label, verbose=True):
    pt = rc4_crypt(key, data) if mode == 'stream' else rc4_crypt_blockwise(key, data)
    ent, ioc, top = describe(pt)
    nblocks = len(pt) // BLOCK
    bents = [entropy(pt[i * BLOCK:(i + 1) * BLOCK]) for i in range(nblocks)]
    flat = sum(1 for e in bents if e < 4.0)
    zero_ish = sum(1 for i in range(nblocks) if len(set(pt[i * BLOCK:(i + 1) * BLOCK])) <= 2)
    crc_best, crc_hits = crc_oracle(pt)

    if verbose:
        print('  [%s] %s' % (mode, label))
        print('    entropy        : %.4f bits/byte   %s' % (ent, '(ciphertext-like)' if ent > 7.5 else 'STRUCTURED'))
        print('    index of coin. : %.5f            %s' % (ioc, '(random)' if abs(ioc - 1 / 255) < 0.0005 else '(non-random)'))
        print('    top bytes      : %s' % top)
        print('    flat blocks    : %d/%d below 4.0 bits;  %d/%d with <=2 distinct values'
              % (flat, nblocks, zero_ish, nblocks))
        if crc_best:
            print('    CRC-32 MATCH   : offset %d, %s-endian, over %s  <<< KEY CONFIRMED'
                  % (crc_best[0], crc_best[1], crc_best[2]))
            for h in crc_hits[:5]:
                print('        offset %4d  %s-endian  crc32(%s) = 0x%08X' % (h[0], h[1], h[2], h[3]))
        else:
            print('    CRC-32 MATCH   : none')
        print('    per-block ent. : %s' % ' '.join('%.1f' % e for e in bents[:16]))
        if nblocks > 16:
            print('                      %s' % ' '.join('%.1f' % e for e in bents[16:32]))
        print('    first 64 bytes :')
        for line in hexdump(pt, limit=64).splitlines():
            print('        ' + line)
        print()

    return {'mode': mode, 'label': label, 'pt': pt, 'entropy': ent, 'ioc': ioc,
            'crc': crc_best, 'crc_hits': crc_hits}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('profiles', nargs='*', help='.cfg files')
    ap.add_argument('--key', help='RC4 key as hex')
    ap.add_argument('--key-file', help='CSV written by rc4key.ps1')
    ap.add_argument('--entropy', action='store_true',
                    help='baseline stats only, no key needed')
    ap.add_argument('--dump', type=int, default=64, help='bytes of plaintext to hexdump (0=off)')
    ap.add_argument('--out', help='write decrypted plaintext here')
    args = ap.parse_args()

    if not args.profiles:
        ap.error('need at least one profile')

    keys = []
    if args.key:
        keys.append(('cli', bytes.fromhex(args.key.strip())))
    if args.key_file:
        try:
            import csv
            with open(args.key_file, newline='', encoding='utf-8-sig') as fh:
                for row in csv.DictReader(fh):
                    if str(row.get('AllZero', '')).strip().lower() in ('true', '1'):
                        continue
                    h = (row.get('KeyHex') or '').strip()
                    if h:
                        keys.append(('csv:' + row.get('FirstSeenLocal', '?'), bytes.fromhex(h)))
        except Exception as exc:
            print('could not read key file: %s' % exc, file=sys.stderr)

    for path in args.profiles:
        data = open(path, 'rb').read()
        print('=' * 78)
        print('%s   (%d bytes, %.2f blocks of %d)' % (path, len(data), len(data) / BLOCK, BLOCK))
        ent, ioc, top = describe(data)
        print('  ciphertext entropy : %.4f bits/byte' % ent)
        print('  index of coin.     : %.5f  (1/255 = %.5f)' % (ioc, 1 / 255))
        print('  top bytes          : %s' % top)
        print('  all blocks == %dB  : %s' % (BLOCK, len(data) % BLOCK == 0))
        print()

        if args.entropy or not keys:
            if args.entropy:
                print('  (--entropy: no decryption attempted)')
            print()
            continue

        print('  %d candidate key(s) x 2 framings:' % len(keys))
        print()
        best = None
        for kl, key in keys:
            for mode in ('stream', 'block'):
                r = attempt(mode, key, data, '%s / %s' % (kl, key.hex()), verbose=(args.dump > 0))
                if r['crc']:
                    best = r
        if best:
            print('  ==> DECRYPTED. Key %s confirmed by a CRC-32 integrity match.'
                  % best['label'].split('/')[-1].strip())
            if args.out:
                open(args.out, 'wb').write(best['pt'])
                print('      plaintext written to %s' % args.out)
        else:
            scored = []
            for kl, k in keys:
                for m in ('stream', 'block'):
                    scored.append(attempt(m, k, data, kl, verbose=False))
            best = min(scored, key=lambda r: r['entropy'], default=None)
            if best:
                print('  ==> no CRC-32 match. Lowest-entropy attempt: %s / %s at %.4f bits/byte.'
                      % (best['label'], best['mode'], best['entropy']))
                if best['entropy'] < 6.0 and args.out:
                    open(args.out, 'wb').write(best['pt'])
                    print('      plaintext (unconfirmed) written to %s' % args.out)
            else:
                print('  ==> nothing to score')
        print()


if __name__ == '__main__':
    main()