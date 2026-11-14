# PDF to Excel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thirteenth tool, `pdf-to-excel`, that extracts tables from a PDF into a real, editable `.xlsx` workbook — desktop-only, since no client-side library does table extraction well enough to ship on web.

**Architecture:** A new Python sidecar op (`pdf.to_excel`) uses `pdfplumber` to detect tables per page and `openpyxl` to write them into one worksheet per table-bearing page. Both are pure-Python — no native binary to vendor, unlike this app's prior two features. The web app gets a new `ToolConfig.status` value (`"desktop-only"`) and matching UI treatment, since this is the first tool with no web engine at all.

**Tech Stack:** Desktop: `pdfplumber` + `openpyxl` (both new, pure-Python, MIT-licensed), reusing existing `_common.py` helpers and `reportlab` (already a dependency) for test fixtures. Web: no new dependency — a new UI state on top of the existing `ToolConfig`/registry/routing.

## Global Constraints

- Desktop-only for v1 — no web engine, no web-side table extraction attempt.
- Exactly one behavior — no options/mode to configure (no page-range control, no "which table on this page" selection).
- One worksheet per page bearing at least one table, named `"Page N"`; pages with zero tables contribute no worksheet.
- Multiple tables on one page share that page's single worksheet, separated by exactly one blank row.
- Zero tables anywhere in the document is a hard failure (`NO_TABLES_FOUND`), not a partial/empty result.
- `pdfplumber` only for table detection — no `camelot-py`/OpenCV.
- New third `ToolConfig.status` value `"desktop-only"`, with its own badge and its own `ToolDetail`/`ToolsIndex` handling — distinct from `"preview"`, which still means "runs, just not at full quality."
- Tint key `"m"`, hue 190; `Tint`/`TintKey` types on both platforms extended accordingly, including desktop's own `index.css`.
- Tool count copy (README, both apps' Home/Download/ToolsIndex/Footer) moves from twelve to thirteen tools.

---

## File Structure

**Desktop:**
- `apps/desktop/sidecar/ops/pdf_to_excel.py` — new: the `pdf.to_excel` op.
- `apps/desktop/sidecar/tests/test_pdf_to_excel.py` — new.
- `apps/desktop/sidecar/main.py` — modify: register the op in `DISPATCH`.
- `apps/desktop/sidecar/PROTOCOL.md` — modify: document `pdf.to_excel`.
- `apps/desktop/sidecar/requirements.txt` — modify: add `pdfplumber` and `openpyxl`.
- `apps/desktop/src/lib/jobs.ts` — modify: `PdfToExcelParams`/`PdfToExcelResult`, `OpMap` entry.
- `apps/desktop/src/lib/tools.ts` — modify: new `TOOLS` entry, `Tint` extended to `"m"`.
- `apps/desktop/src/lib/run.ts` — modify: new `case "pdf.to_excel":`.
- `apps/desktop/src/components/OptionsPanel.tsx` — modify: new `case "pdf-to-excel":`.
- `apps/desktop/src/index.css` — modify: `--tint-m` (light + dark).

**Web:**
- `apps/web/src/tools/ToolConfig.ts` — modify: `status` gains `"desktop-only"`.
- `apps/web/src/components/DesktopOnlyBadge.tsx` — new.
- `apps/web/src/pages/ToolsIndex.tsx` — modify: desktop-only card treatment.
- `apps/web/src/pages/ToolDetail.tsx` — modify: desktop-only route guard.
- `apps/web/src/tools/options/PdfToExcelOptions.tsx` — new: never-rendered placeholder.
- `apps/web/src/tools/icons.tsx` — modify: add `PdfToExcelIcon`.
- `apps/web/src/tools/tint.ts` — modify: `TintKey` extended to `"m"`.
- `apps/web/src/tools/registry.tsx` — modify: new `TOOLS` entry, `status: "desktop-only"`.
- `apps/web/src/index.css` — modify: `--tint-m` / `--tint-m-btn` (light + dark).

**Shared copy (Task 3, done directly, not by a subagent):**
- `README.md`, `apps/desktop/src/routes/Home.tsx`, `apps/web/src/pages/{Home,ToolsIndex,Download}.tsx`, `apps/web/src/components/layout/SiteFooter.tsx` — tool count twelve → thirteen.

---

## Wave plan

- **Wave 1 (parallel, independent):** Task 1 (desktop: `pdf.to_excel` op + tests + desktop wiring) and Task 2 (web: the new `"desktop-only"` UI state + registry entry) touch entirely disjoint files. Task 2 does not need the real op to exist — only the `ToolConfig` type and the card/detail rendering change — so it is not blocked on Task 1.
- **Wave 2 (sequential, after both merge):** Task 3 (shared website copy sync — small, done directly) then Task 4 (final whole-branch review).

---

## Task 1: Desktop — `pdf.to_excel` op, desktop wiring

**Files:**
- Modify: `apps/desktop/sidecar/requirements.txt`
- Create: `apps/desktop/sidecar/ops/pdf_to_excel.py`
- Create: `apps/desktop/sidecar/tests/test_pdf_to_excel.py`
- Modify: `apps/desktop/sidecar/main.py`
- Modify: `apps/desktop/sidecar/PROTOCOL.md`
- Modify: `apps/desktop/src/lib/jobs.ts`
- Modify: `apps/desktop/src/lib/tools.ts`
- Modify: `apps/desktop/src/lib/run.ts`
- Modify: `apps/desktop/src/components/OptionsPanel.tsx`
- Modify: `apps/desktop/src/index.css`

**Interfaces:**
- Produces (Python): `ops.pdf_to_excel.run(params: dict, progress: ProgressFn) -> dict` where `params = {"input": str, "output": str}` and the result is `{"output": str, "bytes": int, "sheets": int}`.
- Produces (TS): `OpName` gains `"pdf.to_excel"`; `PdfToExcelParams { input: string; output: string }`; `PdfToExcelResult { output: string; bytes: number; sheets: number }`.
- Consumes: `existing_file`, `require`, `atomic_output`, `open_pdf`, `size_of`, `OpError` from `_common.py` (all already used by `pdf_ocr.py`/`pdf_redact.py`); the existing `Tool`/`OpMap`/`OptionsPanel` shapes.

### Step 1: Install the new dependencies and spike-verify the real API before building on it

- [ ] **Add to `apps/desktop/sidecar/requirements.txt`** (append):

```
pdfplumber==0.11.10
openpyxl==3.1.5
```

- [ ] **Install them**

Run: `apps/desktop/.venv/Scripts/python.exe -m pip install -r apps/desktop/sidecar/requirements.txt` (from repo root, or `pip install -r sidecar/requirements.txt` from `apps/desktop/`)
Expected: installs cleanly

- [ ] **Write a throwaway spike script** at `apps/desktop/sidecar/_spike_pdf_to_excel.py` (deleted at the end of this step — it exists only to confirm the real API shape before the actual TDD steps depend on it):

```python
import io
from reportlab.platypus import Table, TableStyle, SimpleDocTemplate
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter

buf = io.BytesIO()
doc = SimpleDocTemplate(buf, pagesize=letter)
data = [["Name", "Age"], ["Alice", "30"], ["Bob", "25"]]
t = Table(data)
t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 1, colors.black)]))
doc.build([t])

with open("_spike_table.pdf", "wb") as f:
    f.write(buf.getvalue())

import pdfplumber

with pdfplumber.open("_spike_table.pdf") as pdf:
    tables = pdf.pages[0].extract_tables()
    print("tables:", tables)
    assert tables == [[["Name", "Age"], ["Alice", "30"], ["Bob", "25"]]]

import openpyxl

wb = openpyxl.Workbook()
assert wb.sheetnames == ["Sheet"]
ws = wb.create_sheet("Page 1")
ws.append(["a", "b"])
ws.append([])
ws.append(["c", "d"])
wb.remove(wb["Sheet"])
wb.save("_spike_out.xlsx")

wb2 = openpyxl.load_workbook("_spike_out.xlsx")
assert wb2.sheetnames == ["Page 1"]
rows = list(wb2["Page 1"].iter_rows(values_only=True))
assert rows == [("a", "b"), (None, None), ("c", "d")]

print("SPIKE OK -- API confirmed")
```

- [ ] **Run it**

Run: `apps/desktop/.venv/Scripts/python.exe apps/desktop/sidecar/_spike_pdf_to_excel.py` (from repo root)
Expected: prints `SPIKE OK -- API confirmed` with no assertion errors. This confirms: `reportlab`'s `Table`/`TableStyle` with a `GRID` style produces a table `pdfplumber.page.extract_tables()` detects correctly; a blank `ws.append([])` round-trips as a tuple of `None`s on reload (relevant for Step 5's test assertions); `wb.remove(wb["Sheet"])` correctly drops the unwanted default sheet.

