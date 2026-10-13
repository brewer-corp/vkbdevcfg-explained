#!/usr/bin/env python3
"""Parse a USB HID report descriptor dumped from /sys/kernel/debug/hid/*/rdesc."""
import sys
from collections import OrderedDict

NB = {0: 0, 1: 1, 2: 2, 3: 4}

MAIN = {0x04: 'Input', 0x05: 'Output', 0x06: 'Feature', 0x08: 'Collection',
        0x09: 'EndCollection'}
GLOBAL = {0x0: 'UsagePage', 0x1: 'LogicalMin', 0x2: 'LogicalMax',
          0x3: 'PhysicalMin', 0x4: 'PhysicalMax', 0x5: 'UnitExp',
          0x6: 'Unit', 0x7: 'ReportSize', 0x8: 'ReportID', 0x9: 'ReportCount',
          0xA: 'Push', 0xB: 'Pop'}

PAGES = {0x00: 'Physical', 0x01: 'GenericDesktop', 0x02: 'Simulation',
         0x04: 'Keyboard', 0x05: 'Gamepad', 0x06: 'Keyboard', 0x07: 'Keyboard',
         0x08: 'LED', 0x09: 'Button', 0x0A: 'Consumer', 0x0B: 'Digitizer',
         0x0C: 'ConsumerCtrl', 0x0D: 'Generic', 0x0F: 'ConsumerCtr',
         0x11: 'ConsumerCtr', 0x12: 'ConsumerCtr', 0x20: 'Apple'}

GD = {0x00: 'Undefined', 0x01: 'Pointer', 0x02: 'Mouse', 0x04: 'Joystick',
      0x05: 'GamePad', 0x06: 'Keyboard', 0x08: 'MultiAxis', 0x09: 'Tablet',
      0x30: 'X', 0x31: 'Y', 0x32: 'Z', 0x33: 'Rx', 0x34: 'Ry', 0x35: 'Rz',
      0x36: 'Slider', 0x37: 'Dial', 0x38: 'Wheel', 0x39: 'HatSwitch',
      0x3A: 'CountedBuffer', 0x3B: 'Byte', 0x3C: 'Word', 0x3D: 'Date',
      0x3E: 'Dynamic', 0x3F: 'Reserved', 0x40: 'Vendor'}

LED_USAGES = {1: 'NumLock', 2: 'CapsLock', 3: 'ScrollLock', 4: 'Compose',
              5: 'Kana', 6: 'Power', 0x4B: 'GenericIndicator'}


class Item:
    __slots__ = ('kind', 'name', 'tag', 'val', 'idx', 'gl', 'loc', 'depth')

    def __init__(self, kind, name, tag, val, idx, gl, loc, depth):
        self.kind, self.name, self.tag, self.val = kind, name, tag, val
        self.idx, self.gl, self.loc, self.depth = idx, gl, loc, depth

    def __repr__(self):
        return '<%s %s @%d>' % (self.kind, self.name, self.idx)


def parse(data):
    i = 0
    n = len(data)
    gl = {'UsagePage': 0, 'LogicalMin': 0, 'LogicalMax': 0, 'ReportSize': 0,
          'ReportID': 0, 'ReportCount': 0, 'Unit': 0}
    stack = []
    loc = []
    items = []
    depth = 0
    while i < n:
        start = i
        b = data[i]
        i += 1
        if b == 0xFE:
            ln = data[i]
            i += 1 + ln
            continue
        size = (b >> 6) & 3
        typ = (b >> 4) & 3
        tag = b & 0x0F
        ln = NB[size]
        val = int.from_bytes(data[i:i + ln], 'little') if ln else 0
        i += ln
        if size == 3:
            ln = 4

        if typ == 0:  # Main
            if tag == 0x0A:   # Collection
                u = loc[0][1] if loc and loc[0][0] == 'Usage' else None
                items.append(Item('main', 'Collection', tag, val, start,
                                  dict(gl), list(loc), depth))
                depth += 1
                loc = []
                continue
            if tag == 0x0B:   # EndCollection
                items.append(Item('main', 'EndCollection', tag, val, start,
                                  dict(gl), [], depth - 1))
                depth = max(0, depth - 1)
                loc = []
                continue
            nm = MAIN.get(tag, 'Main%d' % tag)
            items.append(Item('main', nm, tag, val, start, dict(gl), list(loc), depth))
            loc = []
            continue
        if typ == 1:  # Global
            nm = GLOBAL.get(tag, 'G%d' % tag)
            if nm == 'Push':
                stack.append(dict(gl))
            elif nm == 'Pop':
                if stack:
                    gl = stack.pop()
            else:
                gl[nm] = val
            continue
        if typ == 2:  # Local
            loc.append((GLOBAL.get(tag, 'L%d' % tag) if False else
                        ('Usage' if tag == 0 else ('Min' if tag == 1 else
                         ('Max' if tag == 2 else 'L%d' % tag))), val))
            continue
    return items


