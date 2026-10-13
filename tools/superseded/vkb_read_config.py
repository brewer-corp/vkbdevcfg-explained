#!/usr/bin/env python3
"""
VKB config READ harness (Linux, hidraw).

READ-ONLY. Performs exactly one operation: a HID GET_REPORT(Feature) control
transfer for report ID 0x59 - the same read that VKBDevCfg's "Get" button does.

    sudo python3 vkb_read_config.py /dev/hidraw0
    sudo python3 vkb_read_config.py /dev/hidraw0 --loop 5   # poll every 5s
    sudo python3 vkb_read_config.py /dev/hidraw0 --diff 10  # 10 reads, show change

Nothing is ever written to the device. This script contains no code path that
can send a SET_REPORT; if you add one, you are on your own.

Requires the hid-generic driver bound (it is, via hidraw).
"""
import os
import sys
import time
import errno

FEATURE_RPT_ID = 0x59
FEATURE_LEN = 129          # 128 payload bytes + 1 report-ID byte


def _ioc(direction, typ, nr, size):
    """Linux _IOC encoding."""
    if size > 0xFFFF:
        raise ValueError('size too big')
    return (direction << 30) | (size << 16) | (ord(typ) << 8) | nr


IOC_NONE = 0
IOC_WRITE = 1
IOC_READ = 2

# NOTE: hidraw.h inverts the direction flags relative to what the names
# suggest -- GET uses _IOC_WRITE and SET uses _IOC_READ. Getting this
# backwards yields EINVAL.
#   #define HIDIOCGFEATURE(len) _IOC(_IOC_WRITE, 'H', 0x02, len)
#   #define HIDIOCSFEATURE(len) _IOC(_IOC_READ,  'H', 0x03, len)
HIDIOCGFEATURE_NR = 0x02


def gfeature_multi(fd, report_id, length):
    """GET_REPORT(Feature) via HIDIOCGFEATURE.

    Python's fcntl.ioctl needs an object exposing a *writable* buffer
    protocol, so we use array.array rather than bytearray.
    """
    import fcntl
    import array
    buf = array.array('B', bytes([report_id]) + bytes(length - 1))
    fcntl.ioctl(fd, _ioc(IOC_WRITE, 'H', HIDIOCGFEATURE_NR, length), buf, True)
    return bytes(buf)


def dump(b, width=16):
    for i in range(0, len(b), width):
        row = b[i:i + width]
        hexs = ' '.join('%02x' % c for c in row)
        asc = ''.join(chr(c) if 32 <= c < 127 else '.' for c in row)
        print('  %04x  %-*s  %s' % (i, width * 3, hexs, asc))


def main():
    args = [a for a in sys.argv[1:]]
    dev = '/dev/hidraw0'
    if args and args[0].startswith('/dev'):
        dev = args.pop(0)
    loop = 0
    diff = 0
    while args:
        if args[0] == '--loop':
            loop = int(args[1]); args = args[2:]
        elif args[0] == '--diff':
            diff = int(args[1]); args = args[2:]
        else:
            print('unknown arg', args[0]); sys.exit(2)

    fd = os.open(dev, os.O_RDONLY)
    print('opened %s read-only' % dev)
    try:
        first = None
        n = diff or 1
        for i in range(n):
            if loop:
                time.sleep(loop)
            try:
                b = gfeature_multi(fd, FEATURE_RPT_ID, FEATURE_LEN)
            except OSError as e:
                if e.errno == errno.ENOTTY:
                    print('ENOTTY - driver does not support feature reports on this node.')
                    print('Try the USB node instead, or bind hid-generic explicitly.')
                    sys.exit(3)
                raise
            print('\n--- read %d ---' % (i + 1))
            dump(b)
            if first is None:
                first = b
            else:
                diffs = [(j, first[j], b[j]) for j in range(len(b)) if first[j] != b[j]]
                if diffs:
                    print('  changes vs first read:')
                    for j, a, c in diffs[:64]:
                        print('    byte %3d: 0x%02x -> 0x%02x' % (j, a, c))
                else:
                    print('  (identical to first read)')
    finally:
        os.close(fd)
    print('\nread-only session complete; nothing was written to the device.')


if __name__ == '__main__':
    main()