- [ ] **Delete the spike** — `rm apps/desktop/sidecar/_spike_pdf_to_excel.py apps/desktop/sidecar/_spike_table.pdf apps/desktop/sidecar/_spike_out.xlsx` — its job is done.

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/requirements.txt
git commit -m "chore(desktop): add pdfplumber and openpyxl dependencies"
```

### Step 2: Reject a PDF with zero tables anywhere

- [ ] **Write the failing test**, new `apps/desktop/sidecar/tests/test_pdf_to_excel.py`:

```python
"""Tests for `pdf.to_excel` -- extract tables from a PDF into an .xlsx workbook."""
from __future__ import annotations

from pathlib import Path

import openpyxl
import pytest
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle

from ops import pdf_to_excel
from ops._common import OpError, noop_progress


def _make_table_pdf(path: Path, tables_per_page: list[list[list[list[str]]]]) -> None:
    """`tables_per_page` is one entry per page; each entry is a list of tables
    (each table a list of rows, each row a list of cell strings) to draw on
    that page. A page with an empty list gets a page of plain text instead --
    reportlab's SimpleDocTemplate can't easily emit a truly blank page, and a
    page pdfplumber can find zero tables on is exactly what these tests need."""
    from reportlab.platypus import PageBreak, Paragraph
    from reportlab.lib.styles import getSampleStyleSheet

    doc = SimpleDocTemplate(str(path), pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    for page_index, tables in enumerate(tables_per_page):
        if page_index > 0:
            story.append(PageBreak())
        if not tables:
            story.append(Paragraph("No table on this page, just text.", styles["Normal"]))
            continue
        for table_data in tables:
            t = Table(table_data)
            t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 1, colors.black)]))
            story.append(t)
    doc.build(story)


