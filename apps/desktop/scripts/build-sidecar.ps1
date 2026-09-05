# Freeze the Python document engine into build/sidecar/iloathepdf-sidecar/,
# which tauri.conf.json ships as the app resource "sidecar/".
#
# --onedir, deliberately: --onefile re-extracts to %TEMP% on every launch and
# is a frequent Windows Defender false positive. See SPECS.md.
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-sidecar.ps1

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
$dist = Join-Path $root "build\sidecar"
$work = Join-Path $root "build\pyinstaller"

if (-not (Test-Path $python)) {
    throw "venv not found at $python. Create it with: python -m venv .venv"
}

Write-Host "Freezing the document engine..." -ForegroundColor Cyan

# --collect-submodules ops expands to a `collect_submodules('ops')` call
# baked into the generated .spec file, which runs `import ops` using the
# *build process's own* sys.path -- `--paths` only reaches Analysis()'s
# pathex, not that earlier call. Without sidecar/ on PYTHONPATH here, that
# import fails silently and every op-dispatch module gets left out.
$env:PYTHONPATH = Join-Path $root "sidecar"

& $python -m PyInstaller `
    --noconfirm `
    --onedir `
    --console `
    --name iloathepdf-sidecar `
    --distpath $dist `
    --workpath $work `
    --specpath $work `
    --paths (Join-Path $root "sidecar") `
    --collect-submodules ops `
    --collect-all pikepdf `
    --collect-all pillow_heif `
    --collect-all img2pdf `
    --collect-all reportlab `
    --hidden-import PIL.Image `
    --hidden-import PIL.ImageOps `
    (Join-Path $root "sidecar\main.py")

if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE" }

$exe = Join-Path $dist "iloathepdf-sidecar\iloathepdf-sidecar.exe"
if (-not (Test-Path $exe)) { throw "expected executable not produced at $exe" }

# Smoke test the frozen build the same way Rust will drive it: one JSON line
# in, one result line out. A frozen engine that cannot answer sys.ping would
# otherwise only fail after the whole installer is built.
#
# Every op in DISPATCH is imported dynamically by string
# (`importlib.import_module`), which PyInstaller's static analysis cannot
# see -- without --collect-submodules ops above, every single op silently
# fails at runtime with "not implemented yet" while sys.ping (handled inline,
# no dynamic import) keeps answering fine. So this smoke test drives a real
# op, not just sys.ping, or this exact regression slips through again.
Write-Host "Smoke testing the frozen engine..." -ForegroundColor Cyan

function Invoke-SidecarRequest([string]$exePath, [string]$requestJson) {
    # `'...' | & $exe` closes stdin the moment the single line is written,
    # but ops run on a daemon thread (see sidecar/main.py) -- closing stdin
    # ends the main loop and kills that thread before it can reply. A .NET
    # Process with its own streams lets us write, flush, and only close
    # stdin after a reply line has actually been read.
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exePath
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.StandardOutputEncoding = New-Object System.Text.UTF8Encoding $false
    $proc = [System.Diagnostics.Process]::Start($psi)
    $proc.StandardInput.NewLine = "`n"
    $proc.StandardInput.WriteLine($requestJson)
    $proc.StandardInput.Flush()
    $reply = $proc.StandardOutput.ReadLine()
    $proc.StandardInput.Close()
    if (-not $proc.WaitForExit(5000)) { $proc.Kill() }
    return $reply
}

$pingReply = Invoke-SidecarRequest $exe '{"id":"1","op":"sys.ping","params":{}}'
if ($pingReply -notmatch '"pong"\s*:\s*true') {
    throw "frozen engine did not answer sys.ping. Got: $pingReply"
}

# pdf.info on a path that does not exist: proves the ops.pdf_info module
# actually resolved and ran (FILE_NOT_FOUND), rather than failing to import
# (INTERNAL / "not implemented yet").
$missingPath = (Join-Path $dist "__sidecar_smoke_test_missing__.pdf") -replace '\\', '\\\\'
$infoReply = Invoke-SidecarRequest $exe ('{{"id":"2","op":"pdf.info","params":{{"input":"{0}"}}}}' -f $missingPath)
if ($infoReply -notmatch '"FILE_NOT_FOUND"') {
    throw "frozen engine's ops modules did not load correctly. Got: $infoReply"
}

$size = "{0:N0}" -f ((Get-ChildItem $dist -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB)
Write-Host "Engine built and answering: $exe ($size MB)" -ForegroundColor Green