def data_flags(val):
    f = []
    if val & 0x80: f.append('Cst')
    if val & 0x40: f.append('Var')
    if val & 0x20: f.append('Rel')
    if val & 0x10: f.append('Wrap')
    if val & 0x08: f.append('NonLin')
    if val & 0x04: f.append('NState')
    if val & 0x02: f.append('Pref')
    if val & 0x01: f.append('Null')
    return ','.join(f) or '-'


def summarize(items):
    reports = OrderedDict()
    for it in items:
        if it.kind != 'main' or it.name not in ('Input', 'Output', 'Feature'):
            continue
        rid = it.gl['ReportID']
        bits = it.gl['ReportSize'] * it.gl['ReportCount']
        key = (it.name, rid)
        a = reports.setdefault(key, {'bits': 0, 'n': 0, 'pages': OrderedDict()})
        a['bits'] += bits
        a['n'] += 1
        a['pages'][it.gl['UsagePage']] = a['pages'].get(it.gl['UsagePage'], 0) + 1
    return reports


def main():
    path = sys.argv[1]
    data = []
    for tok in open(path).read().split():
        try:
            data.append(int(tok, 16))
        except ValueError:
            pass
    items = parse(data)
    mode = sys.argv[2] if len(sys.argv) > 2 else 'summary'

    if mode == 'summary':
        print('descriptor: %d bytes, %d items' % (len(data), len(items)))
        print('\n== top-level collections ==')
        depth = 0
        for it in items:
            if it.name == 'Collection':
                if depth == 0:
                    u = it.loc[0][1] if it.loc else None
                    print('  page=%-14s usage=%s' %
                          (PAGES.get(it.gl['UsagePage'], '0x%04X' % it.gl['UsagePage']),
                           GD.get(u, u if u is not None else '-')))
                depth += 1
            elif it.name == 'EndCollection':
                depth -= 1

        reps = summarize(items)
        print('\n== reports ==')
        print('%-8s %-6s %-10s %-7s %s' % ('TYPE', 'ID', 'BYTES', 'ITEMS', 'USAGE PAGES'))
        for (typ, rid), a in reps.items():
            pgs = ', '.join('%s(%d)' % (PAGES.get(p, '0x%04X' % p), c)
                            for p, c in a['pages'].items())
            print('%-8s %-6s %-10s %-7d %s' % (typ, rid or '-',
                                                '%d (%db)' % (a['bits'], a['bits'] // 8),
                                                a['n'], pgs))
    elif mode == 'io':
        want = sys.argv[3] if len(sys.argv) > 3 else 'Input'
        print('== all %s items ==' % want)
        for it in items:
            if it.kind == 'main' and it.name == want:
                g = it.gl
                u = it.loc[0][1] if it.loc else None
                un = GD.get(u, str(u)) if g['UsagePage'] in (0x01, 0x09) else str(u)
                print('  ID=%-4s page=%-12s usage=%-14s size=%-3d count=%-4d '
                      'bits=%-5d flags=%s'
                      % (g['ReportID'] or '-',
                         PAGES.get(g['UsagePage'], '0x%04X' % g['UsagePage']),
                         un, g['ReportSize'], g['ReportCount'],
                         g['ReportSize'] * g['ReportCount'], data_flags(it.val)))
    elif mode == 'usagepage':
        pg = int(sys.argv[3], 0)
        print('== items on page 0x%04X (%s) ==' % (pg, PAGES.get(pg, '?')))
        for it in items:
            if it.gl['UsagePage'] == pg and it.loc:
                u = it.loc[0][1]
                if pg == 0x08:
                    nm = LED_USAGES.get(u, '0x%02X' % u)
                elif pg == 0x01:
                    nm = GD.get(u, '0x%02X' % u)
                else:
                    nm = '0x%04X' % u
                print('  %-8s ID=%-4s usage=%-14s size=%-3d count=%-4d'
                      % (it.name, it.gl['ReportID'] or '-', nm,
                         it.gl['ReportSize'], it.gl['ReportCount']))


if __name__ == '__main__':
    main()