def test_to_excel_rejects_a_pdf_with_no_tables_anywhere(tmp_path, out_dir):
    src = tmp_path / "no_tables.pdf"
    _make_table_pdf(src, [[], []])  # two pages, neither has a table
    dest = out_dir / "o.xlsx"

    with pytest.raises(OpError) as exc:
        pdf_to_excel.run({"input": str(src), "output": str(dest)}, noop_progress)
    assert exc.value.code == "NO_TABLES_FOUND"
    assert not dest.exists()
```

- [ ] **Run test to verify it fails**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_to_excel.py -v` (from `apps/desktop/`)
Expected: FAIL with `ModuleNotFoundError: No module named 'ops.pdf_to_excel'`

- [ ] **Implement the guard**, new `apps/desktop/sidecar/ops/pdf_to_excel.py`:

```python
"""`pdf.to_excel` -- extract tables from a PDF into a real, editable .xlsx.

One worksheet per page that has at least one detected table, named "Page N".
A page with multiple tables gets them all in that page's single worksheet,
separated by one blank row. A page with no table contributes no worksheet at
all -- not an empty one. If the whole document has no table anywhere, the
job fails outright with NO_TABLES_FOUND rather than handing back a workbook
with nothing useful in it, the same "refuse a mismatched input" discipline
`pdf.redact`'s rotation guard and `pdf.ocr`'s already-has-text guard use.
"""
from __future__ import annotations

from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    open_pdf,
    require,
    size_of,
)


def run(params: dict, progress: ProgressFn) -> dict:
    import openpyxl
    import pdfplumber

    path = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))

    # Reuse the same pikepdf-backed encrypted/corrupt checks every other op
    # uses, before pdfplumber (built on pdfminer.six, not pikepdf) ever
    # touches the file.
    with open_pdf(path) as check:
        total_pages = len(check.pages)

    progress(5, f"Scanning {total_pages} page(s) for tables")

    wb = openpyxl.Workbook()
    sheets_written = 0

    with pdfplumber.open(str(path)) as pdf:
        for index, page in enumerate(pdf.pages):
            page_no = index + 1
            tables = page.extract_tables()
            pct = 5 + int(85 * page_no / total_pages) if total_pages else 90
            if not tables:
                progress(pct, f"page {page_no}: no table")
                continue
            ws = wb.create_sheet(f"Page {page_no}")
            for table_index, table in enumerate(tables):
                if table_index > 0:
                    ws.append([])
                for row in table:
                    ws.append(["" if cell is None else cell for cell in row])
            sheets_written += 1
            progress(pct, f"page {page_no}: {len(tables)} table(s)")

    if sheets_written == 0:
        raise OpError("NO_TABLES_FOUND", "No tables were found in this PDF.")

    wb.remove(wb["Sheet"])

    progress(92, "Writing output")
    with atomic_output(dest) as tmp_out:
        try:
            wb.save(str(tmp_out))
        except OSError as exc:
            raise OpError("OUTPUT_WRITE_FAILED", f"Cannot write {dest}: {exc}") from exc

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest), "sheets": sheets_written}
```

- [ ] **Run test to verify it passes**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_to_excel.py -v`
Expected: PASS

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/ops/pdf_to_excel.py apps/desktop/sidecar/tests/test_pdf_to_excel.py
git commit -m "feat(desktop): pdf.to_excel rejects a PDF with no tables anywhere"
```

### Step 3: One sheet per table-bearing page, named correctly; pages without a table skipped

- [ ] **Write the failing tests** appended to `test_pdf_to_excel.py`:

```python
def test_to_excel_writes_one_sheet_per_table_bearing_page(tmp_path, out_dir):
    src = tmp_path / "mixed.pdf"
    table_a = [["Name", "Age"], ["Alice", "30"]]
    table_c = [["City", "Pop"], ["Tokyo", "37M"]]
    _make_table_pdf(src, [[table_a], [], [table_c]])  # page 2 has no table
    dest = out_dir / "o.xlsx"

    result = pdf_to_excel.run({"input": str(src), "output": str(dest)}, noop_progress)

    assert result["sheets"] == 2
    assert result["output"] == str(dest)
    assert result["bytes"] > 0
    wb = openpyxl.load_workbook(str(dest))
    assert wb.sheetnames == ["Page 1", "Page 3"]  # page 2 contributes nothing
    rows_1 = list(wb["Page 1"].iter_rows(values_only=True))
    assert rows_1 == [("Name", "Age"), ("Alice", "30")]
    rows_3 = list(wb["Page 3"].iter_rows(values_only=True))
    assert rows_3 == [("City", "Pop"), ("Tokyo", "37M")]


def test_to_excel_progress_reaches_100(tmp_path, out_dir):
    src = tmp_path / "one.pdf"
    _make_table_pdf(src, [[[["A"], ["1"]]]])
    dest = out_dir / "o.xlsx"
    calls: list[int] = []

    pdf_to_excel.run({"input": str(src), "output": str(dest)}, lambda pct, note="": calls.append(pct))
    assert calls[-1] == 100
```

