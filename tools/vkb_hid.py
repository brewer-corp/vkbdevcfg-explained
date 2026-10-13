#!/usr/bin/env python3
"""
Read and write the configuration of a VKB NJoy32 device over HID, on Linux.

Implements the transport described in docs/PROTOCOL.md: long transfers over
feature report 0x59, the READ_CPUID token handshake, RC4 and both CRCs.

Reading is the default and cannot change the device. Writing replaces the whole
4096-byte parameter block in the stick's flash, after which the stick restarts
itself; it only happens with `write ... --yes`, and never without first saving
the current block. This file sends no short commands: it cannot reset the
stick to defaults, start a calibration or enter the bootloader.

Standard library only. Needs read/write access to the hidraw node (root, or a
udev rule granting it).

    sudo python3 vkb_hid.py info                 # token shape, firmware, CRC check
    sudo python3 vkb_hid.py read                 # -> vkb_feature_block.bin (plaintext)
    sudo python3 vkb_hid.py read -o my.bin --raw my.enc.bin
    sudo python3 vkb_hid.py read --ram           # the RAM copy instead of EEPROM
    sudo python3 vkb_hid.py write new.bin        # dry run: show what would change
    sudo python3 vkb_hid.py write new.bin --yes  # write, wait for restart, verify
    sudo python3 vkb_hid.py write profile.cfg --yes

Verified on a VKBsim Gladiator EVO R (231d:0200), firmware 2.20.C. Nothing else
has been tested; see docs/PROTOCOL.md before pointing this at other hardware.
"""
import argparse
import fcntl
import glob
import os
import struct
import sys
import time

from vkblib import (BLOCK_SIZE, CPUID_KEY, block_crc, block_crc_ok, cfg_decrypt,
                    crc16, firmware_version, fix_block_crc, rc4)

VKB_VID = 0x231D
REPORT_ID = 0x59
FEAT_LEN = 129                      # report id + 128
HDR_LEN = 8                         # A5/5A, cmd, size, addr, crc16
CMD_READ_CPUID = 0x0B
CMD_READ_EEPROM = 0x02              # the stored configuration
CMD_READ_RAM = 0x03                 # the configuration currently in effect
CMD_WRITE_EEPROM = 0x24
FLAG_LONG_READ = 0xC0
FLAG_LONG_WRITE = 0x80

# What the stick answers to the GET_REPORT that follows a long write (0x0040FDE4).
WRITE_STATUS = {
    0x0088A55A: 'block written',
    0x11A55A11: 'no new data',
    0x22222222: 'CRC error',
    0x31DEAD31: 'erase FLASH error',
    0x33DEAD33: 'write FLASH error',
    0x33A55A33: 'non-compatible profile',
}
STATUS_OK = 0x0088A55A


def _hidioc(nr, length):
    # hidraw.h declares both feature ioctls _IOC_READ|_IOC_WRITE.
    return 0xC0000000 | (length << 16) | (ord('H') << 8) | nr


HIDIOCSFEATURE = _hidioc(0x06, FEAT_LEN)
HIDIOCGFEATURE = _hidioc(0x07, FEAT_LEN)


# --------------------------------------------------------------- device ---
class StaleReply(IOError):
    """The device answered, but not to the request just sent."""


def find_devices():
    """hidraw nodes whose HID_ID names a VKB vendor id."""
    found = []
    for sysdir in sorted(glob.glob('/sys/class/hidraw/hidraw*')):
        try:
            uevent = open(os.path.join(sysdir, 'device', 'uevent')).read()
        except OSError:
            continue
        fields = dict(l.split('=', 1) for l in uevent.splitlines() if '=' in l)
        parts = fields.get('HID_ID', '').split(':')
        if len(parts) == 3 and int(parts[1], 16) == VKB_VID:
            found.append(('/dev/' + os.path.basename(sysdir),
                          int(parts[2], 16), fields.get('HID_NAME', '').strip()))
    return found


def long_write_frames(cmd, addr, data):
    """The frames of one long write, as built at 0x004E525C: an 8-byte header and
    120 payload bytes, then 128 payload bytes per frame, zero padded."""
    frames = []
    sent = 0
    while sent < len(data):
        frame = bytearray(FEAT_LEN)
        frame[0] = REPORT_ID
        if sent == 0:
            struct.pack_into('<BBHHH', frame, 1, 0xA5, cmd | FLAG_LONG_WRITE,
                             len(data), addr, crc16(data))
            room, at = FEAT_LEN - 1 - HDR_LEN, 1 + HDR_LEN
        else:
            room, at = FEAT_LEN - 1, 1
        chunk = data[sent:sent + room]
        frame[at:at + len(chunk)] = chunk
        sent += len(chunk)
        frames.append(bytes(frame))
    return frames


