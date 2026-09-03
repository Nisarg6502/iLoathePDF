# iLoathePDF — Specification

> The frozen decisions. This file changes only when a design decision changes.
> For current status, see [HANDOVER.md](HANDOVER.md).

## Why this exists

Merging, splitting, compressing PDFs and converting images (PNG↔JPG, HEIC→JPG,
images→PDF) currently means uploading files to iLovePDF or SmallPDF. Those
uploads have included Aadhaar and PAN cards. **Private identity documents are
leaving the machine and landing on third-party servers.**

iLoathePDF is a Windows desktop app that does the same jobs with the same quality
of interface, entirely locally. Double-click an icon, drag a file in, get the
result. Nothing is uploaded, ever.

This is a personal tool. It is not distributed, so it optimises for the owner's
workflow over generality.

## Stack

| Layer | Technology | Why |
| --- | --- | --- |
| Desktop shell | Tauri 2 (Rust) | Native window, FS access, NSIS installer, ~60 MB idle RAM |
| UI | React 19 + TypeScript + Vite 8 | |
| Styling | Tailwind CSS v4, hand-rolled shadcn-style primitives | |
| Document engine | Python 3.11 sidecar | The best document libraries are Python |
| PDF manipulation | pikepdf (libqpdf) | |
| PDF compression | Ghostscript (strong) + pikepdf (lossless) | Ghostscript is what iLovePDF-grade compression actually needs |
| PDF previews | PDF.js in the webview | Read-only thumbnails, no round-trip to the engine |
| Images | Pillow + pillow-heif | |
| Image → PDF | img2pdf | Embeds JPEG losslessly, no recompression |
| Packaging | PyInstaller (onedir) → Tauri bundler → NSIS `.exe` | |

### Rejected alternatives, and why

- **Electron + `sharp` for images.** `sharp`'s prebuilt binaries cannot decode
  HEIC — HEVC patent licensing means libvips must be compiled from source with
  libheif/libde265/x265 ([sharp #4479](https://github.com/lovell/sharp/issues/4479)).
  `pillow-heif` ships working Windows wheels. This single fact drove the Python
  sidecar choice.
- **PyInstaller `--onefile`.** Re-extracts to `%TEMP%` on every launch and is a
  frequent Windows Defender false positive. Use `--onedir`.
- **Tauri `externalBin` for the sidecar.** Expects a single file, and NSIS does
  not replace `externalBin` sidecars on reinstall
  ([tauri #15134](https://github.com/tauri-apps/tauri/issues/15134)). We ship the
  onedir folder through `bundle.resources` and spawn it by absolute path.
- **PyMuPDF instead of pikepdf.** AGPL, and more restrictive than pikepdf's MPL.

### Accepted trade-off

Bundling Python plus Ghostscript costs roughly 120–170 MB installed, which gives
up most of Tauri's size advantage over Electron. We keep the RAM and startup
win, and we keep the best document libraries. Do not expect a 10 MB app.

## Architecture

Three isolated units with a narrow contract between each.

```
React UI  ──tauri invoke──▶  Rust core  ──JSON lines over stdio──▶  Python engine
   ▲                            │                                        │
   └───── job://progress ───────┘◀────── progress / result events ───────┘
```

### 1. Python engine (`sidecar/`) — all document work

A long-lived process spawned once at app start, speaking newline-delimited JSON.
Long-lived rather than one-shot-per-job so PyInstaller's cold start is paid once
at boot, and so progress can stream.

**stdout is the protocol channel and carries nothing else. All logging goes to
stderr.** A stray `print()` in an op corrupts the protocol.

```
sidecar/
  PROTOCOL.md        # THE FROZEN CONTRACT — read before touching anything
  main.py            # stdin loop, dispatch table, error envelope, cancellation
  ops/_common.py     # params, page ranges, atomic writes, ghostscript discovery
  ops/pdf_info.py  pdf_merge.py  pdf_split.py  pdf_organize.py  pdf_compress.py
  ops/img_convert.py  img_to_pdf.py  pdf_to_img.py
  tests/             # pytest; fixtures are generated, not committed as binaries
```

Every op exposes `run(params, progress) -> dict` and knows nothing about Tauri
or the UI, so the whole engine is testable under plain `pytest`.

The protocol, the error codes, and every op's params and result shape are
specified in [`sidecar/PROTOCOL.md`](sidecar/PROTOCOL.md). That file is
authoritative; this one does not duplicate it.

### 2. Rust core (`src-tauri/`) — thin

Spawns and supervises the engine, correlates request ids to responses, forwards
progress as `job://progress` events, and exposes native dialogs and
reveal-in-Explorer. **No document logic.** Three commands: `run_job`,
`cancel_job`, `sidecar_health`.

Jobs block for seconds, so `run_job` hands work to the blocking pool rather than
occupying an async worker thread. If the engine fails to start, the window still
opens and the UI reports why — easier to debug than a process that dies silently.

### 3. React UI (`src/`)

`src/lib/jobs.ts` is the only place the UI talks to Rust. It mirrors
`PROTOCOL.md` in TypeScript and includes a browser mock, so `npm run dev` works
in a plain browser with no Tauri — which is how UI work gets done.

- **Home**: iLovePDF-style grid of tool cards; the whole window is a drop target.
- **Tool workspace**: one spine for every tool — drop files → arrange → set
  options → Run → result.
- `src/lib/tools.ts` is the single tool registry; Home, routing and drop-target
  routing all read from it.

## Privacy guarantees

These are built in, not just claimed:

- CSP forbids every remote origin. No web fonts, no CDN, no analytics, no
  auto-updater, no crash reporting.
- The engine imports no networking library.
- Ghostscript always runs with `-dSAFER`, list argv, never `shell=True`, and
  `CREATE_NO_WINDOW` so no console flashes.
- `img.convert` strips EXIF by default, so location data does not survive a
  conversion by accident.
- Outputs are written atomically and never silently overwrite an existing file.
- Temp files live in per-job directories and are removed in a `finally` block.

## Windows installer

Tauri's NSIS bundler, configured for `installMode: "perMachine"`
(`C:\Program Files\iLoathePDF`, UAC prompt at install), a wizard with a
directory-selection page, a Start-menu entry, a desktop shortcut, and an
auto-generated uninstaller in Add/Remove Programs.
`webviewInstallMode: offlineInstaller` embeds WebView2 (+~127 MB) so installing
needs no internet, consistent with the privacy premise.

Two limits accepted rather than fought:

- **Taskbar pinning cannot be automated.** Windows 10+ blocks it by design. The
  user right-clicks → *Pin to taskbar*.
- **SmartScreen warns on first run** because the installer is unsigned. Silencing
  it needs a code-signing certificate; out of scope for a personal tool.

## Licensing

Ghostscript is AGPL. Bundling it for personal use is fine. If this is ever
distributed, the AGPL obligations attach — keep the repo private, or replace the
compression backend. pikepdf is MPL-2.0, Pillow is MIT-CMU, img2pdf is LGPL-3.