- [ ] **Run test to verify it fails, then passes** (the implementation from Step 2 already covers this — confirm rather than re-implement)

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_to_excel.py -v`
Expected: all PASS. If `test_to_excel_writes_one_sheet_per_table_bearing_page` fails, check `_make_table_pdf`'s `PageBreak` handling is producing exactly 3 pages as intended (debug with `pdfplumber.open(src).pages` length) before touching `pdf_to_excel.py` itself.

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/tests/test_pdf_to_excel.py
git commit -m "test(desktop): pdf.to_excel sheet-per-page and progress coverage"
```

### Step 4: Multiple tables on one page share a sheet, separated by one blank row

- [ ] **Write the failing test** appended to `test_pdf_to_excel.py`:

```python
def test_to_excel_separates_multiple_tables_on_one_page_with_a_blank_row(tmp_path, out_dir):
    src = tmp_path / "two_tables.pdf"
    table_a = [["A"], ["1"]]
    table_b = [["B"], ["2"]]
    _make_table_pdf(src, [[table_a, table_b]])  # one page, two tables
    dest = out_dir / "o.xlsx"

    result = pdf_to_excel.run({"input": str(src), "output": str(dest)}, noop_progress)

    assert result["sheets"] == 1
    wb = openpyxl.load_workbook(str(dest))
    assert wb.sheetnames == ["Page 1"]
    rows = list(wb["Page 1"].iter_rows(values_only=True))
    assert rows == [("A",), ("1",), (None,), ("B",), ("2",)]
```

- [ ] **Run test to verify it fails, then passes**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_to_excel.py -v`
Expected: PASS. The Step 2 implementation already writes a blank `ws.append([])` between tables on the same page — this test locks that behavior down. If it fails, check `_make_table_pdf` actually draws two visually distinct, separately-detectable tables on one page (reportlab's default flowable layout stacks them vertically with a gap, which pdfplumber should detect as two separate tables — if `extract_tables()` returns only one merged table, add an explicit `Spacer` between them in `_make_table_pdf`, imported from `reportlab.platypus`).

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/tests/test_pdf_to_excel.py
git commit -m "test(desktop): pdf.to_excel multi-table-per-page separator coverage"
```

### Step 5: Cell content round-trip, including an unreadable cell

- [ ] **Write the failing test** appended to `test_pdf_to_excel.py`:

```python
def test_to_excel_writes_none_cells_as_empty_string(tmp_path, out_dir):
    src = tmp_path / "ragged.pdf"
    # A row with a genuinely empty cell -- reportlab renders an empty string
    # cell as blank, which pdfplumber can report back as None.
    table = [["Name", "Note"], ["Alice", ""]]
    _make_table_pdf(src, [[table]])
    dest = out_dir / "o.xlsx"

    pdf_to_excel.run({"input": str(src), "output": str(dest)}, noop_progress)

    wb = openpyxl.load_workbook(str(dest))
    rows = list(wb["Page 1"].iter_rows(values_only=True))
    # Whatever pdfplumber actually reported for the blank cell (None or ""),
    # the written workbook must never contain a raw None -- only "".
    for row in rows:
        assert all(cell is not None for cell in row)
```

- [ ] **Run test to verify it fails, then passes**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_to_excel.py -v`
Expected: PASS — Step 2's `["" if cell is None else cell for cell in row]` already handles this.

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/tests/test_pdf_to_excel.py
git commit -m "test(desktop): pdf.to_excel never writes a raw None cell"
```

### Step 6: Error propagation (encrypted, corrupt, missing input)

- [ ] **Write the failing tests** appended to `test_pdf_to_excel.py`:

```python
def test_to_excel_propagates_encrypted_and_corrupt(encrypted_pdf, corrupt_pdf, out_dir):
    for src, code in ((encrypted_pdf, "ENCRYPTED_PDF"), (corrupt_pdf, "CORRUPT_PDF")):
        with pytest.raises(OpError) as exc:
            pdf_to_excel.run({"input": str(src), "output": str(out_dir / "o.xlsx")}, noop_progress)
        assert exc.value.code == code
    assert not (out_dir / "o.xlsx").exists()


def test_to_excel_missing_input_file(out_dir, tmp_path):
    with pytest.raises(OpError) as exc:
        pdf_to_excel.run({"input": str(tmp_path / "ghost.pdf"), "output": str(out_dir / "o.xlsx")}, noop_progress)
    assert exc.value.code == "FILE_NOT_FOUND"
```

`encrypted_pdf`/`corrupt_pdf`/`out_dir` are existing shared fixtures from `apps/desktop/sidecar/tests/conftest.py` (already used by `test_pdf_redact.py`/`test_pdf_protect.py`) — no new fixtures needed.

- [ ] **Run test to verify it fails, then passes**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_to_excel.py -v`
Expected: all PASS — `open_pdf()`'s existing encrypted/corrupt handling and `existing_file()`'s missing-file handling already cover this; this step locks it down with explicit tests.

- [ ] **Run the full sidecar test suite to confirm nothing regressed**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/ -v`
Expected: same pass/skip counts as before this task, plus the new `test_pdf_to_excel.py` tests, no FAIL

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/tests/test_pdf_to_excel.py
git commit -m "test(desktop): pdf.to_excel error propagation coverage"
```

### Step 7: Register the op in `main.py` and `PROTOCOL.md`

- [ ] **Add to `DISPATCH` in `apps/desktop/sidecar/main.py`**, alongside the existing entries (immediately after the `"pdf.ocr"` line):

```python
    "pdf.to_excel": "ops.pdf_to_excel:run",
