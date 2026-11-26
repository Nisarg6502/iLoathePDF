#!/usr/bin/env bash
# Prove a built iLoathePDF.app works on this Mac, as far as a machine with no
# one in front of it can:
#
#  1. the engine inside the bundle answers, and finds the bundled Ghostscript
#     from the bundle's own layout (strong compression runs Ghostscript);
#  2. the app starts, stays up, and starts its engine;
#  3. a screenshot of the window is saved for a person to look at.
#
#   bash scripts/check-macos-bundle.sh <path/to/iLoathePDF.app> <screenshot.png>
set -euo pipefail

app="$1"
shot="$2"
root="$(cd "$(dirname "$0")/.." && pwd)"
python="$root/.venv/bin/python"
engine="$app/Contents/Resources/sidecar/iloathepdf-sidecar"
binary="$app/Contents/MacOS/iLoathePDF"

for f in "$engine" "$binary" "$app/Contents/Resources/vendor/ghostscript/bin/gs"; do
  [[ -x "$f" ]] || { echo "missing from the bundle: $f" >&2; exit 1; }
done

echo "Signature:"
codesign -dv "$app" 2>&1 | grep -E "Signature|Identifier|Format" || true
codesign --verify --verbose=2 "$app"

echo "1. Engine + Ghostscript from inside the bundle..."
work="$(mktemp -d)"
"$python" - "$engine" "$work" <<'EOF'
import json, subprocess, sys
from pathlib import Path
from reportlab.pdfgen import canvas

engine, work = sys.argv[1], Path(sys.argv[2])
src = work / "in.pdf"
c = canvas.Canvas(str(src))
for page in range(3):
    c.setFont("Helvetica", 18)
    c.drawString(72, 720, f"iLoathePDF macOS check, page {page + 1}")
    c.rect(72, 300, 400, 300, fill=1)
    c.showPage()
c.save()

request = {"id": "1", "op": "pdf.compress",
           "params": {"input": str(src), "output": str(work / "out.pdf"), "level": "strong"}}
proc = subprocess.Popen([engine], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
proc.stdin.write(json.dumps(request) + "\n")
proc.stdin.flush()
reply = None
for line in proc.stdout:
    message = json.loads(line)
    if message.get("type") in ("result", "error"):
        reply = message
        break
proc.stdin.close()
proc.wait(timeout=30)
print(reply)
if not reply or reply.get("type") != "result" or reply["data"].get("engine") != "ghostscript":
    sys.exit("the bundled engine could not compress with the bundled Ghostscript")
EOF
rm -rf "$work"

echo "2. Starting the app..."
"$binary" > /tmp/iloathepdf-app.log 2>&1 &
pid=$!
sleep 20
if ! kill -0 "$pid" 2>/dev/null; then
  echo "the app exited on its own:" >&2
  cat /tmp/iloathepdf-app.log >&2
  exit 1
fi
if ! pgrep -f "Resources/sidecar/iloathepdf-sidecar" > /dev/null; then
  echo "the app is up but its document engine is not running" >&2
  cat /tmp/iloathepdf-app.log >&2
  kill "$pid"
  exit 1
fi
echo "app and engine running"

echo "3. Screenshot..."
osascript -e 'tell application "System Events" to set frontmost of (first process whose unix id is '"$pid"') to true' || true
# CI screens are small (1024x768): pull the window fully on screen so the
# whole title bar, macOS's own window buttons included, is in the picture.
osascript -e 'tell application "System Events" to tell (first process whose unix id is '"$pid"') to set position of window 1 to {0, 25}' || true
osascript -e 'tell application "System Events" to tell (first process whose unix id is '"$pid"') to set size of window 1 to {1000, 720}' || true
sleep 2
screencapture -x "$shot" || echo "screencapture failed (no screen access on this machine)"

kill "$pid"
wait "$pid" 2>/dev/null || true
echo "bundle check passed"
