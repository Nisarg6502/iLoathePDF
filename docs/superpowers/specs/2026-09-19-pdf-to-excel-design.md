# PDF → Excel — Design Spec

## Overview

A new tool, `pdf-to-excel`, extracts tables from a PDF into a real, editable `.xlsx` workbook. Unlike every prior tool in this app, it ships **desktop-only** — no client-side JavaScript/WASM library does table extraction well enough to meet this app's quality bar (confirmed via research before this design), so the web app shows it as a disabled placeholder rather than a broken or low-quality attempt.

## Scope decision

Of the four possible directions (PDF→DOCX, PDF→XLSX, DOCX→PDF, XLSX→PDF), only **PDF→XLSX, desktop-only** ships in v1:

- **PDF→DOCX** is deferred: the best available open-source library (`pdf2docx`) depends on PyMuPDF, which is AGPL-3.0 — bundling it into this MIT-licensed, closed-source-installer desktop app would create real licensing exposure. The permissive alternative (`pdfminer.six` + `python-docx`, hand-rolling layout reconstruction) is meaningfully lower quality. Revisit only if a PyMuPDF commercial license is acquired or a permissive-stack quality bar is judged acceptable later.
- **Word/Excel→PDF** is dropped: the only viable local renderer (LibreOffice headless) is 800MB–1.5GB and multi-second cold-start — disproportionate for this "lightweight, local" app, and there is no credible client-side web equivalent that isn't a paid commercial SDK.
- **PDF→XLSX on web** is dropped: no client-side library does table detection well; this app's Compress/Convert-Images "Preview badge" precedent (real processing, lower quality) doesn't apply here since there's no reduced-quality fallback to offer, only "doesn't work."

## Engine

**New desktop sidecar op `pdf.to_excel`**, using two new pure-Python, MIT-licensed dependencies:
- `pdfplumber` — table detection (built on `pdfminer.six`, the community-favored default over `camelot-py`'s lattice mode, which needs OpenCV — a native dependency with real packaging weight this app doesn't already carry).
- `openpyxl` — writes the resulting `.xlsx`.

Neither is a native binary, so there is nothing to vendor (unlike Ghostscript/Tesseract) — a plain `pip install` addition to `requirements.txt`.

## Output structure

