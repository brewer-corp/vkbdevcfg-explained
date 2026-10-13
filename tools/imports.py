#!/usr/bin/env python3
"""Dump every imported function name from a PE, grouped by DLL."""
import struct, sys

EXE = sys.argv[1] if len(sys.argv) > 1 else 'VKBDevCfg/VKBDevCfg-C.exe'
d = open(EXE, 'rb').read()

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


def u16(o): return struct.unpack_from('<H', d, o)[0]
def u32(o): return struct.unpack_from('<I', d, o)[0]


def cstr(o):
    s = o
    while d[s]:
        s += 1
    return d[o:s].decode('latin1')


def imports(dir_index):
    rva, _sz = struct.unpack_from('<II', d, dd + dir_index * 8)
    base = r2o(rva)
    out = []
    p = base
    while True:
        olt, ts, fc, nameRva, fthunk = struct.unpack_from('<IIIII', d, p)
        p += 20
        if not nameRva:
            break
        dll = cstr(r2o(nameRva))
        thunk = r2o(olt or fthunk)
        fns = []
        step = 4
        while True:
            v = u32(thunk)
            if not v:
                break
            if v & 0x80000000:
                fns.append('#%d' % (v & 0xFFFF))
            else:
                ho = r2o(v)
                fns.append(cstr(ho + 2))
            thunk += step
        out.append((dll, fns))
    return out


allimp = []
for idx, label in ((1, 'IMPORTS'), (13, 'DELAY IMPORTS')):
    try:
        for dll, fns in imports(idx):
            allimp.append((label, dll, fns))
    except Exception as e:
        print('(%s failed: %s)' % (label, e))

KEY = ('crypt', 'hash', 'bcrypt', 'ncrypt', 'rtl', 'random', 'genrandom',
       'base64', 'compress', 'inflate', 'deflate')

for label, dll, fns in allimp:
    hits = [f for f in fns if any(k in f.lower() for k in KEY)]
    print('%-14s %-18s %4d imports' % (label, dll, len(fns)))
    if hits:
        print('      *** crypto/compression: %s' % ', '.join(hits))