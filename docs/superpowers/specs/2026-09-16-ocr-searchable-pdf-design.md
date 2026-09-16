# OCR → Searchable PDF — Design Spec

## Overview

A new tool, `ocr`, takes a scanned/image-only PDF and produces a new PDF where the original page images are visually untouched but each page also carries an invisible, selectable text layer positioned under the content — so the file looks identical but text can now be selected, copied, and searched.

Both platforms (desktop Tauri app, client-side web app) ship the tool together, matching the established pattern from Protect & Unlock, Watermark/Page Numbers/Stamp, and Redact.

Unlike those three prior tools, this one introduces a genuinely new third-party dependency on both platforms: an OCR engine. No existing code in this repo does text recognition.

## Engine strategy

**Tesseract everywhere, English-only for v1.** Same engine on both platforms so output quality and behavior are consistent, rather than maintaining two different OCR stacks with different accuracy characteristics:

- **Desktop**: the native Tesseract binary, vendored under `vendor/tesseract/` and located via the same override → vendor → PATH lookup pattern as `find_ghostscript()` (`apps/desktop/sidecar/ops/_common.py:216`) — a new `find_tesseract()` following that exact precedent.
- **Web**: `tesseract.js`, the WASM build of the same engine, added as a new dependency in `apps/web/package.json`.

`eng.traineddata` (Tesseract's English language model) ships inside the installer (desktop, under `vendor/tesseract/tessdata/`) and inside the web build itself (`apps/web/public/tessdata/` or bundled as a static asset) — never fetched from a CDN at runtime on either platform. This keeps the "never leaves your machine" guarantee intact: OCR is 100% local, same as every other tool here.

Only English is supported in v1. Additional languages are a future iteration once the plumbing exists — each one is another traineddata file that has to be pre-bundled on both platforms, so scope stays deliberately narrow for the first release.

## Input scope

PDF only. Users who start from loose scanned images already have the existing Images → PDF tool to combine them first, then feed the result into OCR. This keeps the tool's own scope tight and matches how every other PDF tool here takes a PDF in, rather than duplicating image-to-PDF assembly logic inside the OCR tool.

## Guard: reject PDFs that already have text

If any page in the input already has extractable text, the job fails up front with a clear error rather than attempting anything:

> "This PDF already has selectable text — OCR is for scanned/image-only PDFs."

This is a deliberate v1 simplification, in the same spirit as Redact's rotation/crop guard (`_assert_no_rotation_or_crop_mismatch` / `assertNoRotationOrCropMismatch`): rather than trying to handle a mixed native/scanned document (which risks producing two overlapping, possibly conflicting text layers on pages that never needed OCR), the tool refuses a mismatched input outright. Detecting "already has text" reuses whatever text-extraction check is simplest on each platform (desktop: pikepdf/reportlab text-object presence per page; web: `pdf.js`'s `getTextContent()` per page — if it returns any non-whitespace items, reject).

No rotation/crop guard is needed here, unlike Redact — both Ghostscript and pdf.js render pages respecting `/Rotate` already, and there's no user-drawn coordinate overlay to correlate against a possibly-mismatched preview, so there's no equivalent risk to guard against.

## Desktop implementation

**New file `apps/desktop/sidecar/ops/pdf_ocr.py`** (new op `pdf.ocr`):

- Input: `{ input: path, output: path }`. No mode/options — v1 has exactly one behavior.
- Validation: reuses `open_pdf`, `existing_file`, `require` from `_common.py`. Before any OCR work, scan every page for existing extractable text (via pikepdf) and fail with a new `ALREADY_HAS_TEXT` error code if any page has text — mirroring how `_assert_no_rotation_or_crop_mismatch` fails fast in `pdf_redact.py` before any raster work begins.
- Per page: rasterize to a PNG at 300 DPI using the same Ghostscript invocation pattern as `pdf_to_img.py`'s `_run_gs` (`-dFirstPage=N -dLastPage=N`) — a higher DPI than the 200 DPI used elsewhere in this app (Redact, PDF-to-images), because OCR accuracy is materially sensitive to input resolution in a way visual rasterization isn't. A missing Ghostscript binary fails with the existing `GHOSTSCRIPT_MISSING`.
- Run the vendored Tesseract binary against that page image: `tesseract page.png page pdf -l eng --tessdata-dir <vendored tessdata path>`. Tesseract's own `pdf` output mode produces a single-page PDF containing the source image plus an invisible OCR text layer — this is exactly the artifact this tool needs, so no custom text-placement code is required on the desktop side at all. A missing/unlocatable Tesseract binary fails with a new `TESSERACT_MISSING` error code, following the exact same shape as `GHOSTSCRIPT_MISSING`.
- Reassemble the per-page single-page PDFs into one output document with pikepdf, in page order — same "build up a fresh document from per-page pieces" shape already used by True Redact's page-swap logic in `pdf_redact.py`, just for every page instead of only the boxed ones.
- New `find_tesseract()` in `_common.py`, structurally identical to `find_ghostscript()`: `$ILOATHEPDF_TESSERACT` env override → `vendor/tesseract/{tesseract.exe,tesseract}` next to the executable/repo root → PATH. Tessdata path resolution follows the same three-tier search, pointing at `vendor/tesseract/tessdata/`.

