#!/usr/bin/env python3
"""
Read VKB HID feature reports on Windows. READ-ONLY.

Uses only HidD_GetFeature -- the same documented API VKBDevCfg itself uses. It
never calls HidD_SetFeature or HidD_SetOutputReport, so it cannot write to the
stick. It opens the device with GENERIC_WRITE purely because HidD_GetFeature
requires read+write handle access.

Built on ctypes from the standard library: no third-party packages, matching
the rest of tools/. Using WinDLL(use_last_error=True) means the error codes
reported here are genuine, not stale.

    python3 vkb_feature_read.py                      # enumerate and sweep
    python3 vkb_feature_read.py --compare profile.cfg # is the device block inside the profile?
    python3 vkb_feature_read.py --path '\\?\HID#...'  # skip SetupAPI enumeration
"""
import argparse
import ctypes
import glob
import math
import os
import sys
from ctypes import wintypes

kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
hid = ctypes.WinDLL('hid.dll', use_last_error=True)
setupapi = ctypes.WinDLL('setupapi', use_last_error=True)

# ---------------------------------------------------------------- structs ---
GUID = ctypes.Structure  # opaque; we only ever copy bytes

class SP_DEVICE_INTERFACE_DATA(ctypes.Structure):
    _fields_ = [('cbSize', wintypes.DWORD),
                ('InterfaceClassGuid', ctypes.c_byte * 16),
                ('Flags', wintypes.DWORD),
                ('Reserved', ctypes.c_size_t)]

class HIDD_ATTRIBUTES(ctypes.Structure):
    _fields_ = [('Size', wintypes.ULONG),
                ('VendorID', ctypes.c_ushort),
                ('ProductID', ctypes.c_ushort),
                ('VersionNumber', ctypes.c_ushort)]

# ------------------------------------------------------------- prototypes ---
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value
GENERIC_READ, GENERIC_WRITE = 0x80000000, 0x40000000
FILE_SHARE_ALL = 0x00000003
OPEN_EXISTING = 3
DIGCF_PRESENT, DIGCF_DEVICEINTERFACE = 0x02, 0x10

kernel32.CreateFileW.restype = wintypes.HANDLE
kernel32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                 ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD,
                                 wintypes.HANDLE]
hid.HidD_GetHidGuid.restype = None
hid.HidD_GetHidGuid.argtypes = [ctypes.POINTER(ctypes.c_byte * 16)]
hid.HidD_GetPreparsedData.restype = wintypes.BOOLEAN
hid.HidD_GetPreparsedData.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.HANDLE)]
hid.HidD_FreePreparsedData.restype = wintypes.BOOLEAN
hid.HidD_FreePreparsedData.argtypes = [wintypes.HANDLE]
hid.HidD_GetAttributes.restype = wintypes.BOOLEAN
hid.HidD_GetAttributes.argtypes = [wintypes.HANDLE, ctypes.POINTER(HIDD_ATTRIBUTES)]
hid.HidD_GetFeature.restype = wintypes.BOOLEAN
hid.HidD_GetFeature.argtypes = [wintypes.HANDLE, wintypes.HANDLE, ctypes.c_ubyte,
                                ctypes.c_void_p, wintypes.ULONG]
setupapi.SetupDiGetClassDevsW.restype = wintypes.HANDLE
setupapi.SetupDiGetClassDevsW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR,
                                          wintypes.HWND, wintypes.DWORD,
                                          ctypes.POINTER(wintypes.HANDLE)]
setupapi.SetupDiEnumDeviceInterfaces.restype = wintypes.BOOLEAN
setupapi.SetupDiEnumDeviceInterfaces.argtypes = [wintypes.HANDLE, wintypes.DWORD,
                                                 ctypes.c_void_p, wintypes.DWORD,
                                                 ctypes.POINTER(SP_DEVICE_INTERFACE_DATA)]
