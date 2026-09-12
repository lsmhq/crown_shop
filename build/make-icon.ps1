Add-Type -AssemblyName System.Drawing

$scriptDir = $PSScriptRoot
$srcPath = Join-Path $scriptDir "..\12m-bundle-icon-W101.png"
$icoPath = Join-Path $scriptDir "12m-bundle-icon-W101.ico"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

function Get-ScaledPngBytes([System.Drawing.Bitmap]$src, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $scale = [Math]::Min($size / $src.Width, $size / $src.Height)
  $dstW = [int]($src.Width * $scale)
  $dstH = [int]($src.Height * $scale)
  $x = [int](($size - $dstW) / 2)
  $y = [int](($size - $dstH) / 2)
  $rect = New-Object System.Drawing.Rectangle($x, $y, $dstW, $dstH)
  $g.DrawImage($src, $rect)
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $g.Dispose()
  $bmp.Dispose()
  $ms.Dispose()
  return $bytes
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()
foreach ($s in $sizes) {
  $images += , (Get-ScaledPngBytes $src $s)
}
$src.Dispose()

$count = $images.Count
$headerSize = 6 + 16 * $count
$offset = $headerSize
$fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$w = New-Object System.IO.BinaryWriter($fs)

$w.Write([UInt16]0)
$w.Write([UInt16]1)
$w.Write([UInt16]$count)

for ($i = 0; $i -lt $count; $i++) {
  $b = $images[$i]
  $dim = $sizes[$i]
  if ($dim -ge 256) {
    $w.Write([Byte]0)
    $w.Write([Byte]0)
  } else {
    $w.Write([Byte]$dim)
    $w.Write([Byte]$dim)
  }
  $w.Write([Byte]0)
  $w.Write([Byte]0)
  $w.Write([UInt16]1)
  $w.Write([UInt16]32)
  $w.Write([UInt32]$b.Length)
  $w.Write([UInt32]$offset)
  $offset += $b.Length
}

for ($i = 0; $i -lt $count; $i++) {
  $b = $images[$i]
  Write-Output ("frame " + $sizes[$i] + " bytes=" + $b.Length)
  $fs.Write($b, 0, $b.Length)
}

$w.Close()
$fs.Close()

$fi = Get-Item $icoPath
Write-Output ("ICON_OK " + $fi.Length + " bytes, frames=" + $count)