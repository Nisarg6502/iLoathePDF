#!/usr/bin/env bash
# macOS twin of build-sidecar.ps1: freeze the Python document engine into
# build/sidecar/iloathepdf-sidecar/, which tauri.conf.json ships as the app
# resource "sidecar/". Same PyInstaller options and the same smoke test; see
# build-sidecar.ps1 for why each one is there.
#
#   bash scripts/build-sidecar.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
python="$root/.venv/bin/python"
dist="$root/build/sidecar"
work="$root/build/pyinstaller"

if [[ ! -x "$python" ]]; then
  echo "venv not found at $python. Create it with: python3 -m venv .venv" >&2
  exit 1
fi

echo "Freezing the document engine..."
export PYTHONPATH="$root/sidecar"

"$python" -m PyInstaller \
  --noconfirm \
  --onedir \
  --console \
  --name iloathepdf-sidecar \
  --distpath "$dist" \
  --workpath "$work" \
  --specpath "$work" \
  --paths "$root/sidecar" \
  --collect-submodules ops \
  --collect-all pikepdf \
  --collect-all pillow_heif \
  --collect-all img2pdf \
  --collect-all reportlab \
  --collect-all pdfplumber \
  --collect-all pdfminer \
  --collect-all openpyxl \
  --hidden-import PIL.Image \
  --hidden-import PIL.ImageOps \
  --exclude-module tkinter \
  --exclude-module _tkinter \
  --exclude-module PIL.ImageTk \
  --exclude-module PIL._avif \
  "$root/sidecar/main.py"

exe="$dist/iloathepdf-sidecar/iloathepdf-sidecar"
if [[ ! -x "$exe" ]]; then
  echo "expected executable not produced at $exe" >&2
  exit 1
fi

# Drive the frozen engine the way Rust does: one JSON line in, one line out.
# A real op (pdf.info on a missing file -> FILE_NOT_FOUND) proves the
# dynamically imported ops modules were collected, not just sys.ping.
echo "Smoke testing the frozen engine..."
"$python" - "$exe" "$dist/__sidecar_smoke_test_missing__.pdf" <<'EOF'
import json, subprocess, sys

exe, missing = sys.argv[1], sys.argv[2]

def ask(request):
    proc = subprocess.Popen([exe], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    proc.stdin.write(json.dumps(request) + "\n")
    proc.stdin.flush()
    reply = proc.stdout.readline()
    proc.stdin.close()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    return reply

ping = ask({"id": "1", "op": "sys.ping", "params": {}})
try:
    pong = json.loads(ping).get("data", {}).get("pong")
except ValueError:
    pong = None
if pong is not True:
    sys.exit(f"frozen engine did not answer sys.ping. Got: {ping!r}")

info = ask({"id": "2", "op": "pdf.info", "params": {"input": missing}})
try:
    code = json.loads(info).get("code")
except ValueError:
    code = None
if code != "FILE_NOT_FOUND":
    sys.exit(f"frozen engine's ops modules did not load correctly. Got: {info!r}")
print("engine answered sys.ping and pdf.info")
EOF

size="$(du -sh "$dist" | cut -f1)"
echo "Engine built and answering: $exe ($size)"
