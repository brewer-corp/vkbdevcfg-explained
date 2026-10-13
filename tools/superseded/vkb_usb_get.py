#!/usr/bin/env python3
"""
VKB config READ via usbfs, temporarily unbinding hid-generic.

WHAT THIS DOES AND WHY
----------------------
The kernel's hidraw layer on this box refuses HIDIOCGFEATURE outright (EINVAL
for every report id and length), and usbfs refuses USBDEVFS_CONTROL while a
kernel driver claims the interface (ENOTTY). The standard way to reach a HID
device directly is to unbind hid-generic for the duration of the transfer.

This changes HOST-SIDE DRIVER BINDING ONLY:
  * no firmware is written
  * no SET_REPORT / SET_FEATURE is ever sent
  * the device's own configuration is never touched
  * the joystick will vanish from the input layer for a few seconds and then
    come back

The rebind happens in a finally block and is verified afterwards, including on
error. If the script is interrupted the device can be restored with:
    sudo modprobe -r hid-generic && sudo modprobe hid-generic
"""
import os
import sys
import glob
import time
import fcntl
import ctypes

VID, PID = 0x231d, 0x0200
FEATURE_RPT_ID = 0x59
FEATURE_LEN = 128


class UsbCtlTransfer(ctypes.Structure):
    _fields_ = [
        ('requestType', ctypes.c_uint),
        ('request', ctypes.c_uint),
        ('value', ctypes.c_uint),
        ('index', ctypes.c_uint),
        ('data', ctypes.c_void_p),
        ('length', ctypes.c_uint),
        ('timeout', ctypes.c_uint),
    ]


def _ioc(d, t, n, s):
    return (d << 30) | (s << 16) | (ord(t) << 8) | n


USBDEVFS_CONTROL = _ioc(2, 'U', 0, ctypes.sizeof(UsbCtlTransfer))


def find_device():
    for dev in glob.glob('/sys/bus/usb/devices/*'):
        try:
            v = int(open(dev + '/idVendor').read().strip(), 16)
            p = int(open(dev + '/idProduct').read().strip(), 16)
        except Exception:
            continue
        if v == VID and p == PID:
            busnum = int(open(dev + '/busnum').read().strip())
            devnum = int(open(dev + '/devnum').read().strip())
            return dev, '/dev/bus/usb/%03d/%03d' % (busnum, devnum)
    return None, None


def bound_driver(sysfs):
    """Name of the kernel driver currently bound to interface 0."""
    base = os.path.basename(sysfs)
    for ifc in sorted(glob.glob(sysfs + ':%s' % '*')):
        link = os.path.realpath(ifc + '/driver')
        if link and os.path.exists(link):
            return os.path.basename(link), ifc
    return None, None


def unbind(sysfs):
    """Detach the HID driver from interface 0. Returns (driver, ifname) or None."""
    drv, ifc = bound_driver(sysfs)
    if not drv or not ifc:
        return None
    ifname = os.path.basename(ifc)
    with open('/sys/bus/usb/drivers/%s/unbind' % drv, 'w') as f:
        f.write(ifname)
    time.sleep(0.8)
    return drv, ifname


def rebind(drv, ifname):
    with open('/sys/bus/usb/drivers/%s/bind' % drv, 'w') as f:
        f.write(ifname)
    time.sleep(0.8)


def driver_bound(sysfs):
    drv, _ = bound_driver(sysfs)
    return drv


def get_report(fd, report_id, length, iface=0, timeout=5000, rtype=3):
    buf = ctypes.create_string_buffer(length)
    ct = UsbCtlTransfer()
    ct.requestType = 0xA1          # device-to-host | class | interface
    ct.request = 0x01              # GET_REPORT
    ct.value = (rtype << 8) | report_id
    ct.index = iface
    ct.data = ctypes.cast(buf, ctypes.c_void_p)
    ct.length = length
    ct.timeout = timeout
    fcntl.ioctl(fd, USBDEVFS_CONTROL, bytes(ct))
    return buf.raw[:length]


def dump(b, width=16):
    for i in range(0, len(b), width):
        row = b[i:i + width]
        print('  %04x  %-*s  %s' % (
            i, width * 3, ' '.join('%02x' % c for c in row),
            ''.join(chr(c) if 32 <= c < 127 else '.' for c in row)))


def main():
    sysfs, node = find_device()
    if not node:
        print('device not found')
        return 1
    print('device: %s -> %s' % (sysfs, node))
    drv_before = driver_bound(sysfs)
    print('driver bound before: %s' % drv_before)

    unbound = False
    fd = None
    try:
        if drv_before:
            unbound = unbind(sysfs)
            if unbound:
                print('unbound %s on %s -> driver now: %s'
                      % (unbound[0], unbound[1], driver_bound(sysfs)))
            else:
                print('unbind failed (driver still %s)' % driver_bound(sysfs))

        fd = os.open(node, os.O_RDWR)
        print('opened usbfs node\n')

        print('--- GET_REPORT(Feature) id=0x%02x len=%d ---'
              % (FEATURE_RPT_ID, FEATURE_LEN))
        b = get_report(fd, FEATURE_RPT_ID, FEATURE_LEN)
        dump(b)
        open('/tmp/vkb_feature_59.bin', 'wb').write(b)
        print('\nsaved /tmp/vkb_feature_59.bin')

    except OSError as e:
        print('transfer failed: %s (errno %d)' % (e.strerror, e.errno))
    finally:
        if fd is not None:
            os.close(fd)
        if unbound:
            try:
                rebind(unbound[0], unbound[1])
                print('\nrebound %s -> driver now: %s'
                      % (unbound[0], driver_bound(sysfs)))
            except Exception as e:
                print('\n!! REBIND FAILED: %s' % e)
                print('   restore with: sudo modprobe -r %s && '
                      'sudo modprobe %s' % (unbound, unbound))
    return 0


if __name__ == '__main__':
    sys.exit(main())