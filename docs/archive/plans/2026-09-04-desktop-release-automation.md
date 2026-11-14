# Desktop App Release Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions workflow that builds the real NSIS installer for `apps/desktop` and publishes it as a GitHub Release asset, triggered by a version tag push or manual dispatch.

**Architecture:** One new workflow file, `.github/workflows/release-desktop.yml`, running on `windows-latest`. It replicates the exact local build steps documented in `apps/desktop/HANDOVER.md` and `README.md` (vendor Ghostscript, freeze the Python engine with PyInstaller, `tauri build`), then uploads the produced `.exe` to a GitHub Release via `softprops/action-gh-release`.

**Tech Stack:** GitHub Actions (Windows runner), PowerShell, npm workspaces, Rust/Tauri 2, Python 3.11/PyInstaller, NSIS (via Tauri's bundler).

## Global Constraints

- No changes to `apps/web` — `Download.tsx` already links to the generic `/releases` page and needs nothing further.
- No code signing, no version/tag-sync automation — both explicitly out of scope per the spec.
- Ghostscript source is pinned exactly: URL `https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10071/gs10071w64.exe`, sha256 `3a4c28d0aac47aa7cccd35a5932c55110376e9dbd966898dde388b7faba444a4` (from `apps/desktop/HANDOVER.md`). The workflow must verify this hash before running the installer and fail loudly on a mismatch — never silently proceed with an unverified binary.
- Action versions must match what's already proven in `.github/workflows/ci.yml`: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/setup-python@v7`, `dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2`.
- The job needs exactly `contents: write` permission — nothing broader.
- Do not install or run the produced installer on this machine or in CI as part of verification — that's a manual follow-up step, not something either task automates.

---

### Task 1: Write the release workflow

**Files:**
- Create: `.github/workflows/release-desktop.yml`

**Interfaces:**
- Produces: a GitHub Actions workflow triggerable by `push: tags: ["v*.*.*"]` or `workflow_dispatch`, consumed by Task 2 (which triggers and verifies it).

- [ ] **Step 1: Write the workflow file**

Create `.github/workflows/release-desktop.yml` with exactly this content:

```yaml
name: Release desktop

on:
  push:
    tags: ["v*.*.*"]
  workflow_dispatch:

concurrency:
  group: release-desktop-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  build-and-release:
    name: Build installer and publish release
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: package-lock.json

      - uses: dtolnay/rust-toolchain@stable

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: apps/desktop/src-tauri

      - uses: actions/setup-python@v7
        with:
          python-version: "3.11"
          cache: pip
          cache-dependency-path: apps/desktop/sidecar/requirements.txt

      - name: Install npm dependencies
        run: npm ci

      - name: Create venv and install sidecar dependencies
        working-directory: apps/desktop
        shell: pwsh
        run: |
          python -m venv .venv
          .venv\Scripts\python.exe -m pip install -r sidecar/requirements.txt

      - name: Download Ghostscript installer
        working-directory: apps/desktop
        shell: pwsh
        run: |
          $url = "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10071/gs10071w64.exe"
          $expectedHash = "3A4C28D0AAC47AA7CCCD35A5932C55110376E9DBD966898DDE388B7FABA444A4"
          Invoke-WebRequest -Uri $url -OutFile gs-installer.exe
          $actualHash = (Get-FileHash gs-installer.exe -Algorithm SHA256).Hash
          if ($actualHash -ne $expectedHash) {
            throw "Ghostscript installer hash mismatch. Expected $expectedHash, got $actualHash"
          }

      - name: Install Ghostscript into vendor/
        working-directory: apps/desktop
        shell: pwsh
        run: |
          $vendorPath = Join-Path (Get-Location) "vendor\ghostscript"
          Start-Process -FilePath ".\gs-installer.exe" -ArgumentList "/S", "/D=$vendorPath" -Wait
          if (-not (Test-Path (Join-Path $vendorPath "bin"))) {
            throw "Ghostscript did not install to the expected path: $vendorPath"
          }
          Remove-Item gs-installer.exe

      - name: Build frontend
        run: npm run build --workspace=apps/desktop

      - name: Build installer
        run: npm run build:app --workspace=apps/desktop

      - name: Locate installer
        id: installer
        shell: pwsh
        run: |
          $installer = Get-ChildItem -Path "apps/desktop/src-tauri/target/release/bundle/nsis" -Filter "*.exe" | Select-Object -First 1
          if (-not $installer) { throw "No NSIS installer found in apps/desktop/src-tauri/target/release/bundle/nsis" }
          echo "path=$($installer.FullName)" >> $env:GITHUB_OUTPUT

      - name: Determine release tag
        id: tag
        shell: pwsh
        run: |
          if ("${{ github.ref_type }}" -eq "tag") {
            echo "tag=${{ github.ref_name }}" >> $env:GITHUB_OUTPUT
            echo "prerelease=false" >> $env:GITHUB_OUTPUT
          } else {
            echo "tag=dev-${{ github.run_number }}" >> $env:GITHUB_OUTPUT
            echo "prerelease=true" >> $env:GITHUB_OUTPUT
          }

      - name: Publish release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.tag.outputs.tag }}
          name: iLoathePDF ${{ steps.tag.outputs.tag }}
          prerelease: ${{ steps.tag.outputs.prerelease }}
          generate_release_notes: true
          files: ${{ steps.installer.outputs.path }}
```

- [ ] **Step 2: Verify the file is well-formed YAML**

Run (from the repo root, using the Python already available in this environment):

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/release-desktop.yml'))" && echo "VALID YAML"
```

Expected: `VALID YAML` with no exception. If `pyyaml` isn't installed, run `pip install pyyaml` first (a throwaway dev-time check, not a project dependency — do not add it to any requirements file).

- [ ] **Step 3: Sanity-check the workflow structure**

Run:

```bash
python -c "
import yaml
doc = yaml.safe_load(open('.github/workflows/release-desktop.yml'))
assert doc['name'] == 'Release desktop'
assert 'push' in doc[True] or 'push' in doc.get('on', {})
job = doc['jobs']['build-and-release']
assert job['runs-on'] == 'windows-latest'
assert job['permissions'] if 'permissions' in job else doc['permissions']['contents'] == 'write'
step_names = [s.get('name') or s.get('uses') for s in job['steps']]
for expected in ['actions/checkout@v7', 'Download Ghostscript installer', 'Build installer', 'Locate installer', 'Publish release']:
    assert any(expected in str(n) for n in step_names), f'missing step: {expected}'
print('STRUCTURE OK')
"
```

Note: PyYAML parses the YAML `on:` key as the boolean `True` (a YAML 1.1 quirk — bare `on`/`off`/`yes`/`no` parse as booleans), which is why the check above looks under both `doc[True]` and `doc.get('on', {})`. This is expected and not a bug in the workflow file itself — YAML tooling in the wild (including some linters) special-cases this for GitHub Actions files, but plain PyYAML does not.

Expected: `STRUCTURE OK` with no assertion errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-desktop.yml
git commit -m "$(cat <<'EOF'
Add release workflow for the desktop app installer

Builds the NSIS installer (Tauri + PyInstaller-frozen Python engine +
vendored Ghostscript) on a tag push or manual dispatch, and publishes
it as a GitHub Release asset.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Trigger the workflow and verify a real release is published

**Files:**
- Modify: `.github/workflows/release-desktop.yml` (only if the run fails and needs a fix — see below)

**Interfaces:**
- Consumes: the workflow file from Task 1, triggered via `gh workflow run`.
- Produces: a real GitHub Release with exactly one `.exe` asset, verified via `gh` API calls — this is the plan's actual deliverable; Task 1 alone doesn't prove the build works.

- [ ] **Step 1: Push the workflow file if not already on the remote default branch**

The workflow must exist on the repository's default branch for `workflow_dispatch` to be available to trigger via `gh` or the Actions UI (this is a GitHub Actions constraint, not a project-specific rule). If Task 1's commit hasn't been pushed/merged yet, push it now:

```bash
git push
```

(If working in a branch/PR rather than directly on `main`, this step may instead mean waiting for that PR to merge — use judgment based on the actual repo state at execution time, and ask the controller if unclear rather than guessing.)

- [ ] **Step 2: Trigger a manual run**

```bash
gh workflow run release-desktop.yml
```

- [ ] **Step 3: Watch the run to completion**

```bash
gh run list --workflow=release-desktop.yml --limit 1
```

Take the run ID from the output, then:

```bash
gh run watch <run-id>
```

This can take several minutes (Rust compile + PyInstaller freeze + Ghostscript download). Wait for it to finish rather than polling aggressively.

- [ ] **Step 4: If the run fails, debug and fix**

Use the `superpowers:systematic-debugging` skill if the cause isn't immediately obvious from the logs. Common failure points to check first, in order of likelihood:

1. **Ghostscript hash mismatch or download failure** — `gh run view <run-id> --log-failed` and check the "Download Ghostscript installer" step. If the pinned release URL has gone stale (Artifex removed/renamed the asset), that's a real problem to report back, not silently work around with a different source.
2. **PyInstaller freeze failure** — check the "Build installer" step's `build:sidecar` output. Compare against known-good local behavior (this exact script has run successfully on this machine before, per `HANDOVER.md`).
3. **Tauri/Rust build failure** — check for MSVC toolchain or `cargo` PATH issues; `windows-latest` runners ship a working MSVC toolchain by default, so a failure here is more likely a real code/config issue than an environment gap.
4. **NSIS output path mismatch** — if "Locate installer" fails to find a `.exe`, check the actual produced path in the "Build installer" step's log and correct the `Get-ChildItem -Path` in the workflow file to match.

After any fix, commit it, push, and re-run from Step 2. Do not loop more than a few times without stepping back — if the same category of failure recurs, escalate rather than keep guessing.

- [ ] **Step 5: Verify the release was published correctly**

Once the run succeeds, find the tag it published under (from Step 3's run output, or the "Determine release tag" step's log — it will be `dev-<run-number>` for a manual dispatch run) and verify:

```bash
gh release view dev-<run-number> --json tagName,name,isPrerelease,assets
```

Expected: `isPrerelease` is `true` (manual-dispatch runs are marked as prereleases per the workflow), exactly one asset in `assets`, and that asset's `name` ends in `.exe`.

Then check the asset's size is plausible (not a corrupted/empty artifact — HANDOVER.md notes the frozen engine alone is ~81 MB, so the full installer should be at least in that range, likely larger):

```bash
gh release view dev-<run-number> --json assets --jq '.assets[0].size'
```

Expected: a number greater than 50000000 (50 MB). If it's suspiciously small, treat that as a failure and return to Step 4.

- [ ] **Step 6: Do not install the produced binary**

Per this plan's Global Constraints, do not download and run the installer as part of this task's verification — confirming the release and asset exist via the GitHub API (Step 5) is the deliverable. Installing/uninstalling and using every tool (the manual QA HANDOVER.md's own M6 milestone calls for) is a follow-up for the controller to do with the user's explicit go-ahead, not something this task does unprompted.

- [ ] **Step 7: Report**

No commit is needed for this step if Step 4 required no fixes (the workflow already exists from Task 1's commit). If Step 4 did require a fix, that fix was already committed and pushed as part of the debug loop. Report the final verified state: the run ID, the tag it published, and the confirmed asset name/size from Step 5.