- **One worksheet per page**, named `"Page N"` (1-indexed, matching the PDF's own page numbering).
- A page with **zero** detected tables contributes no worksheet at all — not an empty one.
- A page with **multiple** detected tables gets them all written into that page's single worksheet, each table's rows appended in sequence with **one fully blank row** separating consecutive tables, so a spreadsheet reader can visually and programmatically tell them apart without extra metadata.
- If **no page** in the entire document has a detected table, the job fails outright with `NO_TABLES_FOUND` and produces no output file — the same "refuse a mismatched input" discipline already established by Redact's rotation guard and OCR's already-has-text guard, rather than silently handing back a workbook with nothing useful in it.
- Cell values are written as `pdfplumber` extracts them (strings; a cell `pdfplumber` couldn't read is written as an empty string, not `None`, so nothing downstream chokes on a null cell).

## Web: a disabled "Desktop only" placeholder

This is the first tool in the app that cannot run on web at all — every prior tool has shipped to both platforms (some with a lower-quality "Preview" badge, but always present and runnable). `ToolConfig.status` (currently `"live" | "preview"`) gains a third value, `"desktop-only"`:

- **`apps/web/src/pages/ToolsIndex.tsx`**: a tool card with `status === "desktop-only"` shows a "Desktop only" badge (new `DesktopOnlyBadge` component, styled distinctly from the existing `PreviewBadge` — muted/inert rather than the preview badge's "this works, just not at full quality" tone) instead of the `PreviewBadge`, and its `"Open →"` label changes to `"Desktop only →"`. Its `<Link>` target changes to `/download` instead of `/tools/pdf-to-excel`, so clicking it takes the user straight to getting the app that actually runs it, not a broken workspace.
- **`apps/web/src/pages/ToolDetail.tsx`**: guarded directly, in case someone navigates to `/tools/pdf-to-excel` by a bookmarked or typed URL rather than clicking the card — when `tool.status === "desktop-only"`, render an explanatory panel (tool name/icon/description, same header as every other tool page, plus a sentence explaining it's desktop-only and a link to `/download`) instead of `<ToolPage tool={tool} />`.
- **`ToolConfig.engine`** stays a required field (no ripple change to every other tool's type or to consumers that assume it exists) — `pdf-to-excel`'s registry entry gets a placeholder `engine` that immediately throws `"This tool is only available in the desktop app."` if ever invoked, as defense-in-depth behind the `ToolDetail` guard, not as the primary mechanism.
- **`OptionsPanel`**: a never-rendered placeholder returning `null`, following the exact established pattern (`RedactOptions.tsx`, `OcrOptions.tsx`'s sibling for a bespoke-workspace tool — here it's never-rendered because `ToolDetail` never gets as far as rendering `ToolPage`/its options sidebar at all for a desktop-only tool).

## Desktop implementation

**New file `apps/desktop/sidecar/ops/pdf_to_excel.py`** (op `pdf.to_excel`), following the established op structure:

- Input: `{ input: path, output: path }`. No mode/options — v1 has exactly one behavior, same as OCR.
- Validation reuses `existing_file`, `require`, `atomic_output`, `size_of` from `_common.py`.
- Uses `pdfplumber.open(path)` to iterate pages; `page.extract_tables()` returns a list of tables, each a list of rows, each row a list of cell strings (or `None` for an unreadable cell — normalized to `""` before writing).
- Builds the output with `openpyxl.Workbook()`: for each page (in order) with at least one detected table, adds a worksheet named `f"Page {page_no}"`, appends each table's rows via `ws.append(row)`, with one `ws.append([])` (a fully blank row) between consecutive tables on the same page. Pages with zero tables are skipped — no worksheet created for them.
- If the resulting workbook has zero worksheets (every page had zero tables), raise `OpError("NO_TABLES_FOUND", ...)` and do not write an output file — checked after the full pass over all pages, not after the first empty page, so a document's later pages still get a chance to contribute a table.
- `openpyxl.Workbook()` starts with one default empty worksheet (`Sheet`) — this default sheet must be removed before saving unless it's needed to satisfy "at least one worksheet" when nothing else qualifies (which can't happen, since that case is exactly the `NO_TABLES_FOUND` guard above — by the time save() would run, at least one real per-page sheet always exists).
- Writes atomically via `atomic_output`, same as every other op.

**Desktop UI**: no bespoke workspace (no positioning step, same as OCR) — uses the generic drop-zone → run flow. New `TOOLS` entry (`id: "pdf-to-excel"`, `op: "pdf.to_excel"`, `accepts: ["pdf"]`, `multiple: false`, tint `"m"`, icon: a spreadsheet/grid glyph from `lucide-react`, e.g. `Table` or `Sheet`). `apps/desktop/src/lib/run.ts` gets a `case "pdf.to_excel":` mapping input/output paths only, matching OCR's minimal case block. `apps/desktop/src/lib/jobs.ts` gets `PdfToExcelParams { input: string; output: string }` / `PdfToExcelResult { output: string; bytes: number; sheets: number }` and an `OpMap` entry.

## Shared wiring

- Desktop: `apps/desktop/src/lib/tools.ts` new `TOOLS` entry, `Tint` extended to `"m"`. `apps/desktop/sidecar/main.py` registers `"pdf.to_excel": "ops.pdf_to_excel:run"`. `apps/desktop/sidecar/PROTOCOL.md` gets a `### pdf.to_excel` section. `apps/desktop/sidecar/requirements.txt` gains `pdfplumber` and `openpyxl` pinned to their current stable versions (implementer resolves and pins the exact versions at implementation time, matching how every other dependency here is pinned).
- Web: `apps/web/src/tools/registry.tsx` new `TOOLS` entry with `status: "desktop-only"`, `tint: "m"`. `apps/web/src/tools/tint.ts`'s `TintKey` extended to `"m"`. `apps/web/src/tools/icons.tsx` gets a matching icon (same glyph family as desktop's, stroked in `var(--tint-m)`). `apps/web/src/index.css` gets `--tint-m` / `--tint-m-btn` (light + dark), same hue on both platforms (next unused hue after OCR's 140 — pick 190, a distinct blue, keeping every tint visually distinguishable). `apps/web/src/tools/ToolConfig.ts`'s `status` type extended to `"live" | "preview" | "desktop-only"`. New `apps/web/src/components/DesktopOnlyBadge.tsx`.
- Both: `apps/desktop/src/routes/Home.tsx` hero copy, `README.md`, `apps/web/src/pages/{Home,ToolsIndex,Download}.tsx`, `apps/web/src/components/layout/SiteFooter.tsx` — tool count copy moves from twelve to thirteen. README's tools table gets a new row for PDF → Excel, noting "Desktop only" the same way the platform-comparison table already flags other capability differences.

## Error handling

- `NO_TABLES_FOUND` — new error code, desktop only, raised after the full page pass finds zero tables anywhere.
- Corrupt or password-protected input reuses the existing `CORRUPT_PDF` / `ENCRYPTED_PDF` error codes already in `_common.py` — no new error taxonomy needed beyond `NO_TABLES_FOUND`.
- No `TESSERACT_MISSING`/`GHOSTSCRIPT_MISSING`-style binary-missing error is needed — `pdfplumber`/`openpyxl` are pure-Python; a broken install would surface as a normal Python import error, not a protocol-shaped one, since there's no "is the binary on PATH" question to answer.

## Testing

- **Table detection and sheet structure**: a multi-page PDF fixture with tables on some pages and not others (built directly with `reportlab`'s table-drawing primitives, or a simple grid of `drawString` calls with visible ruling lines `pdfplumber` can detect) — assert the output workbook has exactly one sheet per table-bearing page, named correctly, and that pages without a table contribute no sheet.
- **Multiple tables on one page**: assert a single sheet contains both tables' rows with exactly one blank row separating them.
- **Zero tables anywhere**: assert `NO_TABLES_FOUND` and that no output file is written.
- **Cell content round-trip**: a fixture with known cell values — assert the written `.xlsx`'s cells match, including that an unreadable cell becomes `""` not `None`/a crash.
- **Error propagation**: encrypted/corrupt input reuses existing coverage patterns from other ops (e.g. `pdf_redact.py`'s equivalent tests).
- **Web guard**: a test confirming `ToolsIndex`'s card for a `status: "desktop-only"` tool links to `/download` and shows the `DesktopOnlyBadge`, not `PreviewBadge`; a test confirming `ToolDetail` renders the explanatory panel (not `ToolPage`) for a `desktop-only` tool regardless of direct navigation.

## Global Constraints

- Desktop-only for v1 — no web engine, no web-side table extraction attempt.
- Exactly one behavior — no options/mode to configure (no page-range control, no "which table on this page" selection).
- One worksheet per page bearing at least one table, named `"Page N"`; pages with zero tables contribute no worksheet.
- Multiple tables on one page share that page's single worksheet, separated by exactly one blank row.
- Zero tables anywhere in the document is a hard failure (`NO_TABLES_FOUND`), not a partial/empty result.
- `pdfplumber` only for table detection — no `camelot-py`/OpenCV.
- New third `ToolConfig.status` value `"desktop-only"`, with its own badge and its own `ToolDetail`/`ToolsIndex` handling — distinct from `"preview"`, which still means "runs, just not at full quality."
- Tint key `"m"`; `Tint`/`TintKey` types on both platforms extended accordingly, including desktop's own `index.css`.
- Tool count copy (README, both apps' Home/Download/ToolsIndex/Footer) moves from twelve to thirteen tools.
