#!/usr/bin/env bash
# Build the macOS app and its .dmg for this Mac's architecture (Apple Silicon
# or Intel), end to end: Python venv, Ghostscript, the frozen document engine,
# then the Tauri bundle. Used by .github/workflows/release-desktop.yml and
# macos-app.yml; runs the same on a developer's Mac.
#
#   bash scripts/build-macos.sh
#
# With TAURI_SIGNING_PRIVATE_KEY set (releases), the build also writes the
# signed update archive (iLoathePDF.app.tar.gz + .sig) that installed copies
# update from. Without it (pull requests, local builds) that step is skipped.
#
# The app is signed ad hoc ("-" in tauri.macos.conf.json), not with an Apple
# Developer ID, and is not notarised: Apple Silicon Macs refuse to run code
# with no signature at all, and an ad-hoc one costs nothing. The first launch
# therefore needs the user's OK in Finder (right-click > Open) or in System
# Settings > Privacy & Security; the download page explains this.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

export MACOSX_DEPLOYMENT_TARGET="11.0"

if [[ ! -x .venv/bin/python ]]; then
  echo "Creating the Python venv..."
  "${PYTHON:-python3}" -m venv .venv
fi
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -r sidecar/requirements.txt

if [[ -x vendor/ghostscript/bin/gs && -z "${REBUILD_GHOSTSCRIPT:-}" ]]; then
  echo "Using the Ghostscript already in vendor/ (REBUILD_GHOSTSCRIPT=1 to rebuild)."
else
  bash scripts/build-ghostscript-macos.sh
fi

bash scripts/build-sidecar.sh

tauri_args=(build --bundles app,dmg)
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  echo "No TAURI_SIGNING_PRIVATE_KEY: building without the signed update archive."
  tauri_args+=(--config '{"bundle":{"createUpdaterArtifacts":false}}')
fi
npx tauri "${tauri_args[@]}"

echo "Built:"
ls -lh src-tauri/target/release/bundle/dmg/*.dmg
ls -lh src-tauri/target/release/bundle/macos/