setupapi.SetupDiGetDeviceInterfaceDetailW.restype = wintypes.BOOLEAN
setupapi.SetupDiGetDeviceInterfaceDetailW.argtypes = [wintypes.HANDLE,
                                                       ctypes.POINTER(SP_DEVICE_INTERFACE_DATA),
                                                       ctypes.c_void_p, wintypes.DWORD,
                                                       ctypes.POINTER(wintypes.DWORD),
                                                       ctypes.c_void_p]
setupapi.SetupDiDestroyDeviceInfoList.restype = wintypes.BOOLEAN
setupapi.SetupDiDestroyDeviceInfoList.argtypes = [wintypes.HANDLE]

err = lambda: ctypes.get_last_error()


def enumerate_hid_paths():
    """Enumerate every HID interface device path via SetupAPI."""
    guid = (ctypes.c_byte * 16)()
    hid.HidD_GetHidGuid(ctypes.byref(guid))
    di = wintypes.HANDLE()
    hset = setupapi.SetupDiGetClassDevsW(ctypes.byref(guid), None, None,
                                         DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
                                         ctypes.byref(di))
    if not hset or hset == INVALID_HANDLE_VALUE:
        print('SetupDiGetClassDevsW failed, win32=%d' % err())
        return []
    out = []
    try:
        for i in range(512):
            ifd = SP_DEVICE_INTERFACE_DATA()
            ifd.cbSize = ctypes.sizeof(SP_DEVICE_INTERFACE_DATA)
            if not setupapi.SetupDiEnumDeviceInterfaces(hset, 0, ctypes.byref(guid), i,
                                                        ctypes.byref(ifd)):
                break
            need = wintypes.DWORD(0)
            setupapi.SetupDiGetDeviceInterfaceDetailW(hset, ctypes.byref(ifd), None, 0,
                                                      ctypes.byref(need), None)
            if not need.value:
                continue
            buf = ctypes.create_string_buffer(need.value)
            if not setupapi.SetupDiGetDeviceInterfaceDetailW(hset, ctypes.byref(ifd), buf,
                                                             need.value,
                                                             ctypes.byref(need), None):
                print('  detail[%d] failed win32=%d' % (i, err()))
                continue
            # DevicePath sits after cbSize; its value tells us the padding:
            # 8 on x64, 6 on x86.
            cbsize = int.from_bytes(buf.raw[:4], 'little')
            path = ctypes.wstring_at(ctypes.cast(buf, ctypes.c_void_p).value + cbsize)
            out.append(path)
    finally:
        setupapi.SetupDiDestroyDeviceInfoList(hset)
    return out


def registry_paths():
    """Fallback: build interface paths from the HID enum keys."""
    import winreg
    hid_guid = '{4d1e55b2-f16f-11cf-88cb-001111000030}'
    root = r'SYSTEM\CurrentControlSet\Enum\HID'
    out = []
    try:
        k = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, root)
    except OSError:
        return out
    with k:
        i = 0
        while True:
            try:
                vp = winreg.EnumKey(k, i)
            except OSError:
                break
            i += 1
            if not vp.upper().startswith('VID_231D'):
                continue
            with winreg.OpenKey(k, vp) as vk:
                j = 0
                while True:
                    try:
                        inst = winreg.EnumKey(vk, j)
                    except OSError:
                        break
                    j += 1
                    out.append(r'\\?\HID#%s#%s#%s' % (vp, inst, hid_guid))
    return out


def open_hid(path):
    for access in (GENERIC_READ | GENERIC_WRITE, GENERIC_READ, 0):
        h = kernel32.CreateFileW(path, access, FILE_SHARE_ALL, None,
                                 OPEN_EXISTING, 0, None)
        if h and h != INVALID_HANDLE_VALUE:
            return h
    return None


