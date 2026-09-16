# Redact PDF — Design Spec

## Overview

A new tool, `redact`, lets a user draw black boxes over regions of a PDF's pages to hide sensitive content — text, photos, signatures, anything. It ships with two explicit modes so users always know what they're getting:

- **Visual Cover-up** — a black rectangle is drawn on top of the selected area. Fast, matches the existing overlay pattern already used by Sign & Fill and Watermark. The original content is still present underneath: selectable, copy-pasteable, extractable by anyone who knows to try. This mode exists for cases where "make it not visible on screen/print" is genuinely all the user needs, and is clearly labeled as such in the UI so nobody mistakes it for a privacy guarantee.
- **True Redact** — the black rectangle is baked in, and any page that received at least one box is flattened to a raster image, discarding that page's original vector text/objects entirely. Nothing under a box (or anywhere else on that page) survives in extractable form. Pages that received no boxes are left completely untouched — still vector, still searchable — so redacting one page of a long report doesn't blow up file size or kill searchability on the rest of the document.

Both platforms (desktop Tauri app, client-side web app) ship the tool together, matching the established pattern from Protect & Unlock and Watermark/Page Numbers/Stamp.

## Selection UI

Users select what to redact by drawing boxes directly on a page canvas — the same interaction the existing Sign & Fill tool uses (`apps/desktop/src/components/SignCanvas.tsx` + `SignElementBox.tsx` on desktop, `apps/web/src/tools/sign/SignWorkspace.tsx` on web): all pages render top-to-bottom, clicking "Add box" drops a default-sized rectangle on the currently active page, which the user then drags to reposition and resizes from its corner handle, same as a Sign element. Redact reuses this exact move/resize primitive — a redaction box just has no `kind` variants (no text/image), only a position and size.

