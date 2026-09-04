# iLoathePDF — Handover

> Where the project actually is. Rewritten in place at the end of every session
> where code moved. For the design and the frozen decisions, see [SPECS.md](SPECS.md).

**Last updated:** 2026-09-03

## Status

The document engine is done: **116 tests passing, 1 skipped**, now including the
Ghostscript compression and rasterising paths. It freezes to a working 81 MB
standalone executable, so packaging is proven.

The UI is built and verified in the browser: home grid, tool workspaces, page
canvas, progress and result cards all render in light and dark. The frontend
typechecks clean under `strict` and builds for production.

Both earlier blockers are cleared — MSVC Build Tools 14.44 and Ghostscript
10.07.1 are installed. What remains is running the real desktop app end to end
and building the installer.

## Repository

`https://github.com/Nisarg6502/iLoathePDF` — **public**.

- **`main` is protected and built through pull requests.** Required checks are
  Frontend, Document engine and Rust; the branch must be up to date; linear
  history is required; force pushes and deletions are blocked; and
  **`enforce_admins` is on**, so the rule applies to the owner too.
  Approvals are set to 0 — a solo owner cannot approve their own PR.
- **Turning `enforce_admins` off makes the protection decorative.** It was off
  initially, and a test push to `main` sailed through with
  `remote: Bypassed rule violations`. If you need an emergency hotfix, untick
  *"Do not allow bypassing the above settings"*, push, then tick it back.
- `.githooks/pre-push` is now belt-and-braces: GitHub enforces the rule
  server-side, the hook just fails faster. A fresh clone needs
  `git config core.hooksPath .githooks`; `--no-verify` bypasses it.
- **CI** (`.github/workflows/ci.yml`) runs three jobs on every push and PR:
  Frontend (oxlint, tsc, vite build), Document engine (pytest on Linux **with
  Ghostscript installed**, so the compression and rasterising tests run rather
  than skip), and Rust (fmt + clippy with `-D warnings` on Windows).
- **The Rust job creates `vendor/` and `build/sidecar/iloathepdf-sidecar/`
  before linting.** `tauri_build` validates every `bundle.resources` path at
  build-script time, and both are gitignored — a clean checkout has neither, so
  the build script fails before clippy runs. This cost one red CI run; do not
  remove that step.
- **Dependabot** covers npm, cargo, pip and github-actions; patch and minor
  updates are grouped into one PR per ecosystem. Its first five PRs are merged:
  actions/checkout, setup-node and setup-python are all on v7 (which cleared the
  Node 20 deprecation warnings), TypeScript is on **7.0.2** and @types/node on
  26.
- **TypeScript 7 is the native Go compiler.** A full typecheck now takes well
  under a second on CI, which looks like a skipped step and is not — it was
  verified by feeding it a deliberate type error and watching it fail.

## Milestone checklist

| | Milestone | State |
| --- | --- | --- |
| M0 | Scaffold: Vite + React + TS + Tailwind v4, Python venv, Tauri shell, SPECS/HANDOVER | ✅ |
| M1 | The bridge: JSON-lines protocol, Rust core, `sys.ping` round-trip | 🚧 compiles; live round-trip not yet run |
| M2 | Merge / split / organize (pikepdf) | ✅ engine + UI wired, incl. page canvas |
| M3 | Compress (Ghostscript + pikepdf) | ✅ Ghostscript 10.07.1 vendored, tests green |
| M4 | Image conversion (Pillow + pillow-heif) | ✅ |
| M5 | Images ↔ PDF | ✅ |
| M6 | Polish, PyInstaller build, NSIS installer, network-silence check | 🚧 freeze works; installer never built |
| M7 | Redesign from the Claude Design canvas, rename to iLoathePDF, repo + CI | ✅ |

## Third-party binaries

**Ghostscript 10.07.1 (AGPL)** is installed at `vendor/ghostscript/`, from the
official Artifex release
([gs10071w64.exe](https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/tag/gs10071),
sha256 `3a4c28d0aac47aa7cccd35a5932c55110376e9dbd966898dde388b7faba444a4`),
silent-installed with `/S /D=`. `find_ghostscript()` looks there first and
`bundle.resources` ships the whole folder — Ghostscript needs its `Resource/`
and `lib/` directories beside the executable, not just the two binaries.
`ILOATHEPDF_GS` overrides the path for ad-hoc testing.

`vendor/` is gitignored, so a fresh clone must reinstall it. See the AGPL note in
SPECS.md before distributing anything.

**MSVC Build Tools 14.44** (`Microsoft.VisualStudio.Workload.VCTools`) is
installed at `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`.
Note that `C:\msys64\ucrt64\bin` is on PATH and contains a GNU `link` that
shadows MSVC's `link.exe`; rustc finds the right one on its own, but a build run
from a shell that puts msys2 first can fail confusingly.

## Environment

