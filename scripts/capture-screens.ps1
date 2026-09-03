# Capture every screen of the app, light and dark, into design/screenshots/.
#
# Needs the dev server running (`npm run dev`, or `npm run tauri dev`).
# Uses headless Chrome rather than a test-runner dependency, so this stays a
# zero-install script.
#
#   powershell -ExecutionPolicy Bypass -File scripts/capture-screens.ps1

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "design\screenshots"
$origin = "http://localhost:5173"

$chrome = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) { throw "No Chrome or Edge found for headless capture." }

try {
    Invoke-WebRequest -Uri $origin -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {
    throw "Dev server is not answering on $origin. Start it with: npm run dev"
}

New-Item -ItemType Directory -Force -Path $out | Out-Null

# name -> hash route
$screens = [ordered]@{
    "01-home"           = "/"
    "02-merge"          = "/t/merge"
    "03-split"          = "/t/split"
    "04-organize"       = "/t/organize"
    "05-compress"       = "/t/compress"
    "06-pdf-to-image"   = "/t/pdf-to-image"
    "07-image-to-pdf"   = "/t/image-to-pdf"
    "08-convert-image"  = "/t/convert-image"
    "09-settings"       = "/settings"
    "10-components"     = "/lab"
}

$size = "1400,950"
$count = 0

foreach ($theme in @("light", "dark")) {
    foreach ($name in $screens.Keys) {
        $file = Join-Path $out "$name-$theme.png"
        # The theme lives in a query string, the route in the hash.
        $url = "$origin/?theme=$theme#$($screens[$name])"

        # Chrome writes progress to stderr, which PowerShell would otherwise
        # promote to a terminating error. Start-Process keeps it out of the way.
        $args = @(
            "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--virtual-time-budget=4000", "--window-size=$size",
            "--screenshot=$file", $url
        )
        Start-Process -FilePath $chrome -ArgumentList $args -Wait -NoNewWindow `
            -RedirectStandardError "$env:TEMP\iloathepdf-shot.log" | Out-Null

        if (Test-Path $file) {
            $kb = [math]::Round((Get-Item $file).Length / 1KB)
            Write-Host ("  {0,-28} {1,5} KB" -f "$name-$theme.png", $kb)
            $count++
        } else {
            Write-Warning "failed to capture $name-$theme"
        }
    }
}

Write-Host ""
Write-Host "$count screenshots written to $out" -ForegroundColor Green
