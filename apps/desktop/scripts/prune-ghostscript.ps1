# Trim an extracted Ghostscript (vendor/ghostscript/) down to what the app
# actually runs, make it self-contained, and prove it still works.
#
# The Ghostscript Windows installer, unpacked with 7-Zip, carries ~50 MB the
# app never touches: HTML manuals (doc/), sample files (examples/), the GUI
# console (gswin64.exe), an import library (gsdll64.lib), NSIS leftovers, and a
# 25 MB Visual C++ redistributable *installer* that 7-Zip extraction never runs.
#
# That last one matters beyond size: gsdll64.dll links against the MSVC runtime
# (vcruntime140.dll, vcruntime140_1.dll, msvcp140.dll). Since the redist
# installer is never run, a PC without those DLLs could not start Ghostscript.
# Copying the three DLLs next to gsdll64.dll (Microsoft's "app-local"
# deployment) fixes that for ~1 MB instead of 25.
#
# Kept: bin/gswin64c.exe + gsdll64.dll, Resource/ (fonts, CMaps, init files --
# needed for correct output), lib/ (PDFA_def.ps for PDF/A), iccprofiles/
# (sRGB profile for PDF/A).
#
#   powershell -ExecutionPolicy Bypass -File scripts/prune-ghostscript.ps1 [-GsDir <path>]

param(
    [string]$GsDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "vendor\ghostscript")
)

$ErrorActionPreference = "Stop"

$bin = Join-Path $GsDir "bin"
$gs = Join-Path $bin "gswin64c.exe"
if (-not (Test-Path $gs)) { throw "Ghostscript not found at $gs" }

function Get-DirSizeMB([string]$path) {
    [math]::Round(((Get-ChildItem $path -Recurse -File -Force | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
}

$before = Get-DirSizeMB $GsDir

# --- 1. Remove what the app never uses ---------------------------------------
$unused = @(
    "doc",
    "examples",
    "`$PLUGINSDIR",
    "vcredist_x64.exe",
    "uninstgs.exe",
    "uninstgs.exe.nsis",
    "bin\gswin64.exe",
    "bin\gsdll64.lib"
)
foreach ($rel in $unused) {
    $target = Join-Path $GsDir $rel
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
        Write-Host "  removed $rel"
    }
}

# --- 2. Ship the MSVC runtime app-locally ------------------------------------
$runtime = @("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll")

# Prefer Visual Studio's redistributable folder (the files Microsoft licenses
# for app-local deployment); fall back to System32, which holds the same files
# wherever the redistributable is installed (always true on CI runners).
$crtDir = $null
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vs = & $vswhere -products * -latest -property installationPath
    if ($vs) {
        $crtDir = Get-ChildItem (Join-Path $vs "VC\Redist\MSVC") -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Get-ChildItem (Join-Path $_.FullName "x64") -Directory -Filter "Microsoft.VC*.CRT" -ErrorAction SilentlyContinue } |
            Where-Object { Test-Path (Join-Path $_.FullName "msvcp140.dll") } |
            Select-Object -First 1 -ExpandProperty FullName
    }
}
if (-not $crtDir) { $crtDir = Join-Path $env:SystemRoot "System32" }

foreach ($dll in $runtime) {
    $src = Join-Path $crtDir $dll
    if (-not (Test-Path $src)) { throw "MSVC runtime $dll not found in $crtDir" }
    Copy-Item $src (Join-Path $bin $dll) -Force
}
Write-Host "  copied MSVC runtime from $crtDir"

# --- 3. Prove the trimmed copy still does every job the app gives it ---------
$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ("gs-prune-" + [guid]::NewGuid())
New-Item -ItemType Directory $scratch | Out-Null
try {
    $src = Join-Path $scratch "in.pdf"
    $ps = "/Helvetica findfont 24 scalefont setfont 72 720 moveto (iLoathePDF smoke test) show showpage"
    & $gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite "-sOutputFile=$src" -c $ps
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $src)) { throw "Ghostscript could not write a PDF" }

    # pdf.compress (balanced / strong)
    $out = Join-Path $scratch "ebook.pdf"
    & $gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook "-sOutputFile=$out" $src
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $out)) { throw "Ghostscript /ebook compression failed" }

    # pdf.ocr page rasterising
    $png = Join-Path $scratch "page.png"
    & $gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=png16m -r300 "-sOutputFile=$png" $src
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $png)) { throw "Ghostscript PNG rendering failed" }

    # pdf.pdfa resources
    foreach ($rel in @("lib\PDFA_def.ps", "iccprofiles\default_rgb.icc")) {
        if (-not (Test-Path (Join-Path $GsDir $rel))) { throw "PDF/A resource missing after pruning: $rel" }
    }
}
finally {
    Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue
}

$after = Get-DirSizeMB $GsDir
Write-Host "Ghostscript trimmed: $before MB -> $after MB, and still working." -ForegroundColor Green
