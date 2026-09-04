# Desktop App Release Automation

## Context

`apps/desktop` is a Tauri 2 + React + Python (Ghostscript/pikepdf) desktop app. Per [HANDOVER.md](../../../apps/desktop/HANDOVER.md), the engine and UI are both done and tested (116 tests passing), and the app freezes to a working standalone executable — but the NSIS installer has never actually been built (milestone M6: "freeze works; installer never built"), and no GitHub Release exists.

The web app's [Download.tsx](../../../apps/web/src/pages/Download.tsx) already links to `https://github.com/Nisarg6502/iLoathePDF/releases` — it doesn't need to change. What's missing is a release with an installer asset attached.

This machine already has every prerequisite the build needs (verified during brainstorming): Ghostscript vendored at `vendor/ghostscript/`, Rust/cargo, Node 22, Python 3.11. But a one-off local build doesn't scale to future versions, so the chosen path is CI automation rather than a manual build-and-upload.

## Goal

A GitHub Actions workflow that builds the real NSIS installer and publishes it as a GitHub Release asset, triggered either by pushing a version tag or by manual dispatch.

## Design

### Trigger

New workflow file: `.github/workflows/release-desktop.yml`

```yaml
on:
  push:
    tags: ["v*.*.*"]
  workflow_dispatch:
```

Both a tag push (`v0.1.0`, etc.) and a manual "Run workflow" button trigger a build. Manual dispatch is for test builds without committing to a tag.

### Job

Single job, `runs-on: windows-latest` — matches the existing `rust` job in [ci.yml](../../../.github/workflows/ci.yml), since NSIS bundling and the MSVC toolchain are Windows-only.

Steps, in order:

1. **Checkout.**
2. **Setup Node 22** (`actions/setup-node@v7`, matching `ci.yml`'s frontend job), `npm ci`.
3. **Setup Rust** (`dtolnay/rust-toolchain@stable`, matching `ci.yml`'s rust job) with the MSVC host toolchain (default on `windows-latest`).
4. **Setup Python 3.11** (`actions/setup-python@v7`, matching `ci.yml`'s engine job).
5. **Create the venv and install sidecar dependencies**, mirroring [README.md](../../../apps/desktop/README.md)'s "Getting set up" section:
   ```powershell
   python -m venv apps/desktop/.venv
   apps/desktop/.venv/Scripts/python.exe -m pip install -r apps/desktop/sidecar/requirements.txt
   ```
   (`pyinstaller` is already pinned in `requirements.txt`, so no separate install step is needed — `build-sidecar.ps1` invokes it directly.)
6. **Vendor Ghostscript.** Download the exact build HANDOVER.md already pins and verifies:
   - URL: `https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10071/gs10071w64.exe`
   - sha256: `3a4c28d0aac47aa7cccd35a5932c55110376e9dbd966898dde388b7faba444a4`

   Verify the downloaded file's hash matches before running it (fail the workflow if it doesn't — a changed hash means the pinned release moved or was tampered with, not something to silently accept). Then silent-install directly into the vendor path Tauri's `bundle.resources` expects, skipping a separate copy step:
   ```powershell
   Start-Process -FilePath gs10071w64.exe -ArgumentList "/S", "/D=$(Resolve-Path apps/desktop)\vendor\ghostscript" -Wait
   ```
7. **Build the frontend** the desktop app embeds: `npm run build --workspace=apps/desktop` (same command `ci.yml`'s frontend job already runs and relies on `beforeBuildCommand` in `tauri.conf.json` to trigger anyway, but running it explicitly first surfaces a frontend build failure before the much slower Rust/PyInstaller steps run).
8. **Build the installer**: `npm run build:app --workspace=apps/desktop` — this already chains `build:sidecar` (PyInstaller freeze + smoke test) and `tauri build` (which runs `beforeBuildCommand` again, harmlessly, and produces the NSIS bundle).
9. **Locate the installer**: `apps/desktop/src-tauri/target/release/bundle/nsis/*.exe` (Tauri's standard NSIS output path for this config).
10. **Publish the GitHub Release**, via `softprops/action-gh-release@v2`:
    - `files: apps/desktop/src-tauri/target/release/bundle/nsis/*.exe`
    - `tag_name`: the pushed tag (on tag-push triggers) or a generated dev tag like `dev-${{ github.run_number }}` with `prerelease: true` (on manual dispatch, so test builds don't collide with real version tags)
    - `name`: `iLoathePDF ${{ tag_name }}`
    - `generate_release_notes: true` (GitHub's automatic PR-based changelog, zero extra maintenance)

### Permissions

The job needs `contents: write` (to create the release) — the narrowest permission that action needs, following `ci.yml` and `deploy-web.yml`'s existing pattern of declaring exactly what each workflow requires.

### What's explicitly out of scope

- **Code signing.** [SPECS.md](../../../apps/desktop/SPECS.md) already documents the unsigned-installer SmartScreen warning as an accepted trade-off for a personal tool. Not revisited here.
- **Version/tag sync automation.** `tauri.conf.json`'s `"version": "0.1.0"` field is not auto-bumped or auto-validated against the pushed tag. Keeping a tag's version matching the config is a manual-discipline step when cutting a release, not tooling this spec builds — the project has no release cadence yet to justify that machinery, and mismatches are easy to catch by eye before pushing a tag.
- **macOS/Linux builds.** The web app's Download page already says "No installer for macOS or Linux yet. Both work fine in the browser version" — this spec doesn't change that.
- **Any change to the web app.** `Download.tsx` already links to the generic `/releases` page; that continues to work once a release exists.

## Testing

No existing automated test targets a GitHub Actions workflow file. Verification is: trigger the workflow manually (`workflow_dispatch`) once it's written, watch it run to completion, download the produced installer from the resulting draft/prerelease, and confirm it installs and runs on this machine — the same manual verification `HANDOVER.md`'s own "Next steps" already calls for (M6: "install it, run the wizard to a non-default directory, use every tool from the installed build, and uninstall").