class VkbDevice:
    def __init__(self, path, delay=0.02, trace=None):
        self.path = path
        self.fd = os.open(path, os.O_RDWR)
        self.delay = delay
        self.trace = trace
        self.retries = 0

    def close(self):
        try:
            os.close(self.fd)
        except OSError:
            pass

    def _trace(self, tag, frame):
        if self.trace:
            self.trace.write('%s %s\n' % (tag, bytes(frame).hex()))

    def _get(self):
        buf = bytearray(FEAT_LEN)
        buf[0] = REPORT_ID
        n = fcntl.ioctl(self.fd, HIDIOCGFEATURE, buf, True)
        self._trace('GET', buf[:n])
        return bytes(buf[:n])

    def _set(self, frame):
        self._trace('SET', frame)
        fcntl.ioctl(self.fd, HIDIOCSFEATURE, bytearray(frame), True)

    # ---- long read ---------------------------------------------------------
    def _long_read_once(self, cmd, size, addr):
        frame = bytearray(FEAT_LEN)
        frame[0] = REPORT_ID
        struct.pack_into('<BBHHH', frame, 1, 0xA5, cmd | FLAG_LONG_READ, size, addr, 0)
        self._set(frame)
        time.sleep(0.004 + self.delay)
        rx = self._get()
        prefix, rcmd, rsize, raddr, rcrc = struct.unpack_from('<BBHHH', rx, 1)
        if prefix != 0x5A or rcmd != (cmd | FLAG_LONG_READ) or raddr != addr:
            raise StaleReply('reply header %s' % rx[:1 + HDR_LEN].hex(' '))
        want = min(size, rsize)
        data = bytearray(rx[1 + HDR_LEN:1 + HDR_LEN + want])
        while len(data) < want:
            time.sleep(self.delay)
            data += self._get()[1:1 + want - len(data)]
        if crc16(data) != rcrc:
            raise IOError('CRC-16 mismatch: device %04x, computed %04x' % (rcrc, crc16(data)))
        return bytes(data)

    def long_read(self, cmd, size, addr=0, tries=4):
        """The request that follows READ_CPUID is answered with a stale frame
        (see docs/PROTOCOL.md, "Quirks"), so check the echo and ask again."""
        last = None
        for _ in range(tries):
            try:
                return self._long_read_once(cmd, size, addr)
            except StaleReply as exc:
                last = exc
                self.retries += 1
                time.sleep(0.05)
        raise IOError('no valid reply after %d tries (%s)' % (tries, last))

    def read_token(self):
        reply = self.long_read(CMD_READ_CPUID, 0x78)
        return rc4(reply[0x58:0x68], CPUID_KEY)

    def read_block(self, token, size=BLOCK_SIZE, ram=False):
        cipher = self.long_read(CMD_READ_RAM if ram else CMD_READ_EEPROM, size)
        return cipher, rc4(cipher, token[:15])

    # ---- long write --------------------------------------------------------
    def write_block(self, token, block):
        """Send the block to flash and return the device's status word. The
        caller must have completed a read just before: a write issued straight
        after READ_CPUID would fall into the stale-reply quirk."""
        for frame in long_write_frames(CMD_WRITE_EEPROM, 0, rc4(block, token[:15])):
            self._set(frame)
        time.sleep(0.060)                       # the vendor tool waits 60 ms
        return struct.unpack_from('<I', self._get(), 1)[0]


def wait_for_restart(path, timeout=15.0):
    """After an accepted write the stick drops off the bus for ~2.5 s."""
    start = time.time()
    gone = False
    while time.time() - start < timeout:
        present = os.path.exists(path)
        if not present:
            gone = True
        elif gone:
            time.sleep(1.0)                     # let udev and the HID core settle
            return True
        time.sleep(0.05)
    return False


# ------------------------------------------------------------------ cli ---
def describe(token, block, where, retries, show_token):
    shown = token.hex(' ') if show_token else \
        'xx ' * 8 + token[8:12].hex(' ') + ' xx' * 4 + '   (%r)' % token[8:12].decode('ascii', 'replace')
    print('token       : %s' % shown)
    print('block       : %d bytes from %s, retries %d' % (len(block), where, retries))
    print('type id     : 0x%02x' % block[2])
    print('firmware    : %s' % firmware_version(block))
    print('crc-32      : stored %08x, computed %08x  %s'
          % (struct.unpack_from('<I', block, 4)[0], block_crc(block),
             'OK' if block_crc_ok(block) else 'MISMATCH'))


def load_new_block(path):
    data = open(path, 'rb').read()
    if not (len(data) >= 4 and data[0] == 0xFF and data[1] == 0xFF):
        data, ok = cfg_decrypt(data)
        if not ok:
            sys.exit('%s is neither a plaintext block nor a .cfg profile that decrypts' % path)
    return fix_block_crc(data)


