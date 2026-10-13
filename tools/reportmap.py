#!/usr/bin/env python3
"""
Build an exact report map for the VKB Gladiator EVO R from the kernel's
annotated HID descriptor dump (/sys/kernel/debug/hid/*/rdesc).

Read-only: reads a text file, touches no hardware.
"""
import sys, re, json

GD = {0x00: 'Undefined', 0x01: 'Pointer', 0x02: 'Mouse', 0x04: 'Joystick',
      0x05: 'GamePad', 0x06: 'Keyboard', 0x08: 'MultiAxis', 0x09: 'Tablet',
      0x20: 'Reserved', 0x30: 'X', 0x31: 'Y', 0x32: 'Z', 0x33: 'Rx',
      0x34: 'Ry', 0x35: 'Rz', 0x36: 'Slider', 0x37: 'Dial', 0x38: 'Wheel',
      0x39: 'HatSwitch', 0x3B: 'Byte', 0x3C: 'Word', 0x3D: 'Date',
      0x3E: 'Dynamic', 0x40: 'Vendor'}
BUTTON = 'Button'


def parse(path):
    lines = open(path).read().split('\n')
    reports = {}
    cur = None
    field = None
    for L in lines:
        m = re.match(r'^  (INPUT|OUTPUT|FEATURE)\((\d+)\)\[', L)
        if m:
            cur = {'type': m.group(1), 'id': int(m.group(2)), 'fields': []}
            reports[(m.group(1), int(m.group(2)))] = cur
            field = None
            continue
        if cur is None:
            continue
        mf = re.match(r'^    Field\((\d+)\)', L)
        if mf:
            field = {'index': int(mf.group(1)), 'usages': [], 'page': None,
                     'size': 0, 'count': 0, 'offset': 0, 'flags': ''}
            cur['fields'].append(field)
            continue
        if field is None:
            continue
        mu = re.match(r'^\s+([A-Za-z_][\w]*)\.([\w]+)$', L)
        if mu:
            nm, val = mu.group(1), mu.group(2)
            try:
                u = int(val, 16)
                field['usages'].append(GD.get(u, hex(u)))
            except ValueError:
                field['usages'].append('%s.%s' % (nm, val))
            continue
        for pat, key in ((r'Usage\((\d+)\)', None),
                         (r'Report Size\((\d+)\)', 'size'),
                         (r'Report Count\((\d+)\)', 'count'),
                         (r'Report Offset\((\d+)\)', 'offset')):
            mm = re.search(pat, L)
            if mm:
                if key:
                    field[key] = int(mm.group(1))
                else:
                    field['page'] = int(mm.group(1))
                break
        mf2 = re.search(r'Flags\(([^)]*)\)', L)
        if mf2:
            field['flags'] = mf2.group(1).strip()
    return reports


def main():
    reports = parse(sys.argv[1])
    out = {}
    print('== VKB Gladiator EVO R - HID report map ==\n')
    for (typ, rid), r in sorted(reports.items(), key=lambda x: (x[0][0], x[0][1])):
        total = max((f['offset'] + f['size'] * f['count']) for f in r['fields']) \
            if r['fields'] else 0
        print('%s report ID 0x%02X  -  %d payload bytes (+1 ID byte = %d on the wire)'
              % (typ, rid, total // 8, total // 8 + 1))
        print('%-6s %-10s %-16s %-6s %-7s %-9s %s'
              % ('off', 'bits', 'usage', 'size', 'count', 'bytes', 'flags'))
        for f in r['fields']:
            u = ', '.join(f['usages'][:4]) or 'undefined'
            if len(f['usages']) > 4:
                u += ' ...'
            nb = f['size'] * f['count'] / 8.0
            print('%-6d %-10d %-16s %-6d %-7d %-9s %s'
                  % (f['offset'], f['size'] * f['count'], u[:16], f['size'],
                     f['count'], ('%g' % nb), f['flags']))
        print()
        out['%s_%02X' % (typ, rid)] = {
            'type': typ, 'id': rid, 'bytes': total // 8, 'fields': r['fields']}

    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w') as f:
            json.dump(out, f, indent=2)
        print('wrote', sys.argv[2])


if __name__ == '__main__':
    main()