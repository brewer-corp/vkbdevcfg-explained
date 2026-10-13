#!/usr/bin/env python3
"""
Probe HIDIOCGFEATURE on the VKB device across report ids and lengths.

READ-ONLY. Every call is a GET_REPORT control transfer; nothing is written.
Purpose: find which (report_id, length) combinations the device/driver will
answer, so we can tell "device refuses" apart from "wrong framing".
"""
import os
import sys
import errno
import fcntl
import array

DEV = '/dev/hidraw0'


def _ioc(direction, typ, nr, size):
    return (direction << 30) | (size << 16) | (ord(typ) << 8) | nr


# hidraw.h: HIDIOCGFEATURE uses _IOC_WRITE (the G/S naming is inverted).
GFEATURE_NR = 0x02


def try_get(fd, rid, length):
    buf = array.array('B', bytes([rid]) + bytes(length - 1))
    fcntl.ioctl(fd, _ioc(1, 'H', GFEATURE_NR, length), buf, True)
    return bytes(buf)


def main():
    fd = os.open(DEV, os.O_RDONLY)
    try:
        print('%-8s %-8s %s' % ('report', 'length', 'result'))
        print('-' * 60)
        for rid in (0x59, 0x58, 0x01, 0x08, 0x0b, 0x0c, 0x00, 0xff):
            for length in (129, 128, 65, 64):
                try:
                    b = try_get(fd, rid, length)
                    nz = sum(1 for x in b[1:] if x)
                    print('0x%02x     %-8d OK  %d non-zero bytes  %s'
                          % (rid, length, nz, b[:16].hex()))
                except OSError as e:
                    print('0x%02x     %-8d %s (%d)'
                          % (rid, length, e.strerror, e.errno))
                except Exception as e:
                    print('0x%02x     %-8d %s' % (rid, length, e))
        print()
        print('reference: EINVAL=%d ENOTTY=%d ENODEV=%d EPIPE=%d EFAULT=%d'
              % (errno.EINVAL, errno.ENOTTY, errno.ENODEV,
                 errno.EPIPE, errno.EFAULT))
    finally:
        os.close(fd)


if __name__ == '__main__':
    main()