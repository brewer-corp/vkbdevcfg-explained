#!/usr/bin/env python3
"""
Read the VKB config feature report (0x59) by temporarily moving the device
from the built-in `usbhid` driver onto `hid-generic`.

Why: on this kernel both standard Linux HID paths are blocked —
  * hidraw HIDIOCGFEATURE on `usbhid`  -> EINVAL for every report id/length
  * usbfs USBDEVFS_CONTROL              -> ENOTTY for every ioctl
`hid-generic` routes feature requests through the HID core's raw-request path,
which issues a real GET_REPORT control transfer, so it is worth trying.

HOST-SIDE ONLY. No firmware write, no SET_REPORT, no SET_FEATURE. The device's
configuration is never modified. Driver binding is restored in a finally block.

If this is interrupted, restore with:
    echo 3-1:1.0 | sudo tee /sys/bus/usb/drivers/usbhid/bind
"""
import os
import sys
import glob
import time
import fcntl
import array
import ctypes

VID, PID = 0x231d, 0x0200
FEATURE_RPT_ID = 0x59
FEATURE_LEN = 128
IFNAME = '3-1:1.0'


def _ioc(d, t, n, s):
    return (d << 30) | (s << 16) | (ord(t) << 8) | n


# hidraw.h inverts G/S direction flags: HIDIOCGFEATURE uses _IOC_WRITE.
GFEATURE = lambda ln: _ioc(1, 'H', 0x02, ln)


def raw_nodes():
    return sorted(glob.glob('/sys/class/hidraw/hidraw*'))


def node_for_vkb():
    """hidraw node whose uevent names our VID:PID."""
    for n in raw_nodes():
        try:
            ue = open(n + '/device/uevent').read()
        except Exception:
            continue
        if 'HID_ID=0003:%08X:%08X' % (VID, PID) in ue.upper():
            return n
    return None


def gfeature(node, rid, length):
    fd = os.open(node, os.O_RDONLY)
    try:
        buf = array.array('B', bytes([rid]) + bytes(length - 1))
        fcntl.ioctl(fd, GFEATURE(length), buf, True)
        return bytes(buf)
    finally:
        os.close(fd)


def unbind_usbhid():
    p = '/sys/bus/usb/drivers/usbhid/unbind'
    if not os.path.exists(p):
        return False
    cur = os.path.realpath('/sys/bus/usb/devices/%s/driver' % IFNAME)
    if 'usbhid' not in cur:
        return False
    with open(p, 'w') as f:
        f.write(IFNAME)
    time.sleep(0.8)
    return True


def bind_usbhid():
    with open('/sys/bus/usb/drivers/usbhid/bind', 'w') as f:
        f.write(IFNAME)
    time.sleep(0.8)


def bind_hid_generic():
    drvdir = None
    for cand in glob.glob('/sys/bus/hid/drivers/hid-generic'):
        drvdir = cand
    if not drvdir:
        raise RuntimeError('hid-generic driver directory not present')
    # NOTE: current kernels reject space-separated new_id strings with EINVAL
    # ("we do not support module aliases ourselves"); the format is
    # "vvvv:pppp:ssss".
    with open(drvdir + '/new_id', 'w') as f:
        f.write('%04x:%04x\n' % (VID, PID))
    time.sleep(1.2)


def unbind_hid_generic():
    for cand in glob.glob('/sys/bus/hid/drivers/hid-generic/%04x:%04x' % (VID, PID)):
        with open('/sys/bus/hid/drivers/hid-generic/unbind', 'w') as f:
            f.write('0003:%04X:%04X' % (VID, PID))
        time.sleep(0.6)
        return True
    return False


def dump(b, width=16):
    for i in range(0, len(b), width):
        row = b[i:i + width]
        print('  %04x  %-*s  %s' % (
            i, width * 3, ' '.join('%02x' % c for c in row),
            ''.join(chr(c) if 32 <= c < 127 else '.' for c in row)))


def main():
    print('hidraw nodes before:', raw_nodes())
    node = node_for_vkb()
    print('node for %04x:%04x -> %s' % (VID, PID, node))

    moved = False
    usbhid_unbound = False
    try:
        if unbind_usbhid():
            usbhid_unbound = True
            print('unbound usbhid -> driver now:',
                  os.path.basename(os.path.realpath(
                      '/sys/bus/usb/devices/%s/driver' % IFNAME)) or 'none')
        bind_hid_generic()
        moved = True
        drv = os.path.basename(os.path.realpath(
            '/sys/bus/usb/devices/%s/driver' % IFNAME))
        print('bound to: %s' % drv)

        node2 = node_for_vkb()
        print('hidraw node now: %s  (nodes: %s)' % (node2, raw_nodes()))
        if not node2:
            print('no hidraw node after rebind')
            return 1

        for rid in (0x59,):
            for length in (129, 128):
                try:
                    b = gfeature(node2, rid, length)
                    print('\n=== GET_REPORT Feature id=0x%02x len=%d OK ==='
                          % (rid, length))
                    dump(b)
                    open('/tmp/vkb_feature_%02x.bin' % rid, 'wb').write(b)
                    print('saved /tmp/vkb_feature_%02x.bin' % rid)
                    return 0
                except OSError as e:
                    print('  id=0x%02x len=%-4d %s (%d)'
                          % (rid, length, e.strerror, e.errno))
        return 1
    finally:
        if moved:
            try:
                unbind_hid_generic()
                bind_usbhid()
                print('\nrestored -> driver:',
                      os.path.basename(os.path.realpath(
                          '/sys/bus/usb/devices/%s/driver' % IFNAME)))
            except Exception as e:
                print('\n!! RESTORE FAILED: %s' % e)
                print('   fix: echo %s | sudo tee '
                      '/sys/bus/usb/drivers/usbhid/bind' % IFNAME)


if __name__ == '__main__':
    sys.exit(main() or 0)