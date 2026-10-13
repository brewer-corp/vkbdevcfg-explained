#!/usr/bin/env python3
"""Shared PE resource helpers for the VKB analysis scripts."""
import struct

EXE = 'VKBDevCfg/VKBDevCfg-C.exe'


def load(exe=EXE):
    d = open(exe, 'rb').read()
    pe = struct.unpack_from('<I', d, 0x3c)[0]
    nsec = struct.unpack_from('<H', d, pe + 6)[0]
    optsz = struct.unpack_from('<H', d, pe + 20)[0]
    opt = pe + 24
    dd = opt + 96
    secs = []
    off = opt + optsz
    for _ in range(nsec):
        nm = d[off:off + 8].rstrip(b'\0').decode('latin1')
        vs, va, rs, ptr = struct.unpack_from('<IIII', d, off + 8)
        secs.append((nm, va, vs, ptr, rs))
        off += 40

    def r2o(rva):
        for _n, va, vs, ptr, rs in secs:
            if va <= rva < va + max(vs, rs):
                return ptr + (rva - va)
        return None

    def u16(o):
        return struct.unpack_from('<H', d, o)[0]

    def u32(o):
        return struct.unpack_from('<I', d, o)[0]

    rr, _sz = struct.unpack_from('<II', d, dd + 16)
    BASE = r2o(rr)

    def ents(o):
        n = u16(o + 12) + u16(o + 14)
        out = []
        for i in range(n):
            p = o + 16 + i * 8
            out.append((u32(p), BASE + (u32(p + 4) & 0x7fffffff),
                        bool(u32(p + 4) & 0x80000000)))
        return out

    def walk(o, path=()):
        for n, so, isdir in ents(o):
            if isdir:
                yield from walk(so, path + (n,))
            else:
                yield (path + (n,), r2o(u32(so)), u32(so + 4))

    return d, secs, r2o, u16, u32, BASE, ents, walk


def dfm_blobs(exe=EXE):
    d, secs, r2o, u16, u32, BASE, ents, walk = load(exe)
    bl = [(o, s) for _p, o, s in walk(BASE) if o and d[o:o + 4] == b'TPF0']
    return d, sorted(bl, key=lambda x: -x[1])