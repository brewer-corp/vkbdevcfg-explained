#!/usr/bin/env python3
"""Extract every DFM form from VKBDevCfg-C.exe into readable text + JSON."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dfm as D
from peutil import dfm_blobs

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'forms')
os.makedirs(OUT, exist_ok=True)

d, blobs = dfm_blobs()

index = []
for i, (off, size) in enumerate(blobs):
    blob = d[off:off + size]
    root = None
    pad = 0
    for pad in range(0, 6):
        r = D.R(blob + b'\0' * pad)
        r.i = 4
        try:
            root = D.read_component(r, '')
            break
        except Exception:
            continue
    if root is None:
        print('  !! failed to parse blob %d (%d bytes)' % (i, size))
        continue
    name = root['name'] or 'form'
    lines = D.render(root)
    fname = '%02d_%s.txt' % (i, name)
    with open(os.path.join(OUT, fname), 'w', encoding='utf-8') as f:
        f.write('; VKBDevCfg-C form: %s (%s)\n; blob %d, %d bytes, pad %d\n\n'
                % (name, root['class'], i, size, pad))
        f.write('\n'.join(lines) + '\n')
    index.append({
        'blob': i, 'name': name, 'class': root['class'], 'bytes': size,
        'pad': pad, 'top_children': len(root['children']), 'file': fname,
    })

with open(os.path.join(OUT, '_index.json'), 'w', encoding='utf-8') as f:
    json.dump(index, f, indent=2)

with open(os.path.join(OUT, '_index.tsv'), 'w', encoding='utf-8') as f:
    f.write('blob\tname\tclass\tbytes\tpad\ttop_children\tfile\n')
    for r in index:
        f.write('%d\t%s\t%s\t%d\t%d\t%d\t%s\n' % (
            r['blob'], r['name'], r['class'], r['bytes'], r['pad'],
            r['top_children'], r['file']))

print('extracted %d forms -> %s' % (len(index), OUT))
for r in index:
    print('  %2d  %-26s %-18s %9d b  top=%d' % (
        r['blob'], r['name'], r['class'], r['bytes'], r['top_children']))