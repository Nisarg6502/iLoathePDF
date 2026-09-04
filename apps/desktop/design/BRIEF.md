# iLoathePDF — design brief

Context for a UX review. Screenshots of every screen, light and dark, are in
`screenshots/`.

---

## What this is

A **Windows desktop app** for merging, splitting, compressing and converting
PDFs and images. One user: the person who built it.

## Why it exists

He does this work constantly and currently uses iLovePDF and SmallPDF. Those are
websites, so every file gets uploaded to someone else's server — and the files
include **Aadhaar cards, PAN cards, and other identity documents**. That is the
whole problem. This app does the identical work with everything staying on the
machine.

So the product promise is not "another PDF tool". It is **"the same convenience,
without the upload"**. Every design decision should serve one of those two
halves: as easy as iLovePDF, and visibly, believably private.

Privacy is enforced in code, not just claimed: the app makes no network requests
of any kind, has no analytics, no auto-updater, no web fonts, and strips EXIF
from converted images by default.

## Who uses it

Exactly one person, on his own Windows desktop, several times a week. He is
technical. There is no onboarding, no accounts, no sharing, no sync, no
multi-user anything — and there never will be. **Do not design for a SaaS
product.** Optimising for a first-time visitor is wasted effort; optimising for
the 200th use is not.

## The seven tools

| Tool | What it does |
| --- | --- |
| Merge PDF | Combine PDFs, reorderable, optional page ranges per file |
| Split PDF | By ranges, every N pages, extract a selection, or delete pages |
| Organize pages | Reorder / rotate / delete pages on a thumbnail canvas |
| Compress PDF | Lossless, Balanced, or Strong (Ghostscript) |
| PDF to images | Render pages to PNG/JPG at a chosen DPI |
| Images to PDF | JPG/PNG/HEIC into one PDF, page size and margins |
| Convert images | PNG ↔ JPG ↔ WebP, and **HEIC/HEIF → JPG** (iPhone photos) |

Every tool follows the same spine: **drop files → arrange → set options → Run →
result.** That consistency is deliberate and worth preserving.

## Current state

Functionally complete and working. The engine has 117 passing tests. This review
is about the interface, not the plumbing.

- **Stack:** React 19 + TypeScript, Tailwind v4, hand-rolled shadcn-style
  primitives, Tauri 2 shell. Design tokens are CSS variables in `src/index.css`
  (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`,
  `--accent`, `--accent-soft`, `--danger`, `--success`), exposed to Tailwind as
  `bg-surface`, `text-text-muted`, and so on. Light and dark are both defined and
  both must work.
- **Layout:** a slim left icon rail, a breadcrumb bar, a two-column workspace
  (input on the left, options + run + result on the right, 360px), and a
  persistent footer reading *"Files never leave this computer."*
- Screenshots were taken at 1400×950. The real window opens at 1180×800 and is
  resizable, minimum 940×640.

## Where the design needs help

Honest problems visible in the screenshots — treat these as starting points, not
a complete list:

1. **Dead vertical space.** On every tool page the content is top-aligned and the
   bottom 30–40% of the window is empty. The drop zone does not grow, and the
   right rail's Run button sits high with nothing beneath it. This is the most
   obvious weakness.
2. **The left rail is icons only, with no labels or tooltips visible at rest.**
   Seven tools, several with similar document-ish glyphs — hard to tell apart.
3. **Where the output goes is nearly invisible.** It is a single line of small
   grey text: *"Results are written next to your input files."* There is no
   folder picker and no way to change the destination. This already caused a real
   bug where files were written somewhere unexpected and the user concluded
   nothing had been created. Output destination probably deserves to be a
   first-class control.
4. **No settings screen.** No default output folder, no default compression
   level, no way to set preferences that would otherwise be re-chosen every time.
5. **The privacy promise is stated once, quietly, in the footer.** Given that it
   is the entire reason the app exists, is a small grey line the right weight?
   The opposite failure — a loud badge on every screen — would be worse. There is
   a judgement call here worth making deliberately.
6. **The result state lives in the narrow right rail**, which is where the payoff
   moment happens (e.g. compression showing 229 KB → 60 KB, −74%). It may deserve
   more room than a 360px column.
7. **Batch conversion has no per-file feedback.** Converting 30 images shows one
   overall progress bar; there is no per-file status or partial-failure view.

## What is out of scope

- Anything requiring a network, an account, or a server.
- Onboarding flows, marketing pages, empty-state illustrations that teach a
  first-timer. This user knows what a PDF is.
- Mobile or responsive-to-phone layouts. It is a resizable desktop window.
- Rebranding. The name and the blue accent can change if there is a good reason,
  but that is not what is being asked for.

## What would be most useful back

Concrete layout direction for the tool workspace (problem 1), a treatment for
output destination (problem 3), and a view on how loudly the privacy guarantee
should be expressed (problem 5). Specific values — spacing, sizes, hierarchy —
are more useful than adjectives.

---

## Screenshot index

`screenshots/`, each in `-light` and `-dark`:

| File | Screen |
| --- | --- |
| `01-home` | Tool grid; whole window is a drop target |
| `02-merge` | Merge, empty state |
| `03-split` | Split, showing the four modes |
| `04-organize` | Organize, empty state |
| `05-compress` | Compress, showing the three levels |
| `06-pdf-to-image` | PDF → images |
| `07-image-to-pdf` | Images → PDF |
| `08-convert-image` | Image conversion, the most option-heavy tool |
| `09-components` | Component workbench: page grid, progress, result cards, and every error state |

Note on `09-components`: the page thumbnails render as blank tiles in these
captures. That is a headless-screenshot artifact — pdf.js paints on
`requestAnimationFrame`, which does not fire reliably in a headless browser. In
the real window the tiles contain rendered page images. Everything else in these
screenshots is exactly what the app looks like.
