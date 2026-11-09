# Recreate the local PNG assets without downloading a font or image dependency.
Add-Type -AssemblyName System.Drawing
$iconDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\icons'))
[System.IO.Directory]::CreateDirectory($iconDirectory) | Out-Null

function New-RoundedPath([single] $x, [single] $y, [single] $width, [single] $height, [single] $radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2
    $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
    $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

foreach ($size in @(192, 512, 180)) {
    # Render at twice the output resolution to keep small curves smooth.
    $renderSize = $size * 2
    $bitmap = New-Object System.Drawing.Bitmap($renderSize, $renderSize)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform(($renderSize / 512.0), ($renderSize / 512.0))
    $background = [System.Drawing.ColorTranslator]::FromHtml('#f6f5f2')
    $foreground = [System.Drawing.ColorTranslator]::FromHtml('#252525')
    $lightBrush = New-Object System.Drawing.SolidBrush($background)
    $darkBrush = New-Object System.Drawing.SolidBrush($foreground)
    $graphics.Clear($background)
    # Keep the wallet inside the central 80% maskable safe circle.
    $body = New-RoundedPath 123 148 266 216 38
    $graphics.FillPath($darkBrush, $body)
    $seam = New-Object System.Drawing.Pen($background, 11)
    $seam.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $seam.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($seam, 150, 183, 362, 183)
    $tab = New-RoundedPath 282 233 114 77 22
    $graphics.FillPath($lightBrush, $tab)
    $outline = New-Object System.Drawing.Pen($foreground, 10)
    $graphics.DrawPath($outline, $tab)
    $graphics.FillEllipse($darkBrush, 305, 262.5, 18, 18)

    $output = New-Object System.Drawing.Bitmap($size, $size)
    $outputGraphics = [System.Drawing.Graphics]::FromImage($output)
    $outputGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $outputGraphics.DrawImage($bitmap, 0, 0, $size, $size)
    $name = if ($size -eq 180) { 'apple-touch-icon.png' } else { "icon-$size.png" }
    $output.Save((Join-Path $iconDirectory $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $outputGraphics.Dispose()
    $output.Dispose()
    $outline.Dispose()
    $seam.Dispose()
    $tab.Dispose()
    $body.Dispose()
    $lightBrush.Dispose()
    $darkBrush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
