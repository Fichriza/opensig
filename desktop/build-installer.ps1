# Builds dist\OpenSig-Setup.exe: the installer (Setup.cs) carrying dist\OpenSig.exe, gzip-compressed.
# OpenSig.exe is built first when it is missing or with -Rebuild. -Version sets the version shown in Settings ▸ Apps
# (default: 1.<yy>.<MMdd> of today). -App packs another build (e.g. dist\OpenSig-new.exe while OpenSig is running).
param([string]$Version = '', [switch]$Rebuild, [string]$App = '')
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $here 'dist'
$cache = Join-Path $env:TEMP 'osbuild'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$app = if ($App) { (Resolve-Path $App).Path } else { Join-Path $dist 'OpenSig.exe' }
$ico = Join-Path $cache 'opensig.ico'
if ($Rebuild -or -not (Test-Path $app) -or -not (Test-Path $ico)) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'build.ps1')
  if ($LASTEXITCODE) { throw "build.ps1 failed ($LASTEXITCODE)" }
}
if (-not $Version) { $Version = '1.' + (Get-Date -Format 'yy') + '.' + [int](Get-Date -Format 'MMdd') }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must look like 1.2.3" }

# 1. the payload: OpenSig.exe, gzip-compressed
$gz = Join-Path $cache 'OpenSig.exe.gz'
$in = [IO.File]::OpenRead($app); $out = [IO.File]::Create($gz)
$z = New-Object IO.Compression.GZipStream($out, [IO.Compression.CompressionLevel]::Optimal)
$in.CopyTo($z); $z.Close(); $in.Close()

# 2. version information (also shown in the file's Properties ▸ Details)
$info = Join-Path $cache 'SetupInfo.cs'
@"
using System.Reflection;
[assembly: AssemblyTitle("OpenSig Setup")]
[assembly: AssemblyProduct("OpenSig")]
[assembly: AssemblyDescription("Installs OpenSig, signal analysis with linked windows")]
[assembly: AssemblyVersion("$Version.0")]
[assembly: AssemblyFileVersion("$Version.0")]
static class Info { public const string Version = "$Version"; }
"@ | Set-Content -Encoding UTF8 $info

# 3. compile
$setup = Join-Path $dist 'OpenSig-Setup.exe'
& $csc /nologo /target:winexe /platform:anycpu /optimize+ /out:$setup /win32icon:$ico /win32manifest:"$here\app.manifest" `
  /resource:"$gz,payload.OpenSig.exe.gz" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.dll `
  "$here\Setup.cs" $info
if ($LASTEXITCODE -ne 0) { throw "csc failed ($LASTEXITCODE)" }
Get-Item $app, $setup | Select-Object Name, Length, LastWriteTime