def read_feature(h, ppd, rid, length):
    buf = (ctypes.c_ubyte * length)()
    if hid.HidD_GetFeature(h, ppd, rid, buf, length):
        return bytes(buf)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--path', help='a specific HID interface path')
    ap.add_argument('--vid', type=lambda s: int(s, 0), default=0x231D)
    ap.add_argument('--pid', type=lambda s: int(s, 0), default=None,
                    help='default: accept any PID')
    ap.add_argument('--reports', default='0x59,0x58,0x01,0x00',
                    help='comma-separated report IDs to try')
    ap.add_argument('--lengths', default='128,127,64,63',
                    help='comma-separated lengths to try')
    ap.add_argument('--compare', action='append', default=[],
                    help='search each dump verbatim inside this .cfg')
    ap.add_argument('--outdir', default='.')
    args = ap.parse_args()

    want_pid = args.pid
    reports = [int(x, 0) for x in args.reports.split(',') if x.strip()]
    lengths = [int(x) for x in args.lengths.split(',') if x.strip()]

    paths = [args.path] if args.path else enumerate_hid_paths()
    if not paths:
        print('SetupAPI enumeration returned nothing; falling back to the registry.')
        paths = registry_paths()
    print('HID interface paths found: %d' % len(paths))

    cfg = {}
    for p in args.compare:
        cfg[p] = open(p, 'rb').read()

    dumps = []
    for path in paths:
        h = open_hid(path)
        if not h:
            print('  open FAIL win32=%d  %s' % (err(), path))
            continue
        ppd = wintypes.HANDLE()
        if not hid.HidD_GetPreparsedData(h, ctypes.byref(ppd)):
            print('  preparsed FAIL win32=%d  %s' % (err(), path))
            kernel32.CloseHandle(h)
            continue
        attr = HIDD_ATTRIBUTES()
        attr.Size = ctypes.sizeof(HIDD_ATTRIBUTES)
        ok = hid.HidD_GetAttributes(ppd, ctypes.byref(attr))
        print('  VID=%04X PID=%04X bcdDevice=%04X attrs=%s  %s'
              % (attr.VendorID, attr.ProductID, attr.VersionNumber, bool(ok), path))
        if attr.VendorID == args.vid and (want_pid is None or attr.ProductID == want_pid):
            for rid in reports:
                for ln in lengths:
                    data = read_feature(h, ppd, rid, ln)
                    if data is None:
                        continue
                    print('    *** HidD_GetFeature(0x%02X, len=%d) OK  distinct=%d/256'
                          % (rid, ln, len(set(data))))
                    fn = os.path.join(args.outdir, 'vkb_feature_%02X_%d.bin' % (rid, ln))
                    with open(fn, 'wb') as fh:
                        fh.write(data)
                    print('        saved %s' % fn)
                    print('        ' + hexdump(data, 128))
                    dumps.append((rid, ln, data))
        hid.HidD_FreePreparsedData(ppd)
        kernel32.CloseHandle(h)

    print('\nsuccessful feature reads: %d' % len(dumps))
    if not dumps:
        print('No feature report could be read on any interface.')
        return 1

    for rid, ln, data in dumps:
        if rid != 0x59:
            continue
        for path, blob in cfg.items():
            print('\n--- is report 0x59 (%d bytes) inside %s? ---' % (ln, path))
            exact = blob.find(data)
            if exact >= 0:
                print('    FOUND VERBATIM at byte offset %d (block %d of 128)'
                      % (exact, exact // 128))
                print('    => the .cfg stores the device\'s own encrypted config as-is.')
            else:
                print('    not present verbatim.')
                n = 32
                best = (0, None)
                for i in range(0, len(blob) - n):
                    m = sum(1 for a, b in zip(data[:n], blob[i:i + n]) if a == b)
                    if m > best[0]:
                        best = (m, i)
                print('    best %d/%d byte match at offset %d (chance ~ %.1f)'
                      % (best[0], n, best[1] if best[1] is not None else -1, n / 256.0))
                print('    => the .cfg is NOT a verbatim copy of the device block.')
    return 0


def hexdump(b, limit):
    lines = []
    for off in range(0, min(len(b), limit), 16):
        row = b[off:off + 16]
        lines.append('  %04x  %-47s  %s' % (
            off, ' '.join('%02x' % c for c in row),
            ''.join(chr(c) if 32 <= c < 127 else '.' for c in row)))
    return '\n        '.join(lines)


if __name__ == '__main__':
    sys.exit(main())