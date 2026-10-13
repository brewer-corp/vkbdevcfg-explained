#!/usr/bin/env python3
"""
Map the VKB .cfg format by differential analysis -- no key required.

Experiment 1 established that the container is DETERMINISTIC: saving the same
state twice produces byte-identical files. That is what makes this possible.

A stream cipher (RC4 is a stream cipher) encrypts byte-for-byte, so for any two
ciphertexts C1 and C2 produced under the same key:

    C1 XOR C2  ==  P1 XOR P2          exactly, with no noise

Therefore a save that changes exactly one setting produces a sparse XOR, and the
byte positions that differ are EXACTLY the bytes of the field you changed. No
key, no plaintext, no guessing.

This also means the differing positions are meaningful even under per-block
rekeying, because a plaintext byte only ever affects ciphertext bytes inside its
own block.

Usage
    python3 cfgdiff.py base.cfg changed.cfg
    python3 cfgdiff.py base.cfg changed.cfg --baseline many.cfg

"baseline" is a third file of an unrelated profile; bytes that are constant
across every profile are almost certainly defaults, which helps name the fields.
"""
import argparse
import collections
import itertools
import math
import sys

BLOCK = 128


def load(p):
    return open(p, 'rb').read()


def runs(positions):
    """Group sorted byte positions into contiguous runs."""
    out = []
    for _, g in itertools.groupby(enumerate(positions), lambda t: t[1] - t[0]):
        g = [x[1] for x in g]
        out.append((g[0], g[-1]))
    return out


def xor(a, b):
    return bytes(x ^ y for x, y in zip(a, b))


def common(a, b):
    """Bytes identical in both files, per position."""
    return [i for i in range(min(len(a), len(b))) if a[i] == b[i]]


MAXSHOW = 24


def hexs(data, idxs, limit=MAXSHOW):
    s = ' '.join('%02x' % data[i] for i in idxs)
    return s if len(idxs) <= limit else s[:limit * 3 - 1] + ' ...'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('a')
    ap.add_argument('b')
    ap.add_argument('--baseline', action='append', default=[],
                    help='extra profiles used to spot default-valued fields')
    args = ap.parse_args()

    A, B = load(args.a), load(args.b)
    n = min(len(A), len(B))
    if len(A) != len(B):
        print('WARNING: lengths differ (%d vs %d); comparing first %d' % (len(A), len(B), n))
    A, B = A[:n], B[:n]

    diff = [i for i in range(n) if A[i] != B[i]]
    same = common(A, B)
    X = xor(A, B)

    print('files        : %s  vs  %s' % (args.a, args.b))
    print('size         : %d bytes = %d blocks of %d' % (n, n // BLOCK, BLOCK))
    print('differing    : %d bytes (%.3f%%)' % (len(diff), 100.0 * len(diff) / n))
    print('identical    : %d bytes (%.3f%%)' % (len(same), 100.0 * len(same) / n))
    print()

    if not diff:
        print('FILES ARE IDENTICAL -- nothing changed, or the change did not reach the file.')
        return 0

    # Entropy of the XOR. A real single-field change collapses it hard;
    # a randomised container leaves it at ~7.95.
    def ent(b):
        c = collections.Counter(b)
        m = len(b)
        return -sum((v / m) * math.log2(v / m) for v in c.values())

    ex = X[diff[0]:diff[-1] + 1] if diff[-1] - diff[0] + 1 <= 512 else bytes(X[i] for i in diff)
    print('XOR entropy over differing span : %.4f bits/byte  (random = 7.95)' % ent(ex))
    print('XOR values present              : %s'
          % ', '.join('%02x:%d' % (v, c) for v, c in collections.Counter(
              X[i] for i in diff).most_common(8)))
    print()

    print('--- per-block differing byte counts ---')
    nb = n // BLOCK
    for b in range(nb):
        d = [i for i in diff if i // BLOCK == b]
        if d:
            print('  block %2d (off %5d): %3d bytes  %s' % (b, b * BLOCK, len(d), runs(d)))
    print()

    print('--- candidate fields (contiguous runs) ---')
    for s, e in runs(diff):
        idxs = list(range(s, e + 1))
        print('  off %5d..%-5d (%d byte%s)  A=%s  B=%s  XOR=%s'
              % (s, e, len(idxs), '' if len(idxs) == 1 else 's',
                 hexs(A, idxs), hexs(B, idxs), hexs(X, idxs)))
        if len(idxs) <= 8:
            print('        little-endian A=%d  B=%d'
                  % (int.from_bytes(A[s:e + 1], 'little'),
                     int.from_bytes(B[s:e + 1], 'little')))
    print()

    if args.baseline:
        print('--- is this field at a default value? ---')
        extras = [load(p) for p in args.baseline]
        for s, e in runs(diff):
            vals = set()
            for f in extras:
                if len(f) > e:
                    vals.add(f[s:e + 1])
            same_everywhere = len(vals) == 1 and all(len(f) > e and f[s:e + 1] == A[s:e + 1]
                                                     for f in extras)
            print('  off %5d..%-5d : A=%s  B=%s | other profiles: %s'
                  % (s, e, hexs(A, list(range(s, e + 1))), hexs(B, list(range(s, e + 1))),
                     ' and '.join(sorted(v.hex() for v in vals)) or 'n/a'))
            if same_everywhere:
                print('        -> constant across every profile: almost certainly a default')
    return 0


if __name__ == '__main__':
    sys.exit(main())