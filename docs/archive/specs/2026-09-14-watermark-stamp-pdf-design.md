# Watermark, Page Numbers & Stamp PDF

Status: approved (design confirmed via Q&A), proceeding to writing-plans.

## Problem

Watermarking and page-numbering are common PDF operations (protecting drafts,
marking documents confidential, paginating a report) that competitors offer
by uploading the file to their servers. Neither operation exists in this
project today. `pdf.sign` already proves the underlying mechanism — drawing
overlay content onto existing pages without touching anything else about
them — but it requires the user to manually place every element on a canvas.
Watermarking and page numbering are, by nature, *rule-based*: "put this on
every page" or "number every page starting at 1," not "place this one thing
here." Building them on `pdf.sign`'s freeform per-element model would force
a canvas UI onto an operation that's naturally a form.

## Scope

One new tool, **Watermark, Page Numbers & Stamp PDF**, slug `watermark`,
category `pdf`, on both apps. A three-way mode toggle (Watermark / Page
Numbers / Stamp) swaps the form, the same pattern Protect & Unlock's
two-mode toggle already established.

All three modes share a **page-range control**: "All pages" / "First page
only" / a custom range, using the exact page-range grammar (`1-3,5`) Split
and PDF-to-images already parse (`parse_pages` in `_common.py`,
`parseRanges` on the web). No new range syntax.

### Watermark
- Content: text or an uploaded image.
- Text-only options: font size, color.
- Shared options: opacity (0–100%, default 35%), rotation in degrees
  (default 45°), and a **placement** choice — single, centered, or tiled
  (repeated in a grid across the page).

### Page Numbers
- Position: one of 6 standard spots (bottom-left / bottom-center /
  bottom-right / top-left / top-center / top-right).
- Format: `N`, `Page N`, or `N of Total`.
- Starting number (default 1) — the first *numbered* page (respecting the
  page-range control) gets this value; subsequent numbered pages increment
  by 1. `Total` in the `N of Total` format is always the count of pages the
  range selects, not the whole document.
- Font size, color.

### Stamp
- Content: text or an uploaded image, same as Watermark.
- Position: one of 9 spots (a 3×3 grid — corners, edge midpoints, center).
- Size: for text, a font size; for an image, a max width/height the image
  is scaled to fit within (aspect ratio preserved).
- Identical content on every page the range selects — no per-page
  variation (that's what distinguishes it from Page Numbers).

No freeform/click-to-place positioning in v1 (that's what Sign & Fill is
for) — every mode uses presets. No PDF/A or print-mark options. No
per-page-different watermark text.

## 1. Engine architecture

New `pdf.watermark` sidecar op (desktop) and `watermarkEngine` (web),
structurally parallel to `pdf.sign`/`signEngine` — same overlay technique
(reportlab canvas → `pikepdf.Page.add_overlay` on desktop; `pdf-lib`'s
`drawText`/`drawImage` directly on web) — but a **separate, self-contained
implementation**, not a caller of `pdf.sign`. Reasons: `pdf.sign`'s element
schema has no rotation or opacity fields (watermarks need both), and page
numbers need per-page-varying text that only the op itself can generate
(it's the one place that knows the final page-range-filtered page list).
Every op/engine pair in this codebase is already independent by convention
(`_common.py`'s docstring: ops share only `_common`, never each other) —
this follows that pattern rather than breaking it.

### Desktop: `pdf.watermark` params
```json
{
  "input": "a.pdf", "output": "out.pdf",
  "mode": "watermark|page_numbers|stamp",
  "pages": "all|first|1-3,5",

  "watermark": {
    "content": "text|image", "text": "CONFIDENTIAL", "image_b64": "...",
    "font_size": 48, "color": "#888888",
    "opacity": 0.35, "rotation": 45, "placement": "single|tiled"
  },
  "page_numbers": {
    "position": "bottom-center", "format": "n|page-n|n-of-total",
    "start": 1, "font_size": 11, "color": "#000000"
  },
  "stamp": {
    "content": "text|image", "text": "APPROVED", "image_b64": "...",
    "position": "bottom-right", "font_size": 24, "max_width_pct": 0.2
  }
}
```
Only the object matching `mode` is required; the other two are ignored if
present. This mirrors how `pdf.split`'s params already carry mode-specific
fields (`ranges`/`every`/`pages`) side by side, used conditionally on
`mode`.

result: `{"output": "...", "bytes": 4096, "pages": 12, "pages_affected": 10}`

### Web: `watermarkEngine`
Same `mode`/`pages`/per-mode-options shape, read from `options` the way
every other web engine reads its `options` object. Reuses `pdf-lib`
already loaded for the file; text drawn via `StandardFonts.Helvetica`
(matching `signEngine`'s font choice), images via `embedPng`/`embedJpg`
based on the uploaded file's type.

### Shared placement math (each engine implements its own copy, per the
"ops don't share code" convention, but the *math* is identical)
- **6-position grid** (page numbers): each position maps to an
  `(x_pct, y_pct)` anchor with fixed margins (e.g. 5% from each edge),
  reusing the same top-left-origin percentage convention `pdf.sign`
  already established.
- **9-position grid** (stamp): the 6-position grid plus the three
  vertical-center positions (left/center/right), same margin convention.
- **Tiled watermark**: a fixed 3×4 grid (12 repeats) spaced evenly across
  the page's width/height, each drawn at the same rotation/opacity — not a
  true infinite tile, just enough repeats to cover a typical page.

## 2. UI

Plain form-based tool (like Compress/Split) on both apps — no bespoke
canvas/Workspace, since every mode uses presets rather than freeform
placement:
- Mode toggle (3-way, same segmented-control styling as Protect/Unlock's
  2-way toggle).
- Page-range control, shared across all three modes: radio (All / First
  page only / Custom) with a text input appearing only for Custom.
- Per-mode fields as scoped above. Text-vs-image content choice (Watermark,
  Stamp) is itself a small toggle within the mode's form.
- A live preview is **out of scope for v1** — Compress and Split also ship
  without one; this keeps the first version focused on correctness.

## 3. Error handling

- Empty/whitespace-only watermark or stamp text with no image uploaded →
  client-side validation blocks Run (consistent with Protect & Unlock's
  "never a submit-then-fail round trip" rule), plus `BAD_PARAMS` at the op
  boundary as defense-in-depth.
- Custom page range referencing an out-of-bounds page → existing
  `parse_pages`/`parseRanges` behavior (`BAD_PARAMS`), unchanged.
- Corrupt/encrypted input → existing `CORRUPT_PDF`/`ENCRYPTED_PDF` paths,
  unchanged.
- Image upload that isn't a decodable image → `UNSUPPORTED_FORMAT`
  (existing code, matching `img.convert`'s behavior for a bad input).

## 4. Testing

- **Desktop**: pytest cases mirroring `test_pdf_sign.py`'s style —
  watermark placement math (single vs. tiled, rotation/opacity applied),
  page-number sequencing across a custom range (including that `Total` in
  `N of Total` reflects the filtered count, not the document's), stamp
  position grid, and the shared error cases (bad range, non-image upload,
  encrypted/corrupt input).
- **Web**: vitest cases mirroring `sign.test.ts`, covering the same
  scenarios against `pdf-lib`'s loaded output (position/rotation/opacity
  read back from the produced PDF where feasible, or page count / expected
  content-stream presence otherwise).
- **Manual cross-check**: run each mode once in a real browser and once
  through the desktop app, confirm the placement/rotation/opacity look
  visually correct — automated tests can assert the draw calls happened
  with the right parameters, but "does 45° look like 45°" is a human
  check, same as Protect & Unlock's manual verification step.
