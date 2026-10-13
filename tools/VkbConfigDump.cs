// VKB config reader for Windows.
//
// Dumps the 128-byte configuration feature report (report ID 0x59) using
// HidD_GetFeature -- the exact API VKBDevCfg itself uses. READ-ONLY: it never
// calls HidD_SetFeature or HidD_SetOutputReport, and opens the device for
// write access only because HidD_GetFeature requires it; it never writes.
//
// Written to compile under both PowerShell 5.1 Add-Type (C# 5) and csc:
// no inline 'out' declarations, no discards, no expression-bodied members.
//
//   Add-Type -Path .\VkbConfigDump.cs ; [VkbConfigDump]::Run()
//
// or
//   csc /nologo /target:library /out:VkbConfigDump.dll VkbConfigDump.cs
//
// Requires the stick plugged in.

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class VkbConfigDump
{
    const int VID = 0x231D;
    const byte FEATURE_REPORT_ID = 0x59;

    // HidD_GetFeature's ReportBufferLength excludes the report ID.
    static readonly int[] LENGTHS = { 128, 127, 64, 63, 32, 130 };
    static readonly int[] PIDS = { 0x0200, 0x3201 };

    const uint GENERIC_READ = 0x80000000;
    const uint GENERIC_WRITE = 0x40000000;
    const uint FILE_SHARE_READ = 0x00000001;
    const uint FILE_SHARE_WRITE = 0x00000002;
    const uint OPEN_EXISTING = 3;

    [StructLayout(LayoutKind.Sequential)]
    struct HIDD_ATTRIBUTES
    {
        public int Size;
        public ushort VendorID;
        public ushort ProductID;
        public ushort VersionNumber;
    }

    [DllImport("hid.dll", SetLastError = true)]
    static extern bool HidD_GetHidGuid(out Guid guid);

    [DllImport("hid.dll", SetLastError = true)]
    static extern bool HidD_GetPreparsedData(SafeFileHandle h, out IntPtr ppd);

    [DllImport("hid.dll", SetLastError = true)]
    static extern bool HidD_FreePreparsedData(IntPtr ppd);

    [DllImport("hid.dll", SetLastError = true, EntryPoint = "HidD_GetAttributes")]
    static extern bool HidD_GetAttributes(IntPtr ppd, ref HIDD_ATTRIBUTES attr);

    [DllImport("hid.dll", SetLastError = true)]
    static extern bool HidD_GetFeature(SafeFileHandle h, IntPtr ppd,
                                       byte reportId, byte[] data, int len);

    public static string Run()
    {
        var sb = new StringBuilder();
        Guid guid;
        HidD_GetHidGuid(out guid);
        return RunCore(sb, guid);
    }

    /// Read a known HID interface path directly, skipping SetupAPI enumeration.
    public static string RunFromPath(string path)
    {
        var sb = new StringBuilder();
        sb.AppendLine("path: " + path);
        SafeFileHandle h = OpenHid(path);
        if (h == null)
        {
            sb.AppendLine("CreateFileW failed for all access modes, win32="
                        + Marshal.GetLastWin32Error());
            return sb.ToString();
        }
        sb.AppendLine("opened");
        IntPtr ppd;
        if (!HidD_GetPreparsedData(h, out ppd))
        {
            sb.AppendLine("HidD_GetPreparsedData failed, win32=" + Marshal.GetLastWin32Error());
            h.Dispose();
            return sb.ToString();
        }
        try
        {
            HIDD_ATTRIBUTES attr = new HIDD_ATTRIBUTES();
            attr.Size = Marshal.SizeOf(typeof(HIDD_ATTRIBUTES));
            bool okAttr = HidD_GetAttributes(ppd, ref attr);
            sb.AppendLine(string.Format("attributes ok={0} VID={1:X4} PID={2:X4} bcdDevice={3:X4}",
                okAttr, attr.VendorID, attr.ProductID, attr.VersionNumber));

            sb.AppendLine(TryFeature(h, ppd, 0x00));
            sb.AppendLine(TryFeature(h, ppd, 0x01));
            sb.AppendLine(TryFeature(h, ppd, 0x58));
            sb.AppendLine(TryFeature(h, ppd, 0x59));
        }
        finally { HidD_FreePreparsedData(ppd); h.Dispose(); }
        return sb.ToString();
    }

    static SafeFileHandle OpenHid(string path)
    {
        uint[] modes = { GENERIC_READ | GENERIC_WRITE, GENERIC_READ, 0 };
        foreach (uint access in modes)
        {
            SafeFileHandle h = CreateFileW(path, access, FILE_SHARE_READ | FILE_SHARE_WRITE,
                                           IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
            if (!h.IsInvalid) return h;
            h.Dispose();
        }
        return null;
    }

    static string TryFeature(SafeFileHandle h, IntPtr ppd, byte rid)
    {
        foreach (int len in LENGTHS)
        {
            byte[] data = new byte[len];
            if (HidD_GetFeature(h, ppd, rid, data, data.Length))
            {
                string path = System.IO.Path.Combine(Directory.GetCurrentDirectory(),
                    string.Format("vkb_feature_{0:X2}_{1}.bin", rid, len));
                File.WriteAllBytes(path, data);
                return string.Format("HidD_GetFeature(0x{0:X2}, len={1}) OK -> {2}\r\n{3}\r\n{4}\r\n{5}",
                    rid, len, path, Hex(data), ZeroRuns(data), Distinct(data));
            }
        }
        return string.Format("HidD_GetFeature(0x{0:X2}) FAILED for all lengths, win32={1}",
            rid, Marshal.GetLastWin32Error());
    }

    static string RunCore(StringBuilder sb, Guid guid)
    {
        int opened = 0, read = 0;

        foreach (SafeFileHandle h in EnumerateHid(guid))
        {
            IntPtr ppd;
            if (!HidD_GetPreparsedData(h, out ppd)) { h.Dispose(); continue; }

            try
            {
                HIDD_ATTRIBUTES attr = new HIDD_ATTRIBUTES();
                attr.Size = Marshal.SizeOf(typeof(HIDD_ATTRIBUTES));
                bool okAttr = HidD_GetAttributes(ppd, ref attr);
                int vid = okAttr ? attr.VendorID : -1;
                int pid = okAttr ? attr.ProductID : -1;
                int ver = okAttr ? attr.VersionNumber : -1;

                sb.AppendLine(string.Format("interface: VID={0:X4} PID={1:X4} bcdDevice=0x{2:X4}",
                    vid, pid, ver));

                if (vid != VID) continue;
                opened++;

                foreach (int len in LENGTHS)
                {
                    byte[] data = new byte[len];
                    if (HidD_GetFeature(h, ppd, FEATURE_REPORT_ID, data, data.Length))
                    {
                        read++;
                        sb.AppendLine();
                        sb.AppendLine(string.Format(
                            "=== feature report 0x{0:X2}, {1} bytes (Vid={2:X4} Pid={3:X4}) ===",
                            FEATURE_REPORT_ID, len, vid, pid));
                        sb.AppendLine(Hex(data));

                        string path = Path.Combine(Directory.GetCurrentDirectory(),
                                                  string.Format("vkb_feature_59_{0:X4}_{1}.bin", pid, len));
                        File.WriteAllBytes(path, data);
                        sb.AppendLine("saved " + path);

                        // Print a quick structural read on the dump.
                        sb.AppendLine(ZeroRuns(data));
                        sb.AppendLine(Distinct(data));
                        break;
                    }
                }
            }
            finally
            {
                HidD_FreePreparsedData(ppd);
                h.Dispose();
            }
        }

        sb.AppendLine();
        sb.AppendLine(string.Format("VKB interfaces opened: {0}; feature reads succeeded: {1}", opened, read));
        if (opened == 0)
            sb.AppendLine("No VID_231D interface was opened -- is the stick plugged in?");
        else if (read == 0)
            sb.AppendLine("Device opened but every HidD_GetFeature length failed, win32="
                        + Marshal.GetLastWin32Error());
        return sb.ToString();
    }

    static string Hex(byte[] d)
    {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < d.Length; i += 16)
        {
            StringBuilder row = new StringBuilder();
            StringBuilder asc = new StringBuilder();
            for (int j = i; j < Math.Min(i + 16, d.Length); j++)
            {
                row.Append(d[j].ToString("x2")).Append(' ');
                asc.Append(d[j] >= 32 && d[j] < 127 ? (char)d[j] : '.');
            }
            sb.AppendLine(string.Format("  {0:x4}  {1,-47}  {2}", i, row.ToString(), asc.ToString()));
        }
        return sb.ToString().TrimEnd();
    }

    /// Longest run of identical bytes -- real config has long zero runs.
    static string ZeroRuns(byte[] d)
    {
        int best = 0, bestStart = 0, cur = 0;
        for (int i = 1; i < d.Length; i++)
        {
            if (d[i] == d[i - 1]) { cur++; if (cur > best) { best = cur; bestStart = i - cur + 1; } }
            else cur = 0;
        }
        return string.Format("longest constant run: {0} byte(s) of 0x{1:x2} at offset {2}",
            best + 1, d[bestStart], bestStart);
    }

    static string Distinct(byte[] d)
    {
        Dictionary<byte, int> h = new Dictionary<byte, int>();
        for (int i = 0; i < d.Length; i++)
        {
            int c;
            h.TryGetValue(d[i], out c);
            h[d[i]] = c + 1;
        }
        return string.Format("distinct byte values: {0} of {1} possible", h.Count, 256);
    }

    // ---- SetupAPI enumeration --------------------------------------------
    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr SetupDiGetClassDevsW(ref Guid cls, string enumerator, IntPtr parent,
                                              int flags, out IntPtr devInfo);
    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool SetupDiEnumDeviceInterfaces(IntPtr devInfo, int devInfoData,
                                                   ref Guid devClass, int member,
                                                   ref SP_DEVICE_INTERFACE_DATA ifData);
    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool SetupDiGetDeviceInterfaceDetailW(IntPtr devInfo,
                                                         ref SP_DEVICE_INTERFACE_DATA ifData,
                                                         IntPtr detail, uint detailSize,
                                                         out uint required, IntPtr devInfoData);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiDestroyDeviceInfoList(IntPtr devInfo);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint share,
                                             IntPtr sec, uint creation, uint flags,
                                             IntPtr tmpl);

    [StructLayout(LayoutKind.Sequential)]
    struct SP_DEVICE_INTERFACE_DATA
    {
        public int cbSize;
        public Guid InterfaceClassGuid;
        public int Flags;
        public IntPtr Reserved;
    }

    const int DIGCF_PRESENT = 2, DIGCF_DEVICEINTERFACE = 0x10;
    const uint FILE_FLAG_NONE = 0;

    static IEnumerable<SafeFileHandle> EnumerateHid(Guid guid)
    {
        IntPtr devInfo;
        IntPtr set = SetupDiGetClassDevsW(ref guid, null, IntPtr.Zero,
                                          DIGCF_PRESENT | DIGCF_DEVICEINTERFACE, out devInfo);
        if (set == IntPtr.Zero) yield break;
        try
        {
            for (int i = 0; ; i++)
            {
                SP_DEVICE_INTERFACE_DATA ifd = new SP_DEVICE_INTERFACE_DATA();
                ifd.cbSize = Marshal.SizeOf(typeof(SP_DEVICE_INTERFACE_DATA));
                if (!SetupDiEnumDeviceInterfaces(set, 0, ref guid, i, ref ifd)) yield break;

                uint required;
                SetupDiGetDeviceInterfaceDetailW(set, ref ifd, IntPtr.Zero, 0, out required, IntPtr.Zero);
                if (required == 0) continue;

                IntPtr buf = Marshal.AllocHGlobal((int)required);
                try
                {
                    SP_DEVICE_INTERFACE_DATA ifd2 = ifd;
                    if (!SetupDiGetDeviceInterfaceDetailW(set, ref ifd2, buf, required,
                                                           out required, IntPtr.Zero))
                        continue;
                    string path = Marshal.PtrToStringUni(buf + 4); // skip cbSize

                    // HidD_GetFeature requires GENERIC_READ|GENERIC_WRITE. Never write.
                    uint[] modes = { GENERIC_READ | GENERIC_WRITE, GENERIC_READ, 0 };
                    SafeFileHandle h = null;
                    foreach (uint access in modes)
                    {
                        h = CreateFileW(path, access, 3, IntPtr.Zero,
                                        OPEN_EXISTING, FILE_FLAG_NONE, IntPtr.Zero);
                        if (!h.IsInvalid) break;
                        h.Dispose();
                        h = null;
                    }
                    if (h != null) yield return h;
                }
                finally { Marshal.FreeHGlobal(buf); }
            }
        }
        finally { SetupDiDestroyDeviceInfoList(set); }
    }
}