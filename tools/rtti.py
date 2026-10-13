#!/usr/bin/env python3
"""
Recover class and method names from a Delphi / C++Builder PE32 executable.

VCL classes carry a Delphi-style VMT even when the application is written in
C++Builder. This finds every VMT (the self-pointer at vmt-88 points back at the
VMT), then reads its class name, parent, instance size, published-method table
(name -> code address) and published-field table (name -> object offset).

For VKBDevCfg-C v0.93.89 that yields 1,667 classes and 1,277 named methods --
including all 471 event handlers of TMainForm, which is what turns
"FUN_0041133c" into "TMainForm::btnReadParamClick".

    python3 rtti.py VKBDevCfg/VKBDevCfg-C.exe rtti.json [symbols.tsv]

symbols.tsv (address, kind, name) is the input for ghidra-scripts/ApplyNames.java.
"""
import struct, sys, json, re
p = sys.argv[1]
d = open(p, 'rb').read()
pe = struct.unpack_from('<I', d, 0x3c)[0]
nsec = struct.unpack_from('<H', d, pe + 6)[0]; optsz = struct.unpack_from('<H', d, pe + 20)[0]
opt = pe + 24; base = struct.unpack_from('<I', d, opt + 28)[0]
secs = []
for i in range(nsec):
    o = opt + optsz + i * 40
    name = d[o:o + 8].rstrip(b'\0').decode(); vs, va, rs, ro = struct.unpack_from('<IIII', d, o + 8)
    secs.append((name, base + va, vs, ro, rs))
def off(va):
    for n, a, vs, ro, rs in secs:
        if a <= va < a + rs: return va - a + ro
    return None
def u32(va):
    o = off(va); return struct.unpack_from('<I', d, o)[0] if o is not None and o + 4 <= len(d) else None
def u16(va):
    o = off(va); return struct.unpack_from('<H', d, o)[0] if o is not None else None
def u8(va):
    o = off(va); return d[o] if o is not None else None
def sstr(va):
    o = off(va)
    if o is None: return None
    n = d[o]; s = d[o + 1:o + 1 + n]
    try: return s.decode('utf-8')
    except: return None
ident = re.compile(r'^[A-Za-z_@$][\w@$<>,.: \[\]&*]*$')
text = [s for s in secs if s[0] == '.text'][0]
tlo, thi = text[1], text[1] + text[4]
classes = {}
for name, a, vs, ro, rs in secs:
    if name not in ('.text', '.data'): continue
    for o in range(ro, ro + rs - 92, 4):
        va = a + (o - ro)
        if struct.unpack_from('<I', d, o)[0] != va + 88: continue
        vmt = va + 88
        cn = u32(vmt - 56)
        if cn is None: continue
        nm = sstr(cn)
        if not nm or not ident.match(nm): continue
        isz = u32(vmt - 52); par = u32(vmt - 48)
        par = u32(par) if par else 0   # parent is ^TClass (pointer to pointer)
        classes[vmt] = dict(vmt=vmt, name=nm, size=isz, parent=par or 0, methods=[], fields=[],
                            mtab=u32(vmt - 64), ftab=u32(vmt - 68), typeinfo=u32(vmt - 72))
for vmt, c in classes.items():
    mt = c['mtab']
    if mt and off(mt) is not None:
        n = u16(mt); q = mt + 2
        for i in range(n):
            ln = u16(q); addr = u32(q + 2); nm = sstr(q + 6)
            if not ln or nm is None: break
            c['methods'].append((nm, addr)); q += ln
    ft = c['ftab']
    if ft and off(ft) is not None:
        n = u16(ft); ctab = u32(ft + 2); q = ft + 6
        for i in range(n):
            fo = u32(q); ti = u16(q + 4); nm = sstr(q + 6)
            if nm is None: break
            tname = None
            if ctab and off(ctab) is not None:
                cp = u32(ctab + 2 + 4 * ti)
                cv = u32(cp) if cp else None
                if cv in classes: tname = classes[cv]['name']
            c['fields'].append((nm, fo, tname)); q += 6 + 1 + len(nm.encode())
        # extended field table
        try:
            n2 = u16(q); q += 2
            for i in range(n2):
                fl = u8(q); tr = u32(q + 1); fo = u32(q + 5); nm = sstr(q + 9)
                if nm is None or not ident.match(nm): break
                q += 9 + 1 + len(nm.encode()); al = u16(q); q += al
                tn = None
                if tr and off(tr) is not None:
                    ti = u32(tr)
                    if ti and off(ti) is not None: tn = sstr(ti + 1)
                c.setdefault('xfields', []).append((nm, fo, tn))
        except Exception as e: pass
json.dump(sorted(classes.values(), key=lambda c: c['vmt']), open(sys.argv[2], 'w'), indent=0)
if len(sys.argv) > 3:
    seen = set()
    with open(sys.argv[3], 'w') as f:
        for c in sorted(classes.values(), key=lambda c: c['vmt']):
            f.write('%08x\tV\tVMT_%s\n' % (c['vmt'], c['name']))
            for n, a in c['methods']:
                if a not in seen:
                    seen.add(a)
                    f.write('%08x\tM\t%s::%s\n' % (a, c['name'], n))
print('classes', len(classes), 'with methods', sum(1 for c in classes.values() if c['methods']),
      'methods', sum(len(c['methods']) for c in classes.values()))
