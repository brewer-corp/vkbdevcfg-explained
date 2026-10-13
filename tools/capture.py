#!/usr/bin/env python3
"""
Read-only capture of the VKB Gladiator EVO R.

STRICTLY PASSIVE: opens /dev/hidraw0 with O_RDONLY only, issues no control
transfers, writes nothing to the device. Move the stick while it runs to see
live axis/button traffic.
"""
import os, sys, select, time, struct, collections

DEV = sys.argv[1] if len(sys.argv) > 1 else '/dev/hidraw0'
SECONDS = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0

fd = os.open(DEV, os.O_RDONLY)
try:
    import fcntl
    import termios
    fl = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)
except Exception:
    pass

end = time.time() + SECONDS
byid = collections.defaultdict(lambda: {'n': 0, 'len': None, 'last': None})
samples = collections.defaultdict(list)
while time.time() < end:
    r, _, _ = select.select([fd], [], [], 0.2)
    if not r:
        continue
    try:
        buf = os.read(fd, 128)
    except BlockingIOError:
        continue
    if not buf:
        break
    rid = buf[0]
    e = byid[rid]
    e['n'] += 1
    e['len'] = len(buf)
    e['last'] = buf
    if len(samples[rid]) < 3:
        samples[rid].append(buf)

print('captured %d reports in %.1fs (read-only)\n' % (sum(v['n'] for v in byid.values()), SECONDS))
print('%-6s %-8s %-9s %s' % ('ID', 'COUNT', 'LENGTH', 'LAST (hex)'))
for rid in sorted(byid):
    e = byid[rid]
    print('0x%02x   %-8d %-9d %s' % (rid, e['n'], e['len'], e['last'].hex()))

# Decode report 0x01 (the axis/button report)
if 0x01 in byid:
    print('\n== Report ID 0x01 field map (from HID descriptor) ==')
    print('  X  : bytes 1-2   (uint16 LE, 0..4095)')
    print('  Y  : bytes 3-4   (uint16 LE, 0..4095)')
    print('  Rz : bytes 5-6   (uint16 LE, 0..2047)')
    print('  Z  : bytes 7-8   (uint16 LE, 0..2047)')
    print('  Rx : bytes 9-10  (uint16 LE, 0..4095)')
    print('  Ry : bytes 11-12 (uint16 LE, 0..4095)')
    print('  4 unused uint16 (bytes 13-20)')
    print('  128 button bits packed 1-per-bit (bytes 21-36)')
    print('  remaining bytes 37-62 = padding / status')
    print('\n== first samples of 0x01 ==')
    for s in samples[0x01]:
        print('  ', s.hex())
os.close(fd)