| | |
| --- | --- |
| Node | 22.23.1 |
| npm | 10.2.4 |
| Python | 3.11.3 (`.venv/Scripts/python.exe`) |
| Rust | 1.98.0, MSVC host (Build Tools 14.44) |
| Ghostscript | 10.07.1 in `vendor/ghostscript/` |
| WebView2 runtime | 152.0.4191.53 (present) |
| Python packages | pikepdf 10.12.0, Pillow 12.3.0, pillow-heif 1.6.0, img2pdf 0.6.3, pytest 9.1.1, pyinstaller 6.22.2 |

## How to run

```bash
# Engine tests: unit + end-to-end over real stdio (~50s with Ghostscript)
npm test

# Talk to the engine by hand
echo '{"id":"1","op":"sys.ping","params":{}}' | ./.venv/Scripts/python.exe sidecar/main.py

# UI in a plain browser -- jobs.ts falls back to a mock, no Tauri needed.
# /#/lab is the component workbench (dev builds only).
npm run dev

# Frontend typecheck
npm run typecheck

# Full desktop app
npm run tauri dev

# Freeze the engine on its own (~40s, self-smoke-tests)
npm run build:sidecar

# Installer
npm run build:app
```

## Decisions made since SPECS.md

- **Hand-rolled shadcn-style primitives instead of the shadcn CLI.** The CLI
  rewrites shared config, which was unsafe with several agents working in the
  repo at once. Same visual language, fewer moving parts.
  Primitives live in `src/components/ui/`.
- **The engine is spawned with `std::process::Command`, not `tauri-plugin-shell`.**
  We ship the PyInstaller onedir folder through `bundle.resources` and launch it
  by absolute path, so the shell plugin's scope machinery buys nothing.
- **`run_job` hands work to the blocking pool.** Jobs take seconds; leaving them
  on an async worker thread would stall the runtime.
- **Engine startup failure is non-fatal.** The window opens and the UI reports the
  error, rather than the process dying before anything is visible.
- **`read_file_bytes` is a Rust command, not `tauri-plugin-fs`.** The page canvas
  needs a PDF's bytes for pdf.js; the plugin's scope machinery cannot express
  "whatever file the user just picked", and the command returns
  `tauri::ipc::Response` so a 50 MB scan is not serialised as a JSON number array.
- **`/lab` is a dev-only route** (`import.meta.env.DEV`) hosting the component
  workbench. It is not in production builds.
- **Progress events are de-duplicated in `main.py`.** Ops that shell out poll
  `progress()` several times a second purely to observe cancellation; identical
  consecutive updates are dropped rather than flooding the protocol channel.

## Redesign, 2026-09-03

The Claude Design canvas (`design/canvas/iLoathePDF.dc.html`, exported from the
project and committed alongside `support.js`) is now implemented. What changed:

- **New token palette** — warm neutrals around hue 70 with an amber accent,
  replacing the cool blue-grey. New names: `--muted`/`--faint` (was
  `--text-muted`), plus `--surface-3`, `--border-hi`, `--accent-hi`,
  `--on-accent`, `--ok`, `--paper`, and per-tool tints `--tint-a`..`g`.
- **Self-hosted fonts.** The design specifies General Sans and Space Mono. Both
  are vendored into `public/fonts` (123 KB total) rather than loaded from
  Fontshare/Google — the app must make no network requests, and the CSP would
  block them anyway. General Sans is under the ITF Free Font License, Space Mono
  under the SIL OFL.
- **Custom title bar.** `decorations: false`, so the 36px bar with the LOCAL ONLY
  wordmark, the OFFLINE pill, the theme toggle and the window buttons is ours.
  Dragging uses `data-tauri-drag-region`; the buttons need the
  `core:window:allow-*` permissions now in `capabilities/default.json`.
- **Labelled, collapsible rail** grouped PDF / IMAGES, plus a status bar.
- **The tool canvas is `flex-1`.** The drop target fills the window, and the
  running/result states take over that area instead of being squeezed into the
  sidebar. This was the single worst problem in the first design.
- **A pinned "SAVE TO" footer** above Run, with a real folder picker. Output
  destination was previously one line of grey text, which is how a converted
  file once appeared to vanish.
- **A Settings screen** (`/settings`): output destination, the privacy
  guarantees, and a live engine health check.
- **`motion` (Framer Motion 13)** for enter/exit on the run panel and the drop
  suggestion sheet; tokens in `src/lib/motion.ts`. Exits are faster than
  entrances, nothing scales from zero, and `MotionConfig reducedMotion="user"`
  honours the OS setting.

Structural cleanup that came with it: `App.tsx` dropped from 430 lines to 60 and
is now only routing. The workspace moved to `src/routes/ToolWorkspace.tsx`, the
job-parameter assembly to `src/lib/run.ts`, and file picking is reusable through
`useFilePicker` in `FileDropZone.tsx`.

## Bugs found and fixed on 2026-09-03 (first real-window session)

