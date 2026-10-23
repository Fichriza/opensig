# Builds dist\OpenSig.exe: a single-file Windows desktop app (x64) embedding ..\opensig.
# Needs only what ships with Windows 10/11 (.NET Framework 4.8 compiler, Edge WebView2 runtime) plus the
# Microsoft.Web.WebView2 NuGet package, which is downloaded once into %TEMP%\osbuild.
param([string]$OutName = 'OpenSig.exe')
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$web = Join-Path $here '..\opensig' | Resolve-Path
$dist = Join-Path $here 'dist'
$cache = Join-Path $env:TEMP 'osbuild'
$wv2Version = '1.0.4258.31'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
New-Item -ItemType Directory -Force $dist, $cache | Out-Null

# 1. WebView2 SDK (managed wrappers + loader), signed by Microsoft
$wv2 = Join-Path $cache "wv2-$wv2Version"
if (-not (Test-Path "$wv2\lib\net462\Microsoft.Web.WebView2.Core.dll")) {
  $pkg = Join-Path $cache "wv2-$wv2Version.zip"
  Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$wv2Version/microsoft.web.webview2.$wv2Version.nupkg" -OutFile $pkg
  Expand-Archive $pkg $wv2 -Force
}
$core = "$wv2\lib\net462\Microsoft.Web.WebView2.Core.dll"
$winforms = "$wv2\lib\net462\Microsoft.Web.WebView2.WinForms.dll"
$loader = "$wv2\runtimes\win-x64\native\WebView2Loader.dll"
foreach ($f in $core, $winforms, $loader) {
  if ((Get-AuthenticodeSignature $f).SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw "Unexpected signature on $f" }
}

# 2. Application icon (drawn here: blue circle with a white decaying wave, like mac/icon-1024.png)
Add-Type -AssemblyName System.Drawing
$ico = Join-Path $cache 'opensig.ico'
$sizes = 16, 24, 32, 48, 64, 256
$pngs = foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $w = $s - 1
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(0, 0, $w, $w)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0, 0)), ([System.Drawing.Point]::new(0, $s)), ([System.Drawing.Color]::FromArgb(40, 110, 230)), ([System.Drawing.Color]::FromArgb(10, 50, 150))
  $g.FillPath($brush, $path)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.2, $s / 13))
  $pen.LineJoin = 'Round'
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $pts = 0..60 | ForEach-Object { $t = $_ / 60; [System.Drawing.PointF]::new($s * (0.18 + 0.64 * $t), $s * (0.5 - 0.25 * [Math]::Sin($t * 3 * [Math]::PI) * [Math]::Exp(-0.98 * $t))) }
  $g.DrawLines($pen, [System.Drawing.PointF[]]$pts)
  $g.Dispose()
  if ($s -eq 256) { $bmp.Save((Join-Path $cache 'opensig-256.png'), [System.Drawing.Imaging.ImageFormat]::Png) } # to look at
  $ms = New-Object System.IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  , $ms.ToArray()
}
$fs = [System.IO.File]::Create($ico); $bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]; $bw.Write([byte]($s % 256)); $bw.Write([byte]($s % 256)); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$pngs[$i].Length); $bw.Write([UInt32]$offset); $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $bw.Write($p) }
$bw.Close()

# 3. Compile, embedding the web app, the WebView2 wrappers and the native loader as resources
$res = @("/resource:$core,lib.Microsoft.Web.WebView2.Core.dll", "/resource:$winforms,lib.Microsoft.Web.WebView2.WinForms.dll", "/resource:$loader,native.WebView2Loader.dll")
Get-ChildItem $web -Recurse -File | Where-Object { $_.FullName -notmatch '\\test\\' -and $_.Extension -in '.html', '.css', '.js', '.txt' } | ForEach-Object {
  $rel = $_.FullName.Substring($web.Path.Length + 1).Replace('\', '/')
  $res += "/resource:$($_.FullName),web/$rel"
}
$out = Join-Path $dist $OutName
& $csc /nologo /target:winexe /platform:x64 /optimize+ /out:$out /win32icon:$ico /win32manifest:"$here\app.manifest" `
  /reference:$core /reference:$winforms /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.dll /reference:System.Core.dll /reference:System.Web.Extensions.dll `
  @res "$here\Program.cs"
if ($LASTEXITCODE -ne 0) { throw "csc failed ($LASTEXITCODE)" }
Get-Item $out | Select-Object Name, Length, LastWriteTime