def diff_runs(a, b):
    runs = []
    for i in range(8, len(a)):                  # the CRC word follows from the rest
        if a[i] != b[i]:
            if runs and i <= runs[-1][1] + 1:
                runs[-1][1] = i
            else:
                runs.append([i, i])
    return runs


def do_write(dev, path, token, current, args):
    new = load_new_block(args.file)
    if len(new) != BLOCK_SIZE:
        sys.exit('refusing: the new block is %d bytes, the device block is %d' % (len(new), BLOCK_SIZE))
    if new[2] != current[2]:
        sys.exit('refusing: type id 0x%02x does not match the device (0x%02x)' % (new[2], current[2]))
    if new[8:10] != current[8:10]:
        sys.exit('refusing: block is for firmware %s, the device runs %s'
                 % (firmware_version(new), firmware_version(current)))

    runs = diff_runs(current, new)
    if not runs:
        print('nothing to do: the device already holds this configuration')
        return
    print('changes     : %d byte(s) in %d run(s)' % (sum(e - s + 1 for s, e in runs), len(runs)))
    for s, e in runs[:32]:
        print('  0x%03x..0x%03x   %-30s -> %s' % (s, e, current[s:e + 1].hex(' '), new[s:e + 1].hex(' ')))
    if len(runs) > 32:
        print('  ... %d more runs' % (len(runs) - 32))
    if not args.yes:
        print('dry run     : nothing written. Repeat with --yes to write.')
        return

    backup = time.strftime('vkb_feature_backup_%Y%m%d_%H%M%S.bin')
    with open(backup, 'wb') as f:
        f.write(current)
    print('backup      : %s' % backup)

    status = dev.write_block(token, new)
    print('status      : %08x  %s' % (status, WRITE_STATUS.get(status, 'unknown')))
    if status != STATUS_OK:
        sys.exit('the device did not accept the block; its configuration is unchanged')
    dev.close()

    print('restart     : waiting for the stick to come back ...')
    if not wait_for_restart(path):
        sys.exit('the stick did not reappear at %s within 15 s; check it, then run "info"' % path)
    dev = VkbDevice(path, trace=dev.trace)
    try:
        _, stored = dev.read_block(dev.read_token())
    finally:
        dev.close()
    if stored == new:
        print('verify      : OK, the stick now holds the new configuration')
    else:
        left = diff_runs(new, stored)
        sys.exit('verify      : MISMATCH in %d run(s), first at 0x%03x; the old block is in %s'
                 % (len(left), left[0][0] if left else 4, backup))


def main():
    ap = argparse.ArgumentParser(description='Read or write a VKB NJoy32 configuration.')
    ap.add_argument('command', choices=('info', 'read', 'write'))
    ap.add_argument('file', nargs='?', help='for "write": a plaintext block or a .cfg profile')
    ap.add_argument('--dev', help='hidraw node; default: the only VKB device found')
    ap.add_argument('-o', '--out', default='vkb_feature_block.bin',
                    help='where "read" writes the plaintext block')
    ap.add_argument('--raw', help='"read": also write the block as received (RC4 ciphertext)')
    ap.add_argument('--ram', action='store_true',
                    help='"info"/"read": use the RAM copy (command 3) instead of EEPROM (command 2)')
    ap.add_argument('--yes', action='store_true', help='"write": actually write to the stick')
    ap.add_argument('--trace', help='append every frame, as hex, to this file')
    ap.add_argument('--show-token', action='store_true',
                    help='print the full token (it contains the device serial number)')
    args = ap.parse_args()
    if args.command == 'write' and not args.file:
        ap.error('"write" needs a file')

    path = args.dev
    if not path:
        devs = find_devices()
        if len(devs) != 1:
            for d in devs:
                print('  %s  231d:%04x  %s' % d, file=sys.stderr)
            sys.exit('expected exactly one VKB device, found %d; use --dev' % len(devs))
        path = devs[0][0]
        print('device      : %s  231d:%04x  %s' % devs[0])

    trace = open(args.trace, 'a') if args.trace else None
    dev = VkbDevice(path, trace=trace)
    try:
        token = dev.read_token()
        ram = args.ram and args.command != 'write'
        cipher, block = dev.read_block(token, ram=ram)
        describe(token, block, 'RAM' if ram else 'EEPROM', dev.retries, args.show_token)
        if not block_crc_ok(block):
            sys.exit('the block read from the device fails its CRC-32; stopping')

        if args.command == 'read':
            with open(args.out, 'wb') as f:
                f.write(block)
            print('plaintext   : %s' % args.out)
            if args.raw:
                with open(args.raw, 'wb') as f:
                    f.write(cipher)
                print('ciphertext  : %s' % args.raw)
        elif args.command == 'write':
            do_write(dev, path, token, block, args)
    finally:
        dev.close()


if __name__ == '__main__':
    main()
