// Clipboard format dumper for VKBDevCfg.
//
// Answers the highest-value open question: what does VKBDevCfg's
// "Copy cell" actually put on the clipboard? If it is plain text (or any
// non-encrypted structured record), it is a seam that bypasses the encrypted
// .cfg container entirely.
//
// READ-ONLY. It only reads the clipboard; it never writes to it and never
// touches the device.
//
// Run from PowerShell:
//   Add-Type -Path .\ClipboardDump.cs
//   [ClipboardDump]::Dump()
//
// Output is written to clipboard-format-dump.txt as well as the console.

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class ClipboardDump
{
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool OpenClipboard(IntPtr hWndNewOwner);
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool CloseClipboard();
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool IsClipboardFormatAvailable(uint format);
    [DllImport("user32.dll", SetLastError = true)]
    static extern uint EnumClipboardFormats(uint format);
    [DllImport("user32.dll", SetLastError = true)]
    static extern int GetClipboardData(uint uFormat);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern int GetClipboardFormatName(uint format, StringBuilder name, int maxLen);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr GlobalLock(IntPtr hMem);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GlobalUnlock(IntPtr hMem);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr GlobalSize(IntPtr hMem);

    const uint CF_TEXT = 1, CF_UNICODETEXT = 13, CF_OEMTEXT = 7, CF_LOCALE = 16;

    public static string Dump()
    {
        var sb = new StringBuilder();
        if (!OpenClipboard(IntPtr.Zero))
            return "OpenClipboard failed, win32=" + Marshal.GetLastWin32Error();

        try
        {
            uint fmt = 0;
            int count = 0;
            while ((fmt = EnumClipboardFormats(fmt)) != 0)
            {
                count++;
                var name = new StringBuilder(256);
                GetClipboardFormatName(fmt, name, name.Capacity);
                string label = name.Length > 0 ? name.ToString()
                                              : (fmt == CF_UNICODETEXT ? "CF_UNICODETEXT" :
                                                 fmt == CF_TEXT ? "CF_TEXT" :
                                                 fmt == CF_OEMTEXT ? "CF_OEMTEXT" :
                                                 fmt == CF_LOCALE ? "CF_LOCALE" :
                                                 "standard/" + fmt.ToString());
                sb.AppendLine($"[format {fmt}] {label}");

                IntPtr h = GetClipboardData(fmt);
                if (h == IntPtr.Zero) { sb.AppendLine("    (no data handle)"); continue; }

                IntPtr p = GlobalLock(h);
                if (p == IntPtr.Zero) { sb.AppendLine("    (lock failed)"); continue; }
                try
                {
                    int size = (int)GlobalSize(h);
                    byte[] raw = new byte[Math.Min(size, 1 << 20)];
                    Marshal.Copy(p, raw, 0, raw.Length);

                    if (fmt == CF_UNICODETEXT)
                    {
                        string s = Marshal.PtrToStringUni(p);
                        sb.AppendLine($"    UNICODE text, {s.Length} chars:");
                        sb.AppendLine(Indent(s));
                    }
                    else if (fmt == CF_TEXT || fmt == CF_OEMTEXT)
                    {
                        string s = Marshal.PtrToStringAnsi(p);
                        sb.AppendLine($"    ANSI text, {(s ?? "").Length} chars:");
                        sb.AppendLine(Indent(s));
                    }
                    else
                    {
                        sb.AppendLine($"    {raw.Length} raw bytes:");
                        sb.AppendLine(Hex(raw));
                        float e = Entropy(raw);
                        sb.AppendLine($"    entropy: {e:F3} bits/byte" +
                            (e > 7.5 ? "   <-- indistinguishable from random/encrypted" : ""));
                        if (LooksTextual(raw))
                            sb.AppendLine("    (looks like text):\n" +
                                          Indent(Encoding.UTF8.GetString(raw).TrimEnd('\0')));
                    }
                }
                finally { GlobalUnlock(h); }
                sb.AppendLine();
            }
            if (count == 0) sb.AppendLine("clipboard is empty");
            else sb.AppendLine($"{count} format(s) present");
        }
        finally { CloseClipboard(); }

        string outp = "clipboard-format-dump.txt";
        File.WriteAllText(outp, sb.ToString());
        sb.AppendLine($"\nwrote {Path.GetFullPath(outp)}");
        return sb.ToString();
    }

    static string Indent(string s) =>
        string.Join("\n", Array.ConvertAll(
            (s ?? "").Split('\n'), l => "    | " + l.TrimEnd('\r')));

    static string Hex(byte[] b)
    {
        var sb = new StringBuilder();
        for (int i = 0; i < b.Length; i += 16)
        {
            sb.Append("    ");
            for (int j = i; j < Math.Min(i + 16, b.Length); j++)
                sb.Append(b[j].ToString("x2")).Append(' ');
            sb.Append('\n');
        }
        return sb.ToString().TrimEnd();
    }

    static float Entropy(byte[] b)
    {
        var c = new int[256];
        foreach (var x in b) c[x]++;
        double e = 0;
        foreach (var v in c)
            if (v > 0) { double p = (double)v / b.Length; e -= p * Math.Log2(p); }
        return (float)e;
    }

    static bool LooksTextual(byte[] b)
    {
        int printable = 0;
        foreach (var x in b)
            if (x == 0 || x == 9 || x == 10 || x == 13 || (x >= 32 && x < 127)) printable++;
        return b.Length > 0 && (double)printable / b.Length > 0.9;
    }
}