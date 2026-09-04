# iLoathePDF

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Web app](https://img.shields.io/badge/web%20app-live-brightgreen)](https://nisarg6502.github.io/iLoathePDF/)

PDF and image tools that don't upload your files anywhere — merge, split,
compress, organize and convert, running entirely on your own machine.

**[Try the web app →](https://nisarg6502.github.io/iLoathePDF/)** — no
install, runs in your browser tab.

## Why this exists

The tools that do this well (iLovePDF, SmallPDF, and friends) are websites,
so every file you feed them gets uploaded to someone else's server. That's
fine for a holiday photo. It's not fine for an Aadhaar card, a PAN card, a
signed contract, or anything else you'd rather not hand to a stranger's
backend. iLoathePDF does the same jobs with the same quality of interface,
without the upload — as a Windows desktop app with zero networking code, and
as a website that processes files client-side and never sends them anywhere.

## Two ways to run it

| | [Desktop app](apps/desktop) | [Web app](apps/web) |
| --- | --- | --- |
| **Install** | Windows installer | None — open the link |
| **Engine** | Native Rust + Python + Ghostscript | `pdf-lib` / `pdf.js`, in your browser |
| **File size limits** | Disk-bound | ~200 MB (browser memory) |
| **Batch / whole folders** | Yes | No |
| **Networking code** | None at all — cannot phone home | None — verify in DevTools → Network |
| **Compress quality** | Full (Ghostscript) | Preview (rasterizes pages, no selectable text yet) |
| **HEIC → JPG** | Yes | Preview badge (decoder not wired up yet) |

Both share the same rule: your files never leave the machine they're opened
on. Pick whichever fits — there's no reason to pick only one.

## The seven tools

| Tool | What it does |
| --- | --- |
| Merge PDF | Combine PDFs in the order you choose, with page ranges per file |
| Split PDF | Cut into ranges, chop every N pages, extract or delete a selection |
| Organize pages | Reorder, rotate and drop pages on a page canvas |
| Compress PDF | Lossless, Balanced or Strong, with the size trade-off shown |
| PDF to images | Render pages to PNG or JPG at a chosen DPI |
| Images to PDF | Scans and photos into one PDF, one image per page |
| Convert images | PNG, JPG and WebP any direction — and HEIC off an iPhone |

On the web app, Compress and the HEIC direction of Convert Images carry a
visible **Preview** badge: real files go in and real processing happens, but
the output isn't yet full quality — see the table above. Every other tool is
fully live in both the desktop app and the browser.

## How it's built

```
Desktop:
  React UI  ──tauri invoke──▶  Rust core  ──JSON lines over stdio──▶  Python engine
     ▲                            │                                        │
     └───── job://progress ───────┘◀────── progress / result events ───────┘

Web:
  React UI  ──File API──▶  in-memory bytes  ──pdf-lib / pdf.js──▶  Blob  ──▶  download
```

- **Desktop** — React 19, TypeScript, Tailwind v4, Motion, self-hosted fonts,
  shipped via Tauri 2 with a custom title bar and NSIS installer. The engine
  is a long-lived Python process (pikepdf, Pillow, pillow-heif, img2pdf,
  Ghostscript) speaking newline-delimited JSON, frozen with PyInstaller.
- **Web** — React 19, TypeScript, Tailwind v4, React Router, deployed to
  GitHub Pages. Every tool page follows the same shell: drop a file, set
  options, run, get a result — and a live request counter proves the site
  makes no network calls after the page loads.

Design decisions and the reasoning behind them live in each app's own
`SPECS.md`; the write-up of how the web app itself was designed and built is
in [`docs/superpowers/specs`](docs/superpowers/specs) and
[`docs/superpowers/plans`](docs/superpowers/plans).

## Repo layout

```
iLoathePDF/
├── apps/
│   ├── desktop/   the Windows app — see apps/desktop/README.md
│   └── web/       the website — see apps/web
└── docs/          design specs and implementation plans
```

## Getting set up

```bash
npm install   # installs both apps/desktop and apps/web (npm workspaces)
```

Then see each app's own README for how to run and build it:

- [`apps/desktop/README.md`](apps/desktop/README.md) — requires Node 22,
  Python 3.11, Rust with the MSVC toolchain, and Ghostscript.
- [`apps/web`](apps/web) — `npm run dev --workspace=apps/web` and open the
  printed local URL.

## Contributing

`main` is built through pull requests, and CI has to pass:

```bash
git switch -c my-change
git push -u origin my-change
gh pr create --fill
```

Direct pushes to `main` are blocked by a local hook rather than GitHub's
branch protection (which needs a paid plan or a public repo to configure —
this repo is public, but the hook is kept as a belt-and-suspenders):

```bash
git config core.hooksPath .githooks
```

## License

Code in this repository is [MIT licensed](LICENSE).

That covers the code iLoathePDF's own authors wrote — it does **not**
relicense the third-party pieces the desktop app bundles into its installer,
which keep their own terms regardless of this repo's license:

- **Ghostscript** — AGPL-3.0. Distributing a build that includes it carries
  AGPL obligations. See [`apps/desktop/SPECS.md`](apps/desktop/SPECS.md#licensing)
  before redistributing a compiled installer.
- **pikepdf** — MPL-2.0
- **img2pdf** — LGPL-3.0

The web app's dependencies (`pdf-lib`, `pdf.js`, React, etc.) are all
permissively licensed (MIT/Apache-2.0) and impose no extra obligations.