```

- [ ] **Add a `### pdf.to_excel` section to `apps/desktop/sidecar/PROTOCOL.md`**, following the format of the existing per-op sections:

```markdown
### pdf.to_excel

Extract tables from a PDF into a real, editable .xlsx workbook.

**Params:**
- `input` (string, required) — absolute path to the source PDF.
- `output` (string, required) — absolute path to write the .xlsx result to.

**Result:**
- `output` (string) — the path written.
- `bytes` (number) — output file size.
- `sheets` (number) — how many worksheets were written (one per table-bearing page).

**Errors:**
- `NO_TABLES_FOUND` — no table was detected on any page; nothing is written.
- `ENCRYPTED_PDF`, `CORRUPT_PDF`, `FILE_NOT_FOUND` — same as every other PDF-reading op.
```

- [ ] **Run the full sidecar test suite to confirm the dispatch wiring didn't break anything else**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/ -v`
Expected: same as Step 6, plus dispatch registration doesn't change test outcomes (no test directly exercises `main.py`'s dispatch table for this op in this plan, matching how `pdf.ocr`/`pdf.redact` were also verified indirectly via `pdf_to_excel.run()` called directly in tests, not through the dispatch layer)

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/main.py apps/desktop/sidecar/PROTOCOL.md
git commit -m "feat(desktop): register pdf.to_excel in the sidecar dispatch table"
```

### Step 8: `jobs.ts` types + `OpMap` entry

- [ ] **Add to `apps/desktop/src/lib/jobs.ts`**, near the other single-file-in/single-file-out param/result types (right after `PdfOcrResult`):

```typescript
export interface PdfToExcelParams { input: string; output: string }
export interface PdfToExcelResult { output: string; bytes: number; sheets: number }
```

- [ ] **Add to the `OpMap` interface**, alongside the existing entries:

```typescript
  "pdf.to_excel": [PdfToExcelParams, PdfToExcelResult];
```

- [ ] **Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: clean (no errors) — `"pdf.to_excel"` isn't referenced by `tools.ts`/`run.ts` yet, so this only proves the new types themselves are well-formed.

- [ ] **Commit**

```bash
git add apps/desktop/src/lib/jobs.ts
git commit -m "feat(desktop): add PdfToExcelParams/PdfToExcelResult and pdf.to_excel to OpMap"
```

### Step 9: `tools.ts`, `run.ts`, `OptionsPanel.tsx`, `index.css` wiring

- [ ] **Extend `Tint` in `apps/desktop/src/lib/tools.ts`**:

```typescript
export type Tint = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m";
```

- [ ] **Add `FileSpreadsheet` to the existing `lucide-react` import block** in `tools.ts` (confirmed to exist in the installed `lucide-react` package):

```typescript
import {
  Combine,
  EyeOff,
  FileImage,
  FileOutput,
  FileSpreadsheet,
  Images,
  Lock,
  Minimize2,
  Replace,
  ScanText,
  Scissors,
  Signature,
  Stamp,
} from "lucide-react";
```

- [ ] **Add a new `TOOLS` entry**, after the `ocr` entry:

```typescript
  {
    id: "pdf-to-excel",
    path: "/t/pdf-to-excel",
    title: "PDF to Excel",
    description: "Extract tables from a PDF into a real, editable spreadsheet.",
    icon: FileSpreadsheet,
    group: "pdf",
    tint: "m",
    op: "pdf.to_excel",
    accepts: ["pdf"],
    acceptsLabel: "a PDF file",
    multiple: false,
    ordered: false,
    action: "Save Excel file",
    defaults: {},
  },
```

- [ ] **Add a `case "pdf.to_excel":` to `execute()` in `apps/desktop/src/lib/run.ts`**, after the `case "pdf.ocr":` block:

```typescript
    case "pdf.to_excel": {
      const r = await runJob(
        "pdf.to_excel",
        {
          input: first.path,
          output: join(`${base}.xlsx`),
        },
        opts,
      );
      return {
        outputs: [{ path: r.output, bytes: r.bytes }],
        summary: `${r.sheets} sheet(s) extracted.`,
      };
    }
```

- [ ] **Add a `case "pdf-to-excel":` to the switch in `apps/desktop/src/components/OptionsPanel.tsx`**, after the `case "ocr":` block:

```typescript
    case "pdf-to-excel":
      return (
        <OptionsPanel
          className={className}
          description="Extracts every table it finds into a spreadsheet — one sheet per page. No options to configure."
        >
          {null}
        </OptionsPanel>
      );
```

- [ ] **Add `--tint-m` to `apps/desktop/src/index.css`**, in both the light `:root` block (immediately after the existing `--tint-l` line) and the dark `:root[data-theme="dark"]` block (same position), copying `--tint-l`'s exact oklch lightness/chroma values, only changing hue to 190 (a distinct blue, keeping every tint visually distinguishable):

```css
  --tint-m: oklch(0.575 0.145 190);
```

(light block) and

```css
  --tint-m: oklch(0.8 0.125 190);
