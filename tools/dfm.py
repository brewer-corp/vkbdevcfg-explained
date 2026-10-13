#!/usr/bin/env python3
"""Decode Delphi binary DFM (TPF0) streams found in a PE resource section."""
import struct, sys, os, io

# Delphi TValueType enum (exact ordinals)
(VNULL, VLIST, VINT8, VINT16, VINT32, VEXT, VSTRING, VID,
 VFALSE, VTRUE, VBIN, VSET, VLSTRING, VNIL, VCOLL, VSINGLE,
 VCURR, VDATE, VWSTRING, VINT64, VUTF8, VDOUBLE) = list(range(22))


class R:
    def __init__(self, b):
        self.b = b
        self.i = 0

    def u8(self):
        v = self.b[self.i]
        self.i += 1
        return v

    def raw(self, n):
        v = self.b[self.i:self.i + n]
        self.i += n
        return v

    def u16(self):
        v = struct.unpack_from('<H', self.b, self.i)[0]
        self.i += 2
        return v

    def i16(self):
        v = struct.unpack_from('<h', self.b, self.i)[0]
        self.i += 2
        return v

    def u32(self):
        v = struct.unpack_from('<I', self.b, self.i)[0]
        self.i += 4
        return v

    def i32(self):
        v = struct.unpack_from('<i', self.b, self.i)[0]
        self.i += 4
        return v

    def f64(self):
        v = struct.unpack_from('<d', self.b, self.i)[0]
        self.i += 8
        return v

    def f80(self):
        self.i += 10
        return '<extended>'

    def s(self):
        """Pascal short string."""
        n = self.u8()
        return self.raw(n).decode('latin1')

    def lstr(self):
        n = self.u32()
        return self.raw(n).decode('utf-8', 'replace')

    def wstr(self):
        n = self.u32()
        return self.raw(n * 2).decode('utf-16le', 'replace')

    def eof(self):
        return self.i >= len(self.b)


SIMPLE = {VINT8: 'i8', VINT16: 'i16', VINT32: 'i32', VEXT: 'f80',
          VSTRING: 'str', VID: 'ident', VFALSE: 'false', VTRUE: 'true',
          VBIN: 'bin', VSET: 'set', VSINGLE: 'f32', VCURR: 'curr',
          VDATE: 'date', VWSTRING: 'wstr', VINT64: 'i64',
          VUTF8: 'utf8', VDOUBLE: 'f64'}


def read_value(r, t, indent, out, depth=0):
    if t in (VSTRING, VID):
        v = r.s()
    elif t == VINT8:
        v = r.u8()
    elif t == VINT16:
        v = r.i16()
    elif t == VINT32:
        v = r.i32()
    elif t == VINT64:
        v = struct.unpack_from('<q', r.raw(8))[0]
    elif t == VEXT:
        v = r.f80()
    elif t == VSINGLE:
        v = round(struct.unpack_from('<f', r.raw(4))[0], 6)
    elif t == VDOUBLE:
        v = r.f64()
    elif t == VFALSE:
        v = False
    elif t == VTRUE:
        v = True
    elif t == VLIST:
        # vaList = sequence of typed values, terminated by a zero type byte
        v = []
        while r.b[r.i] != 0:
            t2 = r.u8()
            v.append(read_value(r, t2, indent, out, depth + 1))
        r.i += 1
    elif t == VNULL:
        v = 'nil'
    elif t == VLSTRING:
        v = r.lstr()
    elif t == VWSTRING:
        v = r.wstr()
    elif t == VUTF8:
        v = r.lstr()
    elif t == VDATE:
        v = '<date>'
    elif t == VCURR:
        v = '<currency>'
    elif t == VBIN:
        n = r.u32()
        b = r.raw(n)
        try:
            s = b.decode('utf-8')
            v = repr(s) if all(32 <= ord(c) < 127 or c in '\r\n\t' for c in s) else '<binary %d>' % n
        except Exception:
            v = '<binary %d>' % n
    elif t == VSET:
        items = []
        while r.b[r.i] != 0:
            items.append(r.s())
        r.i += 1
        v = items
    elif t == VCOLL:
        # item = flag byte (bit0 = has properties, bit1 = has children);
        # collection terminated by a zero flag byte.
        v = []
        while r.b[r.i] != 0:
            flags = r.u8()
            item = {'class': '<item>', 'name': '', 'props': [], 'children': []}
            if flags & 1:
                while r.b[r.i] != 0:
                    pn = r.s()
                    tt = r.u8()
                    item['props'].append((pn, read_value(r, tt, indent, out, depth + 1)))
                r.i += 1
            if flags & 2:
                while r.b[r.i] != 0:
                    item['children'].append(read_component(r, indent + '    ', depth + 1))
                r.i += 1
            v.append(item)
        r.i += 1
    else:
        v = '<type %d>' % t
    return v


def read_component(r, indent, depth=0):
    cls = r.s()
    name = r.s()
    props = []
    while True:
        if r.b[r.i] == 0:
            r.i += 1
            break
        pname = r.s()
        if pname == '':
            break
        t = r.u8()
        val = read_value(r, t, indent, props, depth)
        props.append((pname, val))
    kids = []
    while True:
        if r.b[r.i] == 0:
            r.i += 1
            break
        kids.append(read_component(r, indent + '  ', depth + 1))
    return {'class': cls, 'name': name, 'props': props, 'children': kids}


def render(c, indent='', out=None):
    if out is None:
        out = []
    p = dict(c['props'])
    label = p.get('Caption') or p.get('Text') or p.get('Hint') or ''
    head = '%s%s %s' % (indent, c['class'], c['name'])
    if label:
        head += '  "%s"' % (label if isinstance(label, str) else str(label))
    out.append(head)
    for k, v in c['props']:
        if k in ('Caption', 'Text', 'Hint'):
            continue
        if isinstance(v, list):
            if v and isinstance(v[0], str):
                out.append('%s  .%s = [%s]' % (indent, k, ' '.join(v)))
            continue
        if isinstance(v, str):
            sv = v if len(v) <= 120 else v[:117] + '...'
            out.append('%s  .%s = %s' % (indent, k, sv))
        elif isinstance(v, bool) or isinstance(v, (int, float)):
            out.append('%s  .%s = %s' % (indent, k, v))
    for ch in c['children']:
        render(ch, indent + '  ', out)
    return out


def decode(blob):
    assert blob[:4] == b'TPF0'
    r = R(blob)
    r.i = 4
    root = read_component(r, '')
    return root