**Data model** (mirrors `SignElement`'s shape from `apps/desktop/src/lib/signTypes.ts` / `apps/web/src/tools/sign/types.ts`):

```
RedactBox { id: string; pageIndex: number; xPct: number; yPct: number; wPct: number; hPct: number }
```

Percentages are of the page's own box, top-left origin — identical convention to `SignElement`, `WatermarkOptions`' positions, and the stamp/page-number placement already in the codebase. Box color is fixed black, not user-configurable (configurability would undercut "this is a redaction, not decoration").

There is no separate page-range control (unlike Compress/PDF-to-images) — which pages are affected falls directly out of which pages have boxes drawn on them, same as Sign & Fill.

## Mode selection

A single top-level `mode: "visual" | "true"` option, presented as a toggle in the tool's sidebar with a one-line explanation of each mode's guarantee (see Copy below). Switching modes does not require redrawing boxes — the same box list is reused; only how they're baked in at export time differs.

## Desktop implementation

**New file `apps/desktop/sidecar/ops/pdf_redact.py`** (new op `pdf.redact`), following `pdf_sign.py`'s structure:

- Input: `{ input: path, output: path, mode: "visual"|"true", boxes: [{page, x_pct, y_pct, w_pct, h_pct}] }`.
- Validation mirrors `pdf_sign.py`'s `_validate`/`_pct`: non-empty `boxes`, each `page` in range, each percentage in `[0, 1]`.
- **Visual Cover-up**: for each page with boxes, build a reportlab overlay (canvas sized to that page's own mediabox) drawing solid black `c.rect(x, y, w, h, fill=1, stroke=0)` for each box, then `pikepdf.Page.add_overlay` it onto the original page — exactly `pdf_sign.py`'s `_build_overlay_bytes` + `add_overlay` pattern, with rectangles instead of images/text. Original page content is untouched underneath.
- **True Redact**: for each page with boxes —
  1. Rasterize *that single page* to a PNG at a fixed 200 DPI using the same Ghostscript invocation pattern as `pdf_to_img.py` (`_run_gs`, `-dFirstPage=N -dLastPage=N`). A missing Ghostscript binary fails with `GHOSTSCRIPT_MISSING`, same as `pdf.to_img`.
  2. Build one new single-page PDF with reportlab: canvas sized to the original page's width/height in points, `drawImage` the rasterized PNG full-bleed, then draw the black box rectangles on top of that same canvas before `c.save()` — one flattened page, image plus boxes, no separate overlay step needed.
  3. Replace the original page in the pikepdf document with this new page (remove old page at that index, insert the new one), keeping the small single-page `pikepdf.Pdf` open until the final `src.save()` so the copied objects stay valid.
  - Pages with no boxes are left completely alone — never rasterized, never touched.
- Reuses `open_pdf`, `atomic_output`, `existing_file`, `require`, `size_of`, `find_ghostscript` from `_common.py` exactly as the existing ops do. No new Python dependency: reportlab, pikepdf, and Ghostscript are already vendored for Sign, Watermark, and PDF-to-images respectively.

**Desktop UI**: new `RedactCanvas.tsx` (mirrors `SignCanvas.tsx`, but boxes have no kind/content — simpler prop surface) and a `RedactOptionsPanel.tsx` sidebar (mirrors `SignOptionsPanel.tsx`) with: mode toggle, "Add box to page N" button, box list with per-item delete, and the mode explainer copy. `ToolWorkspace.tsx` gets a new `tool.id === "redact"` branch (alongside the existing `"organize"` and `"sign"` branches) rendering `RedactCanvas` in the canvas area and `RedactOptionsPanel` in the sidebar, following the exact same conditional structure already there for Sign. `apps/desktop/src/lib/run.ts` gets a `case "pdf.redact":` mapping the box list to `x_pct`/`y_pct`/etc. params, mirroring the existing `case "pdf.sign":` block. The "Run" blocker in `ToolWorkspace.tsx` gets a `tool.id === "redact" && boxes.length === 0` check, mirroring the existing Sign blocker.

## Web implementation

**New file `apps/web/src/engines/redact.ts`** (`redactEngine`), following `sign.ts`'s structure:

- **Visual Cover-up**: for each box, `page.drawRectangle({ x, y, width, height, color: rgb(0,0,0) })` directly via pdf-lib — no rasterization needed at all in this mode, cheapest possible path.
- **True Redact**: for each page with boxes —
  1. Render that page via pdf.js (same pattern as `pdfToImages.ts`: `getDocument`, `page.getViewport({ scale: 200/72 })`, canvas 2D render) to a canvas.
  2. Draw the black box rectangles directly onto that same 2D canvas context (`ctx.fillRect`, computed from box percentages × canvas width/height) before exporting — same "image plus boxes in one flattened raster" approach as desktop.
  3. Export the canvas to a PNG, `doc.embedPng` it into the pdf-lib document, `doc.removePage(index)` the original page and `doc.insertPage(index, [widthPt, heightPt])` a same-sized replacement, then `drawImage` the embedded PNG full-bleed onto it.
  - Pages with no boxes are left in the pdf-lib document completely unmodified.
- No new dependency: pdf-lib and pdfjs-dist are already used by Sign and PDF-to-images respectively.

**Web UI**: new `apps/web/src/tools/redact/RedactWorkspace.tsx` (mirrors `SignWorkspace.tsx` closely — same page-rendering `useEffect`, same drag/resize box interaction, minus the text/image element variants and signature capture modal) with a mode toggle and box list sidebar equivalent to the desktop panel. Registered in `apps/web/src/tools/registry.tsx` with `Workspace: RedactWorkspace` (same field `sign` already uses).

## Shared wiring (both platforms)

- Desktop: `apps/desktop/src/lib/tools.ts` gets a new `TOOLS` entry (`id: "redact"`, `op: "pdf.redact"`, next tint `"k"`), `apps/desktop/src/lib/jobs.ts` gets `RedactBoxParams`/`PdfRedactParams`/`PdfRedactResult` types and an `OpMap` entry, `Tint` extended to include `"k"`.
- Web: `apps/web/src/tools/registry.tsx` gets a new `TOOLS` entry (tint `"k"`), `apps/web/src/tools/tint.ts`'s `TintKey` extended to `"k"`, a new `RedactIcon` in `apps/web/src/tools/icons.tsx`, a new CSS tint block (`--tint-k` / `--tint-k-btn`, light and dark) in `apps/web/src/index.css` at the next unused hue after `j` (53) — picking hue ~10 (a warm red) keeps it visually distinct from the existing nine tints and reads as "caution," which fits a redaction tool.
- Both: `apps/desktop/src/routes/Home.tsx` hero copy, and the web's `README.md` / `apps/web/src/pages/{Home,ToolsIndex,Download}.tsx` / `apps/web/src/components/layout/SiteFooter.tsx` tool-count copy all move from ten to eleven tools. The website's Download page is the one place a user actually gets the desktop app, so its copy is treated as part of "shipping the desktop feature," not an afterthought — same rule applied for Protect and Watermark.

## Error handling

- Zero boxes drawn is a client-side "Add at least one box" Run-button blocker (mirrors Sign's existing blocker), never reaches the sidecar/engine.
- Corrupt or password-protected input reuses the existing `CORRUPT_PDF` / password-required error codes already in `_common.py` (desktop) and the existing password-check path in `protect.ts`/engine error handling (web) — no new error taxonomy needed.
- Desktop True Redact reuses `GHOSTSCRIPT_MISSING` from `pdf_to_img.py`'s `find_ghostscript()` when the vendored binary can't be found.

## Testing

- **Box math**: unit tests for percentage → absolute-coordinate conversion at a given page size/DPI, on both platforms (mirrors the existing rotation/anchor tests for Watermark).
- **Visual Cover-up round-trip**: output page's extracted text still contains a marker string placed under a box (proves nothing was removed — this is the whole point of the mode's name).
- **True Redact round-trip**: a page that received a box has *no* extractable text afterward (desktop: pikepdf/pypdf text extraction returns empty for that page; web: the replacement page's resource dictionary has an Image XObject and no `Font` entry), while a page with no boxes in the same document is provably unchanged — same content stream bytes before and after, on both platforms.
- **Cross-engine visual parity**: reuse the manual side-by-side rasterize-and-compare approach used to verify Watermark (desktop pikepdf/reportlab output vs. web pdf-lib output) for both modes, since this is the same kind of "two independent renderers must agree" risk.

## Global Constraints

- True Redact rasterization is fixed at 200 DPI, not user-configurable.
- Box color is fixed black, not user-configurable.
- No page-range control — affected pages are implied by which pages have boxes.
- Tint key `"k"`; `Tint`/`TintKey` types on both platforms extended accordingly.
- Tool count copy (README, both apps' Home/Download/ToolsIndex/Footer) moves from ten to eleven tools — update on both platforms, including the desktop download page on the website.
- No new third-party dependency on either platform — desktop reuses reportlab + pikepdf + the vendored Ghostscript binary; web reuses pdf-lib + pdfjs-dist.