```

(dark block).

- [ ] **Typecheck and build**

Run: `cd apps/desktop && npm run typecheck && npm run build`
Expected: clean typecheck, successful build

- [ ] **Commit**

```bash
git add apps/desktop/src/lib/tools.ts apps/desktop/src/lib/run.ts apps/desktop/src/components/OptionsPanel.tsx apps/desktop/src/index.css
git commit -m "feat(desktop): wire up the PDF to Excel tool in the UI"
```

### Step 10: Manual smoke test in the running desktop app

- [ ] **Launch the desktop app in dev mode**, open the PDF to Excel tool, drop in a PDF with at least one real table (a bank statement, an invoice, or a PDF built by the same `reportlab.platypus.Table` approach the tests use), run it, and confirm: the tool appears on Home with the new tint/icon, the job completes without error, the output `.xlsx` opens in a real spreadsheet app (Excel/LibreOffice Calc/Google Sheets) with the expected sheet(s) and cell values.
- [ ] **Confirm the "no tables found" guard surfaces a sane error in the UI** — feed it a PDF with no tables (any plain text document) and confirm the `NO_TABLES_FOUND` error message renders legibly.

---

## Task 2: Web — `"desktop-only"` UI state, `pdf-to-excel` registry entry

**Files:**
- Modify: `apps/web/src/tools/ToolConfig.ts`
- Create: `apps/web/src/components/DesktopOnlyBadge.tsx`
- Modify: `apps/web/src/pages/ToolsIndex.tsx`
- Modify: `apps/web/src/pages/ToolDetail.tsx`
- Create: `apps/web/src/tools/options/PdfToExcelOptions.tsx`
- Modify: `apps/web/src/tools/icons.tsx`
- Modify: `apps/web/src/tools/tint.ts`
- Modify: `apps/web/src/tools/registry.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Produces: `ToolConfig.status: "live" | "preview" | "desktop-only"` (extends the existing type — every other tool's `status` value is unaffected).
- Produces: `DesktopOnlyBadge` component, same call shape as the existing `PreviewBadge` (`apps/web/src/components/PreviewBadge.tsx`) — no props.
- Consumes: `ToolConfig`, `TOOLS`/`getTool` from `apps/web/src/tools/registry.tsx`; `tintColor`/`tintWash` from `apps/web/src/tools/tint.ts`; the existing `Engine`/`EngineInput`/`EngineResult` shapes from `apps/web/src/engines/types.ts`.

### Step 1: `ToolConfig.status` gains `"desktop-only"`; a placeholder engine for it

- [ ] **Modify `apps/web/src/tools/ToolConfig.ts`** — change the `status` field:

```typescript
  status: "live" | "preview" | "desktop-only";
```

- [ ] **Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean — widening a union type doesn't break any existing `status: "live"`/`status: "preview"` literal in `registry.tsx`, since those values are still valid members of the new, larger union.

- [ ] **Commit**

```bash
git add apps/web/src/tools/ToolConfig.ts
git commit -m "feat(web): add a desktop-only ToolConfig.status value"
```

### Step 2: `DesktopOnlyBadge` component

- [ ] **Create `apps/web/src/components/DesktopOnlyBadge.tsx`**, modeled on the existing `PreviewBadge.tsx` but visually distinct (muted/inert, not the preview badge's accent styling — this tool doesn't run at all here, unlike a preview tool that runs at reduced quality):

```tsx
export function DesktopOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-muted">
      DESKTOP ONLY
    </span>
  );
}
```

- [ ] **Commit**

```bash
git add apps/web/src/components/DesktopOnlyBadge.tsx
git commit -m "feat(web): add DesktopOnlyBadge component"
```

### Step 3: `ToolsIndex.tsx` — desktop-only card treatment

- [ ] **Modify `apps/web/src/pages/ToolsIndex.tsx`** — add the import:

```tsx
import { DesktopOnlyBadge } from "@/components/DesktopOnlyBadge";
```

Change the card's `<Link>` target and badge/label logic (replacing the existing `to={`/tools/${tool.slug}`}` and the badge/label block):

```tsx
              <Link
                key={tool.slug}
                to={tool.status === "desktop-only" ? "/download" : `/tools/${tool.slug}`}
                className="rounded-[14px] border border-border p-5 transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
                style={{ background: tintWash(tool.tint, 5) }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = tintColor(tool.tint);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "";
                }}
              >
                <div className="flex items-start justify-between">
                  <tool.Icon className="size-5.5" />
                  {tool.status === "preview" && <PreviewBadge />}
                  {tool.status === "desktop-only" && <DesktopOnlyBadge />}
                </div>
                <div className="mt-3 text-[15px] font-semibold">{tool.name}</div>
                <div className="mt-1 text-[13px] leading-relaxed text-muted">{tool.description}</div>
                <div className="mt-3 font-mono text-[11px]" style={{ color: tintColor(tool.tint) }}>
                  {tool.status === "desktop-only" ? "Desktop only →" : "Open →"}
                </div>
              </Link>
```

- [ ] **Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

- [ ] **Commit**

```bash
git add apps/web/src/pages/ToolsIndex.tsx
git commit -m "feat(web): desktop-only tools link to Download and show a distinct badge"
```

### Step 4: `ToolDetail.tsx` — guard against direct navigation

- [ ] **Modify `apps/web/src/pages/ToolDetail.tsx`** — add imports:

```tsx
import { Link } from "react-router-dom";
import { DesktopOnlyBadge } from "@/components/DesktopOnlyBadge";
import { tintColor, tintWash } from "@/tools/tint";
```

(replacing the existing `import { tintWash } from "@/tools/tint";` line — `tintColor` is now needed too.)

Add a guard right after the existing `if (!tool) { ... }` block and before the final `return (...)`:

```tsx
  if (tool.status === "desktop-only") {
    return (
      <div>
        <div className="mx-auto flex max-w-6xl items-start gap-3.5 px-8 pt-8">
          <span
            className="grid size-9.5 flex-none place-items-center rounded-[11px] border border-border"
            style={{ background: tintWash(tool.tint, 14) }}
          >
            <tool.Icon className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{tool.name}</h1>
              <DesktopOnlyBadge />
            </div>
            <p className="mt-1 text-sm text-muted">{tool.description}</p>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-8 py-10">
          <p className="max-w-[58ch] text-[14px] leading-relaxed text-muted">
            This tool needs a local table-extraction engine that isn't available in a browser yet — it's desktop-only for now.
          </p>
          <Link to="/download" className="mt-4 inline-block font-mono text-[12px]" style={{ color: tintColor(tool.tint) }}>
            Get the desktop app →
          </Link>
        </div>
      </div>
    );
  }
```

- [ ] **Typecheck and build**

Run: `cd apps/web && npx tsc --noEmit && npm run build`
Expected: clean typecheck, successful build

- [ ] **Commit**

```bash
git add apps/web/src/pages/ToolDetail.tsx
git commit -m "feat(web): guard ToolDetail against direct navigation to a desktop-only tool"
```

### Step 5: Tests for the new UI state

- [ ] **Write tests**, new or extended existing test file — check whether `apps/web/src/pages` already has a test file for `ToolsIndex.tsx`/`ToolDetail.tsx` (search `apps/web/src/pages/*.test.tsx` first); if neither exists, create `apps/web/src/pages/ToolDetail.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ToolDetail } from "./ToolDetail";
import { TOOLS } from "@/tools/registry";

describe("ToolDetail", () => {
  it("renders the desktop-only explanation instead of ToolPage for a desktop-only tool", () => {
    const desktopOnlyTool = TOOLS.find((t) => t.status === "desktop-only");
    if (!desktopOnlyTool) throw new Error("Expected at least one desktop-only tool in TOOLS for this test.");

    render(
      <MemoryRouter initialEntries={[`/tools/${desktopOnlyTool.slug}`]}>
        <Routes>
          <Route path="/tools/:slug" element={<ToolDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("DESKTOP ONLY")).toBeInTheDocument();
    expect(screen.getByText(/Get the desktop app/i)).toBeInTheDocument();
    expect(screen.queryByText(/drop a file/i)).not.toBeInTheDocument();
  });
});
```

Check `ToolPage`'s actual drop-zone copy text before finalizing the last assertion (`queryByText(/drop a file/i)`) — replace it with whatever `ToolPage.tsx`'s real placeholder/instruction text is, so the negative assertion is meaningful (proving `ToolPage` genuinely did not render) rather than trivially true.

- [ ] **Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/ToolDetail.test.tsx`
Expected: FAIL — `TOOLS.find((t) => t.status === "desktop-only")` returns `undefined` until Task 1... no, wait: this test only depends on Task 2's own registry entry (Step 6 below adds it) — if this step runs before Step 6, the test fails with the explicit `throw new Error(...)` message, which is the expected, correctly-diagnosed failure at this point in the TDD sequence.

- [ ] **Commit** (test-only commit, implementation follows in Step 6)

```bash
git add apps/web/src/pages/ToolDetail.test.tsx
git commit -m "test(web): desktop-only ToolDetail rendering (pending registry entry)"
```

### Step 6: `pdf-to-excel` registry entry

- [ ] **Extend `TintKey` in `apps/web/src/tools/tint.ts`**:

```typescript
export type TintKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m";
```

- [ ] **Add `--tint-m` / `--tint-m-btn` to `apps/web/src/index.css`**, in both light and dark blocks, using the *same hue* as desktop's `--tint-m` (190) — copy the exact syntax pattern of the existing `--tint-l`/`--tint-l-btn` lines:

Light block, immediately after `--tint-l-btn`:
```css
  --tint-m: oklch(0.575 0.145 190);
```
(placed with the other `--tint-*` lines) and
```css
  --tint-m-btn: oklch(0.5 0.145 190);
```

Dark block:
```css
  --tint-m: oklch(0.8 0.125 190);
```
and
```css
  --tint-m-btn: var(--tint-m);
```

- [ ] **Add `PdfToExcelIcon` to `apps/web/src/tools/icons.tsx`**, after `OcrIcon` — a table/grid motif:

```tsx
export function PdfToExcelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-m)" strokeWidth="1.5" {...props}>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.2" />
      <path d="M2.5 7.5h13M2.5 12h13M7 2.5v13M12 2.5v13" strokeOpacity="0.5" />
    </svg>
  );
}
```

- [ ] **Create `apps/web/src/tools/options/PdfToExcelOptions.tsx`** — a never-rendered placeholder, matching `RedactOptions.tsx`'s established pattern (this tool is `desktop-only`, so `ToolDetail` never reaches `ToolPage`/this panel for it — it only exists to satisfy `ToolConfig`'s shape):

```tsx
// pdf-to-excel is desktop-only (status: "desktop-only") -- ToolDetail never
// reaches ToolPage/this panel for it, so this only exists to satisfy
// ToolConfig's shape.
export function PdfToExcelOptions() {
  return null;
}
```

- [ ] **Register the tool in `apps/web/src/tools/registry.tsx`** — add imports:

```tsx
import { PdfToExcelOptions } from "./options/PdfToExcelOptions";
import type { Engine } from "@/engines/types";
```

and add `PdfToExcelIcon` to the existing icons import block. Add a placeholder engine (near the top of the file, or right above the `TOOLS` array) — required since `ToolConfig.engine` stays a required field for every tool, and this is defense-in-depth behind the `ToolDetail` guard from Task 2 Step 4, not the primary mechanism:

```tsx
const desktopOnlyEngine: Engine = async () => {
  throw new Error("This tool is only available in the desktop app.");
};
```

Then add a new `TOOLS` entry, after `ocr`:

```tsx
  { slug: "pdf-to-excel", name: "PDF to Excel", description: "Extract tables from a PDF into a real, editable spreadsheet.", category: "pdf", Icon: PdfToExcelIcon, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: PdfToExcelOptions, engine: desktopOnlyEngine, status: "desktop-only", tint: "m" },
