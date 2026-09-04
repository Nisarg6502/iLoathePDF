# iLoathePDF

A Windows desktop app for merging, splitting, compressing and converting PDFs
and images — where nothing is ever uploaded.

The tools that do this well are websites, so every file goes to someone else's
server. That is fine for a holiday photo and not fine for an Aadhaar card, a PAN
card or a contract. iLoathePDF does the same jobs with the same quality of
interface, entirely on your own machine.

There is no network code in the build. Not "we promise not to look" — there is
nowhere for a file to go.

## Tools

| Tool | What it does |
| --- | --- |
| Merge PDF | Combine PDFs in the order you choose, with page ranges per file |
| Split PDF | Cut into ranges, chop every N pages, extract or delete a selection |
| Organize pages | Reorder, rotate and drop pages on a page canvas |
| Compress PDF | Lossless, Balanced or Strong, with the size trade-off shown |
| PDF to images | Render pages to PNG or JPG at a chosen DPI |
| Images to PDF | Scans and photos into one PDF, one image per page |
| Convert images | PNG, JPG and WebP any direction — and HEIC off an iPhone |

## How it is built

```
React UI  ──tauri invoke──▶  Rust core  ──JSON lines over stdio──▶  Python engine
   ▲                            │                                        │
   └───── job://progress ───────┘◀────── progress / result events ───────┘
```

- **UI** — React 19, TypeScript, Tailwind v4, Motion. Self-hosted fonts.
- **Shell** — Tauri 2. Custom title bar, NSIS installer.
- **Engine** — Python 3.11 with pikepdf, Pillow, pillow-heif, img2pdf and
  Ghostscript, frozen with PyInstaller and shipped inside the app.

The engine is a long-lived process speaking newline-delimited JSON. The contract
is in [`sidecar/PROTOCOL.md`](sidecar/PROTOCOL.md) and is frozen: changing it
means changing `src/lib/jobs.ts` and the affected ops in the same commit.

[`SPECS.md`](SPECS.md) holds the design decisions and why the alternatives were
rejected. [`HANDOVER.md`](HANDOVER.md) holds the current state, the gotchas and
what to do next.

## Getting set up

Requires Node 22, Python 3.11, Rust with the MSVC toolchain, and — for
compression and PDF rasterising — Ghostscript in `vendor/ghostscript/`
(see HANDOVER.md).

```bash
npm install
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r sidecar/requirements.txt

# Refuses direct pushes to main. GitHub's branch protection needs Pro or a
# public repo, so the rule lives in a hook instead.
git config core.hooksPath .githooks
```

## Contributing to yourself

`main` is built through pull requests, and CI has to pass:

```bash
git switch -c my-change
git push -u origin my-change
gh pr create --fill
```

## Running it

```bash
npm run tauri dev      # the desktop app
npm run dev            # the UI alone in a browser, against a mocked engine
npm test               # engine tests, unit and end-to-end over real stdio
npm run typecheck
npm run build:app      # freeze the engine, then build the installer
```

## Licence

Personal project, not distributed. Note that the bundled **Ghostscript is
AGPL**: distributing a build brings AGPL obligations with it. See the licensing
note in [SPECS.md](SPECS.md) before sharing binaries.