**Desktop UI**: this tool has no canvas/positioning step — no boxes, no drag/resize, nothing to place on a page — so it does *not* need a bespoke workspace branch like Sign/Redact/Organize. It fits the plain drop-zone → run flow every other single-PDF-in/single-PDF-out tool already uses (Compress, Protect, PDF-to-images), needing only a `TOOLS` entry and an `OpMap` entry, no new component files. `apps/desktop/src/lib/run.ts` gets a `case "pdf.ocr":` mapping input/output paths only — no per-element params to translate, unlike Sign/Watermark/Redact.

## Web implementation

**New file `apps/web/src/engines/ocr.ts`** (`ocrEngine`):

- Before anything else, extract text per page via `pdf.js`'s `getTextContent()` (same API `pdfToImages.ts`/other engines already import from `pdfjs-dist`) and reject with `ALREADY_HAS_TEXT` if any page returns non-whitespace text items.
- Per page: render via `pdf.js` to a canvas at a scale equivalent to 300 DPI (`page.getViewport({ scale: 300/72 })`), same rendering approach `pdfToImages.ts` already uses at a lower scale.
- Run `tesseract.js`'s `recognize()` against that canvas (worker initialized once per job, not per page, to avoid repeatedly paying WASM/model load cost) to get recognized words with bounding boxes (`data.words[].bbox`, `data.words[].text`).
- Build the output page with pdf-lib: embed the canvas as a PNG (`doc.embedPng`) and draw it full-bleed, then for each recognized word draw invisible text at its bounding-box position using PDF text render mode 3 ("neither fill nor stroke") — pdf-lib doesn't expose a render-mode option on its high-level `drawText`, so this goes through its low-level operator API (`pushOperators`, wrapping the draw call with a `Tr 3`/`Tr 0` pair), the same tier of pdf-lib API Redact's byte-level content manipulation already demonstrated working with in this codebase.
- `eng.traineddata` ships as a static asset bundled into the web build (not fetched from `tessdata.projectnaptha.com` or any other CDN, which is `tesseract.js`'s default behavior and must be explicitly overridden via its `langPath` worker option pointing at the bundled copy).

**Web UI**: same reasoning as desktop — no positioning step, so this does not need a bespoke `Workspace` component like Sign/Redact. It uses the generic drop-zone → run flow already shared by Compress/Protect/PDF-to-images, needing only a `TOOLS` registry entry pointing at the shared generic workspace and an options component that (like `RedactOptions.tsx`/`SignOptions.tsx` today) may end up a near-empty placeholder, since there are no user-facing options in v1.

## Shared wiring

- Desktop: `apps/desktop/src/lib/tools.ts` gets a new `TOOLS` entry (`id: "ocr"`, `op: "pdf.ocr"`, `accepts: ["pdf"]`, `multiple: false`, next tint `"l"`, icon: `ScanText` from `lucide-react`). `apps/desktop/src/lib/jobs.ts` gets `PdfOcrParams { input: string; output: string }` / `PdfOcrResult { output: string; bytes: number; pages: number }` types and an `OpMap` entry, matching the shape of the existing single-PDF-in/single-PDF-out ops (e.g. `PdfProtectParams`/`PdfProtectResult`).
- Web: `apps/web/src/tools/registry.tsx` gets a new `TOOLS` entry (tint `"l"`), `apps/web/src/tools/tint.ts`'s `TintKey` extended to include `"l"`, a new `OcrIcon` in `apps/web/src/tools/icons.tsx`, a new CSS tint block (`--tint-l` / `--tint-l-btn`, light and dark) in `apps/web/src/index.css` at the next unused hue after `k` — same rule Redact's `--tint-k` followed (`hue: 10`, a warm red repurposed for Redact's "caution" framing) but picking a distinct hue so OCR doesn't read as another warning color.
- Desktop's own `index.css` also needs `--tint-l` added in both light and dark blocks — the plan for Redact initially missed this exact step for desktop (caught during that task's review), so this spec calls it out explicitly up front rather than relying on a reviewer to catch it again.
- `apps/desktop/sidecar/PROTOCOL.md` gets a new `### pdf.ocr` section documenting the op's params/result shape, following the format of the existing per-op sections.
- Both: `apps/desktop/src/routes/Home.tsx` hero copy, and `README.md` / `apps/web/src/pages/{Home,ToolsIndex,Download}.tsx` / `apps/web/src/components/layout/SiteFooter.tsx` tool-count copy all move from eleven to twelve tools. The website's Download page is where a user actually gets the desktop app, so its copy counts as part of "shipping the desktop feature," not an afterthought — same rule applied for every prior feature.

## Error handling

- `ALREADY_HAS_TEXT` — new error code, raised before any raster/OCR work begins on either platform, per the guard above.
- `GHOSTSCRIPT_MISSING` — reused as-is from `pdf_to_img.py`'s `find_ghostscript()` (desktop only).
- `TESSERACT_MISSING` — new error code, desktop only, same shape as `GHOSTSCRIPT_MISSING`, raised by the new `find_tesseract()`.
- Corrupt or password-protected input reuses the existing `CORRUPT_PDF` / password-required error codes already in `_common.py` (desktop) and the existing password-check path (web) — no new error taxonomy needed beyond the two codes above.

## Testing

- **"Already has text" guard**: a PDF with real vector text is rejected with `ALREADY_HAS_TEXT` on both platforms; a genuinely image-only PDF is not.
- **OCR round-trip**: feed a page image containing a known, rendered string (e.g. built with reportlab/pdf-lib from a fixed piece of text, then rasterized to remove its own text layer, to build a synthetic "scanned" fixture) and assert the output PDF's extracted text contains that string — proves the recognized text actually made it into the invisible layer, not just that Tesseract ran.
- **Visual unchanged**: rasterize the output PDF's page image and confirm it's visually identical (or byte-identical, if the pipeline doesn't re-encode) to what rasterizing the input page produces — proves the visible content wasn't altered by adding the text layer.
- **Invisible in practice**: the added text layer does not visibly render — assert the text drawing uses render mode 3 specifically (desktop: inspect the generated content stream for the mode-3 operator sequence; web: same, since the engine constructs it directly).
- **Missing-binary errors**: `TESSERACT_MISSING` (desktop) is raised when `find_tesseract()` can't locate the binary, same test shape as existing `GHOSTSCRIPT_MISSING` coverage.
- **Cross-engine visual parity**: reuse the manual side-by-side rasterize-and-compare approach used to verify Watermark and Redact (desktop output vs. web output for the same input), since two independently-built OCR pipelines producing visually consistent results is exactly the kind of risk that verification step exists to catch.

## Global Constraints

- OCR language is fixed to English (`eng.traineddata`) for v1, not user-configurable. No per-page language override.
- Rasterization DPI is fixed at 300 (higher than this app's usual 200 DPI elsewhere), not user-configurable.
- Input must be a PDF; standalone images are out of scope for v1 (use Images → PDF first).
- A PDF with any pre-existing extractable text is rejected outright (`ALREADY_HAS_TEXT`), not partially processed.
- No deskew/despeckle/image preprocessing before OCR, no OCR-confidence UI, no mixed native+scanned per-page handling — explicit v1 non-goals.
- New third-party dependency, unlike prior tools: the Tesseract binary + `eng.traineddata` vendored on desktop, and the `tesseract.js` npm package + bundled `eng.traineddata` on web. Both must be fully local — the web build must override `tesseract.js`'s default CDN `langPath` to point at the bundled copy.
- Tint key `"l"`; `Tint`/`TintKey` types on both platforms extended accordingly, including desktop's own `index.css` (not just web's).
- Tool count copy (README, both apps' Home/Download/ToolsIndex/Footer) moves from eleven to twelve tools — update on both platforms, including the desktop download page on the website.