- **Dialog and opener were denied at runtime.** The plugins were registered in
  Rust but never granted in `capabilities/default.json`, so "Select files",
  "Open file" and "Open folder" silently failed. Fixed, with `{"path": "**"}`
  scopes so a result anywhere on disk can be revealed.
- **Files dropped on Home were lost when picking a tool.** `navigate()` carried
  no payload. Fixed with `src/lib/handoff.ts`, a hand-over slot emptied on read;
  router state cannot hold a browser `File` object.
- **Outputs could land in the app's own directory.** `dirName()` returning ""
  fell back to `"."`, which the engine resolved against its own working
  directory. Fixed in three layers: the UI refuses to run without an absolute
  input path, `_common.py` rejects relative paths outright (`BAD_PARAMS`, with a
  regression test), and Rust now logs every job's op and params.
- **pdf.js used one shared worker for all documents.** Destroying any document
  terminated `GlobalWorkerOptions.workerPort`, so every later preview failed with
  "the worker is being destroyed" — opening a second PDF in Organize would have
  broken. Each document now owns its worker. Verified in the browser: load,
  destroy, load again, plus two documents open at once.

## Known issues and gotchas

- **stdout is the protocol channel.** A stray `print()` anywhere in `sidecar/ops/`
  corrupts the stream. Log to stderr.
- **EXIF orientation** is the classic bug in image conversion — iPhone photos come
  out sideways without `ImageOps.exif_transpose`. There is a test for it; keep it.
- **`PROTOCOL.md` is frozen.** Changing it means changing `src/lib/jobs.ts` and
  every affected op in the same commit.
- **Windows file locking:** close the pikepdf handle before handing a path to
  Ghostscript, or the child process cannot read it.
- **`pdf.organize` rotations are keyed by source page index**, so the same source
  page duplicated twice cannot carry two different rotations. Not a problem in
  practice; worth knowing before extending the canvas.
- **NSIS does not replace `externalBin` sidecars on reinstall**
  ([tauri #15134](https://github.com/tauri-apps/tauri/issues/15134)) — one reason
  we use `bundle.resources` instead.
- **`tsconfig.app.json` shipped without `strict`** and without the `@/` path alias
  that `vite.config.ts` defines. Both are set now; don't let a scaffold
  regression undo them.
- **`vendor/` and `build/` are gitignored** but are required to build the
  installer. A fresh clone needs `vendor/ghostscript/` reinstalled.
- **The app was renamed from IHatePDF to iLoathePDF.** The localStorage keys
  moved with it (`iloathepdf.theme`, `iloathepdf.outputDir`), so saved
  preferences reset once. The Rust crate, the frozen sidecar binary name and the
  installer product name all changed too — a stale `build/sidecar/` from before
  the rename will not be found.
- **Never put a control inside `data-tauri-drag-region`.** mousedown hands the
  window to the OS for dragging and the click never fires. That is why the
  minimise and maximise buttons silently did nothing; the attribute now sits on
  an inert spacer only.
- **The first native file dialog is slow on Windows** — Explorer's shell
  namespace initialises lazily and can stall for seconds. The plugin chunk is
  preloaded and the drop target shows a pending state; the OS delay itself is
  not ours to fix.
- **`design/canvas/` holds the source design.** Re-read it before changing
  layout or colour; it is the reference, not the screenshots.
- **pdf.js renders on `requestAnimationFrame`**, which does not fire in a hidden
  or headless browser. `renderPage()` will appear to hang there; it is not a bug.
  Thumbnails therefore show as blank tiles in `design/screenshots/09-components`.
- **`?theme=light|dark`** forces the theme, for deterministic screenshots and
  manual testing. `scripts/capture-screens.ps1` captures all 18 screens.
- **`cargo` may not be on PATH in a plain shell** even when Rust is installed
  (e.g. it sits in `%USERPROFILE%\.cargo\bin` but that folder isn't in the
  inherited PATH). `npm run build:app` then dies at the `tauri build` step
  with `program not found`. Prepend the cargo bin dir for that shell and
  rerun; this only affects building the installer; the resulting
  `setup.exe` is self-contained and needs no Rust/Python/Node on the
  installing machine.
- The frozen engine must decode stdin as UTF-8 regardless of the console code
  page, and tolerate a leading BOM — `sidecar/main.py`'s read loop reconfigures
  both protocol streams and strips a leading U+FEFF. This is what broke the very
  first installer build: PowerShell's pipeline prepends a BOM by default, so
  the smoke test in `build-sidecar.ps1` got `BAD_PARAMS` from `sys.ping`.

## Next steps

1. Use the redesigned window for real: confirm the custom title bar drags and
   its buttons work, and run one job end to end against a real file.
2. M6: app icon, `npm run build:app`, then install it, run the wizard to a
   non-default directory, use every tool from the installed build, and uninstall.
3. Network-silence check with Resource Monitor before trusting it with an
   Aadhaar scan.
