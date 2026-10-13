#requires -Version 5.1
<#
.SYNOPSIS
    Poll the 15-byte RC4 key buffer out of a running VKBDevCfg-C.exe.

.DESCRIPTION
    Reads 0x0F bytes from VA 0x00F08B5E in the target process.

    Read-only and unprivileged: PROCESS_VM_READ + ReadProcessMemory. The target
    is never suspended, written to, or debugged. No breakpoints -- VKBDevCfg is
    known to be crash-prone under a debugger.

    REQUIRES AN ELEVATED POWERSHELL when VKBDevCfg was itself launched elevated.
    VKBDevCfg runs at High integrity; a Medium-integrity shell gets
    ERROR_ACCESS_DENIED on OpenProcess, and Process.MainModule silently comes
    back null rather than throwing.

    Module base is resolved WITHOUT Process.MainModule (unreliable here). This
    maps 0x00400000 directly and validates the mapping by reading the live PE
    header and checking MZ + PE signature + ImageBase. That is safe because the
    binary has DllCharacteristics = 0x0000, i.e. DYNAMIC_BASE is NOT set, so the
    loader must place it at its preferred base.

    The buffer lives in the zero-initialised tail of .data (raw data ends at RVA
    0x00B08200; the buffer is at 0x00B08B5E), so it reads as zeros until the app
    populates it. This polls continuously and logs every distinct snapshot, so
    a key resident only briefly -- or one that rotates per save -- is still
    captured.

    Every line is appended to -Report as it is produced, so a later failure
    still leaves the useful data on disk.

.EXAMPLE
    # one-shot, to see whether a key is already resident
    .\rc4key.ps1 -Duration 0 -Report keylog.txt

.EXAMPLE
    # poll 3 minutes while you press Get then Save in the UI
    .\rc4key.ps1 -Duration 180 -Report keylog.txt -Out keylog.csv
#>
[CmdletBinding()]
param(
    [string] $ProcessName = 'VKBDevCfg-C',
    [int]    $Duration    = 0,
    [string] $Out         = 'keylog.csv',
    [string] $Report      = 'keylog.txt',
    [int]    $IntervalMs  = 40,
    [long]   $Base        = 0x00400000,
    [long]   $KeyVa       = 0x00F08B5E,
    [int]    $KeyLen      = 0x0F,
    [int]    $CtxLen      = 32
)

$ErrorActionPreference = 'Stop'

if (-not ('W.Mem' -as [type])) {
Add-Type -Namespace W -Name Mem -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError=true)]
public static extern IntPtr OpenProcess(int access, bool inherit, int pid);
[DllImport("kernel32.dll", SetLastError=true)]
public static extern bool ReadProcessMemory(
    IntPtr h, IntPtr addr, byte[] buf, int size, out IntPtr read);
[DllImport("kernel32.dll", SetLastError=true)]
public static extern bool CloseHandle(IntPtr h);
'@
}

# Append to the report as we go, so an exception later on cannot lose it.
$script:SayLines = New-Object System.Collections.Generic.List[string]
function Say {
    param([string]$Message)
    $script:SayLines.Add($Message)
    Write-Host $Message
}
function Flush {
    if ($Report) { $script:SayLines | Out-File -FilePath $Report -Encoding UTF8 }
}

function Read-Remote {
    param([IntPtr]$Handle, [long]$Addr, [int]$Len)
    $b = New-Object byte[] $Len
    $r = [IntPtr]::Zero
    if ([W.Mem]::ReadProcessMemory($Handle, [IntPtr]$Addr, $b, $Len, [ref]$r) -and
        $r.ToInt64() -eq $Len) { return $b }
    return $null
}

function Hex { param([byte[]]$B) (($B | ForEach-Object { $_.ToString('x2') }) -join '') }

function AsciiOf {
    param([string]$HexString)
    $sb = ''
    for ($i = 0; $i + 1 -lt $HexString.Length; $i += 2) {
        $v = [Convert]::ToByte($HexString.Substring($i, 2), 16)
        $sb += if ($v -ge 0x20 -and $v -le 0x7E) { [char]$v } else { '.' }
    }
    $sb
}

