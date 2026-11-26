#!/usr/bin/env bash
# Prove a built iLoathePDF.app works on this Mac, as far as a machine with no
# one in front of it can:
#
#  1. the engine inside the bundle answers, and finds the bundled Ghostscript
#     from the bundle's own layout (strong compression runs Ghostscript);
#  2. the app starts, stays up, and starts its engine;
#  3. a screenshot of the window is saved for a person to look at;
#  4. the app has put its Finder right-click items (Quick Actions) in
#     ~/Library/Services, and running them does the job in place, both
#     with the app open (handed over to it) and closed (the app starts for
#     the job alone, then quits by itself). A second screenshot catches the
#     progress card.
#
# Finder's menu itself can't be clicked from here; Automator runs the same
# workflow Finder would.
#
#   bash scripts/check-macos-bundle.sh <path/to/iLoathePDF.app> <screenshot.png>
set -euo pipefail

app="$1"
shot="$2"
root="$(cd "$(dirname "$0")/.." && pwd)"
python="$root/.venv/bin/python"
services="$HOME/Library/Services"
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

echo "4. Finder quick actions..."
# The main window writes them when it starts (src/lib/finderActions.ts).
count="$(find "$services" -maxdepth 1 -name 'iLoathePDF-*.workflow' | wc -l | tr -d ' ')"
echo "$count Quick Actions in $services"
if [[ "$count" -ne 16 ]]; then
  echo "expected 16 iLoathePDF Quick Actions" >&2
  ls -la "$services" >&2 || true
  kill "$pid"
  exit 1
fi
for plist in "$services"/iLoathePDF-*.workflow/Contents/*; do
  plutil -lint -s "$plist" || { echo "not a valid plist: $plist" >&2; kill "$pid"; exit 1; }
done
grep -q "<string>iLoathePDF: Compress</string>" "$services/iLoathePDF-run-compress.workflow/Contents/Info.plist"
grep -q "<string>public.zip-archive</string>" "$services/iLoathePDF-run-extract-here.workflow/Contents/Info.plist"
echo "Registered with the Services menu:"
/System/Library/CoreServices/pbs -dump 2>/dev/null | grep -o 'iLoathePDF: [^";]*' | sort -u || echo "(pbs -dump lists nothing here)"

work="$(mktemp -d)"
"$python" - "$work" <<'PY'
import sys
from pathlib import Path
from reportlab.pdfgen import canvas
for name in ("a.pdf", "b.pdf"):
    c = canvas.Canvas(str(Path(sys.argv[1]) / name))
    c.drawString(72, 720, name)
    c.rect(72, 300, 400, 300, fill=1)
    c.showPage()
    c.save()
PY

# Runs one Quick Action on files, the way Finder does, through Automator.
run_quick_action() {
  local workflow="$services/$1"
  shift
  if ! automator -i "$*" "$workflow"; then
    # Automator from a script can be refused on a headless machine; the
    # workflow's own command is what matters, so run that directly.
    echo "automator could not run $workflow; running its command directly" >&2
    local command
    command="$(plutil -extract actions.0.action.ActionParameters.COMMAND_STRING raw "$workflow/Contents/document.wflow")"
    /bin/sh -c "$command" sh "$@"
  fi
}

# Waits up to $2 seconds for a file matching the glob $1.
wait_for() {
  local i
  for ((i = 0; i < $2; i++)); do
    compgen -G "$1" > /dev/null && return 0
    sleep 1
  done
  return 1
}

echo "4a. Compress, with the app open..."
run_quick_action iLoathePDF-run-compress.workflow "$work/a.pdf"
if ! wait_for "$work/a-*.pdf" 60; then
  echo "compress quick action wrote nothing next to the file:" >&2
  ls -la "$work" >&2
  cat /tmp/iloathepdf-app.log >&2
  kill "$pid"
  exit 1
fi
ls "$work"
kill "$pid"
wait "$pid" 2>/dev/null || true
sleep 2

echo "4b. Merge, with the app closed..."
run_quick_action iLoathePDF-run-merge.workflow "$work/a.pdf" "$work/b.pdf"
if ! wait_for "$work/merged*.pdf" 90; then
  echo "merge quick action wrote nothing next to the files:" >&2
  ls -la "$work" >&2
  exit 1
fi
ls "$work"
screencapture -x "${shot%.png}-quick-action.png" || echo "screencapture failed"
# Started only for the job, the app quits once the card has closed itself.
for ((i = 0; i < 60; i++)); do
  pgrep -f "$binary" > /dev/null || break
  sleep 1
done
if pgrep -f "$binary" > /dev/null; then
  echo "the app is still running after its quick action finished" >&2
  pkill -f "$binary" || true
  exit 1
fi
echo "the app quit by itself after the quick action"
rm -rf "$work"
echo "bundle check passed"
