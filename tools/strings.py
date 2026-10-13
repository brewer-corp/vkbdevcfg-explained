#!/usr/bin/env python3
"""Clean ASCII/UTF-16 string dump, filtering out embedded image/document blobs."""
import re, sys

path = sys.argv[1]
d = open(path, 'rb').read()

BAD = ('<', '>', 'xmlns', 'rdf:', '<?xpacket', '.pdf', 'Photoshop')


def ok(s):
    if len(s) < 4:
        return False
    if any(b in s for b in BAD):
        return False
    # printable-ish ratio
    printable = sum(1 for c in s if 32 <= ord(c) < 127)
    return printable / len(s) > 0.95


a = set()
for m in re.finditer(rb'[\x20-\x7e]{4,}', d):
    s = m.group(0).decode('latin1')
    if ok(s):
        a.add(s)

u = set()
for m in re.finditer(rb'(?:[\x20-\x7e]\x00){4,}', d):
    s = m.group(0).decode('utf-16le')
    if ok(s):
        u.add(s)

out = sorted(a) + ['--- UTF16 ---'] + sorted(u)
open('/tmp/clean_strings.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('ascii: %d  utf16: %d  -> /tmp/clean_strings.txt' % (len(a), len(u)))