$handle = [IntPtr]::Zero
try {
    # ---- locate the process ---------------------------------------------
    $proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
            Sort-Object StartTime | Select-Object -First 1
    if (-not $proc) { throw "Process '$ProcessName' is not running. Start VKBDevCfg and retry." }

    $integrity = 'unknown'
    try {
        $me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
        if ($me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { $integrity = 'High (elevated)' }
        else { $integrity = 'Medium' }
    } catch { }

    Say ("START {0}" -f (Get-Date -Format 'HH:mm:ss.fff'))
    Say ("PID           : {0}" -f $proc.Id)
    Say ("Started       : {0}" -f $proc.StartTime)
    Say ("This shell    : IL {0}" -f $integrity)
    Say ("Base (assumed): 0x{0:X8}" -f $Base)
    Say ""

    # ---- open with just read access --------------------------------------
    $handle = [W.Mem]::OpenProcess(0x0010, $false, $proc.Id)
    if ($handle -eq [IntPtr]::Zero) { $handle = [W.Mem]::OpenProcess(0x0400, $false, $proc.Id) }
    if ($handle -eq [IntPtr]::Zero) {
        $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "OpenProcess failed (win32=$err). Run this script from an elevated PowerShell."
    }
    Say ("OpenProcess   : PROCESS_VM_READ granted")
    Say ""

    # ---- validate the mapping against the live PE header ------------------
    $mz = Read-Remote -Handle $handle -Addr $Base -Len 2
    if (-not $mz -or $mz[0] -ne 0x4D -or $mz[1] -ne 0x5A) {
        throw ("No MZ signature at 0x{0:X8}. Image is not at its preferred base; pass -Base." -f $Base)
    }
    $head = Read-Remote -Handle $handle -Addr $Base -Len 0x40
    $lfanew = [BitConverter]::ToInt32($head, 0x3C)
    $pe     = Read-Remote -Handle $handle -Addr ($Base + $lfanew) -Len 4
    $peSig  = [BitConverter]::ToUInt32($pe, 0)
    $opt    = Read-Remote -Handle $handle -Addr ($Base + $lfanew + 24) -Len 0x48
    $liveImageBase = [BitConverter]::ToUInt32($opt, 28)
    $liveDllChar   = [BitConverter]::ToUInt16($opt, 70)

    Say ("MZ@base       : ok")
    Say ("e_lfanew      : 0x{0:X8}" -f $lfanew)
    Say ("PE signature  : 0x{0:X8} (want 0x00004550)" -f $peSig)
    Say ("ImageBase     : 0x{0:X8} (want 0x{1:X8})" -f $liveImageBase, $Base)
    Say ("DllChars      : 0x{0:X4}  ASLR={1}" -f $liveDllChar, [bool]($liveDllChar -band 0x40))

    if (-not (($peSig -eq 0x00004550) -and ($liveImageBase -eq $Base))) {
        throw "Live PE header does not match -- mapping unverified, refusing to read."
    }
    Say ("Mapping       : VERIFIED")
    Say ("Key RVA       : 0x{0:X8}" -f ($KeyVa - $Base))
    Say ("Key VA        : 0x{0:X8}  (len {1})" -f $KeyVa, $KeyLen)
    Say ""

    # ---- poll -------------------------------------------------------------
    $seen = [ordered]@{}
    $stop = (Get-Date).AddSeconds($Duration)
    $reads = 0; $fails = 0

    do {
        $ctx = Read-Remote -Handle $handle -Addr $KeyVa -Len $CtxLen
        if ($ctx) {
            $reads++
            $key = $ctx[0..($KeyLen - 1)]
            $hex = Hex $key
            if (-not $seen.Contains($hex)) {
                $seen[$hex] = Get-Date
                $tag = if ($hex -match '^(00)+$') { 'all-zero' } else { 'KEY CANDIDATE' }
                Say ("{0:HH:mm:ss.fff}  {1}  [{2}]  ctx32={3}" -f (Get-Date), $hex, $tag, (Hex $ctx))
                Flush
            }
        } else { $fails++ }
        if ((Get-Date) -lt $stop) { Start-Sleep -Milliseconds $IntervalMs }
    } while ((Get-Date) -lt $stop)

    Say ""
    Say ("reads         : {0} successful, {1} failed" -f $reads, $fails)

    $rows = foreach ($k in $seen.Keys) {
        [pscustomobject]@{
            FirstSeenLocal = $seen[$k].ToString('HH:mm:ss.fff')
            KeyHex         = $k
            KeyAscii       = AsciiOf $k
            AllZero        = ($k -match '^(00)+$')
        }
    }
    if ($Out) { $rows | Export-Csv -Path $Out -NoTypeInformation -Encoding UTF8 }

    Say ("distinct      : {0}" -f $rows.Count)

    $keys = @($rows | Where-Object { -not $_.AllZero })
    if ($keys.Count -eq 0) {
        Say ""
        Say "RESULT: no non-zero key resident."
        Say "        In VKBDevCfg press Get then Save while this script polls."
        Say "        Re-run with:  .\rc4key.ps1 -Duration 180"
    } else {
        Say ""
        Say "RESULT: key candidate(s) found."
        $keys | ForEach-Object {
            Say ("  {0}   ascii={1}   firstSeen={2}" -f $_.KeyHex, $_.KeyAscii, $_.FirstSeenLocal)
        }
        Say ""
        Say "Verify against a saved profile with:  python tools/rc4cfg.py --key <hex> <profile.cfg>"
    }
}
catch {
    Say ""
    Say ("EXCEPTION: {0}" -f $_.Exception.Message)
    Say ("  at:    {0}" -f $_.InvocationInfo.PositionMessage)
    Say ("  stack: {0}" -f $_.ScriptStackTrace)
    Say "RESULT: failed"
}
finally {
    if ($handle -ne [IntPtr]::Zero) { [void][W.Mem]::CloseHandle($handle) }
    Flush
}