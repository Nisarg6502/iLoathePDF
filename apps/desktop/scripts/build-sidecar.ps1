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

& $python -m PyInstaller `
    --noconfirm `
    --onedir `
    --console `
    --name iloathepdf-sidecar `
    --distpath $dist `
    --workpath $work `
    --specpath $work `
    --paths (Join-Path $root "sidecar") `
    --collect-all pikepdf `
    --collect-all pillow_heif `
    --collect-all img2pdf `
    --hidden-import PIL.Image `
    --hidden-import PIL.ImageOps `
    (Join-Path $root "sidecar\main.py")

if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE" }

$exe = Join-Path $dist "iloathepdf-sidecar\iloathepdf-sidecar.exe"
if (-not (Test-Path $exe)) { throw "expected executable not produced at $exe" }

# Smoke test the frozen build the same way Rust will drive it: one JSON line
# in, one result line out. A frozen engine that cannot answer sys.ping would
# otherwise only fail after the whole installer is built.
Write-Host "Smoke testing the frozen engine..." -ForegroundColor Cyan
# PowerShell 5.1 defaults $OutputEncoding to UTF-8 *with* a BOM, which the
# engine would see as a leading U+FEFF and reject as malformed JSON.
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
# Redirecting a native command's stderr turns each line into an ErrorRecord,
# which $ErrorActionPreference = "Stop" would treat as a fatal error, so the
# banner the engine logs on startup has to be tolerated here.
$ErrorActionPreference = "Continue"
$reply = '{"id":"1","op":"sys.ping","params":{}}' | & $exe 2>$null | Select-Object -First 1
$ErrorActionPreference = "Stop"

if ($reply -notmatch '"pong"\s*:\s*true') {
    throw "frozen engine did not answer sys.ping. Got: $reply"
}

$size = "{0:N0}" -f ((Get-ChildItem $dist -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB)
Write-Host "Engine built and answering: $exe ($size MB)" -ForegroundColor Green