```

Note: no `Workspace` field — this tool never reaches the generic `ToolPage` flow either, since `ToolDetail`'s Step 4 guard intercepts it before that point.

- [ ] **Run Task 2 Step 5's test to verify it now passes**

Run: `cd apps/web && npx vitest run src/pages/ToolDetail.test.tsx`
Expected: PASS

- [ ] **Typecheck and build**

Run: `cd apps/web && npx tsc --noEmit && npm run build`
Expected: clean typecheck, successful build

- [ ] **Full test suite**

Run: `cd apps/web && npx vitest run`
Expected: all PASS (aside from any pre-existing, already-documented flaky/unrelated failures — re-run any failing file in isolation before treating it as a real regression, per this repo's established practice)

- [ ] **Commit**

```bash
git add apps/web/src/tools/tint.ts apps/web/src/index.css apps/web/src/tools/icons.tsx apps/web/src/tools/options/PdfToExcelOptions.tsx apps/web/src/tools/registry.tsx
git commit -m "feat(web): register the desktop-only PDF to Excel tool"
```

### Step 7: Manual smoke test in the browser

- [ ] **Run the dev server**, open `/tools`, confirm the new PDF to Excel card shows the "DESKTOP ONLY" badge, "Desktop only →" label, and clicking it navigates to `/download` (not a broken tool workspace).
- [ ] **Directly navigate to `/tools/pdf-to-excel`** (typed URL, not via the card) and confirm the explanatory panel renders — icon, name, badge, explanation text, "Get the desktop app →" link to `/download` — not the generic drop-zone flow.
- [ ] **Confirm every other existing tool's card/detail page is unaffected** — spot-check one `"live"` tool and one `"preview"` tool still work exactly as before.

---

## Task 3: Website copy sync (twelve → thirteen tools)

Small and mechanical — done directly, not delegated to a subagent, matching how the equivalent step was handled for every prior feature.

- [ ] Update `README.md`: bump "twelve" → "thirteen" wherever the tool count is mentioned, and add a "PDF to Excel" row to the tools table, noting "Desktop only" the way the platform-comparison table already flags other capability differences.
- [ ] Update `apps/desktop/src/routes/Home.tsx` hero copy: "TWELVE" → "THIRTEEN".
- [ ] Update `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/ToolsIndex.tsx`, `apps/web/src/pages/Download.tsx`: "twelve"/"TWELVE" → "thirteen"/"THIRTEEN" wherever present.
- [ ] Update `apps/web/src/components/layout/SiteFooter.tsx`: "Twelve PDF and image tools" → "Thirteen PDF and image tools".
- [ ] Grep the whole repo for the literal string "twelve" (case-insensitive) once more after the above, to catch anything missed.
- [ ] Commit: `git commit -m "docs: update tool count copy for PDF to Excel (twelve -> thirteen)"`

---

## Task 4: Final whole-branch review

Sequential, after Tasks 1-3 are merged into the feature branch.

- [ ] **Generate the review package**: `scripts/review-package MERGE_BASE HEAD` (from the `subagent-driven-development` skill's directory; `MERGE_BASE` = `git merge-base main HEAD`).
- [ ] **Dispatch the final whole-branch code reviewer** (most capable available model, per `subagent-driven-development`'s model-selection guidance) using `requesting-code-review`'s `code-reviewer.md` template, pointing it at the review package, this plan, and the design spec (`docs/superpowers/specs/2026-09-19-pdf-to-excel-design.md`). Give it the Global Constraints block verbatim as its attention lens. Ask it specifically to verify: the `NO_TABLES_FOUND` guard genuinely runs after a full pass over every page (not short-circuiting on the first empty page); the desktop-only web UI state has no path that reaches a broken/non-functional `ToolPage` for this tool (both the card-click path and direct-URL-navigation path); no stray reference to a nonexistent web `pdfToExcelEngine` was left anywhere.
- [ ] **Address Critical/Important findings** with one consolidated fix subagent (not one per finding, per this repo's established practice), re-review, repeat until "Ready to merge: Yes".
- [ ] **Use `superpowers:finishing-a-development-branch`** once clean — push, open the PR, wait for required CI, squash-merge, sync local `main`, prune the branch, per the user's standing workflow preference.
