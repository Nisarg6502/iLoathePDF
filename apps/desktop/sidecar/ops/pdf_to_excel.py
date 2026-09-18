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


def _normalize_cell(cell: str | None) -> str:
    """pdfplumber reports an unreadable/blank cell as None; never let a raw
    None reach `ws.append()` -- openpyxl itself can't tell a written ""
    apart from a never-written cell after a save/reload round-trip (both
    come back None), so this guard is only checkable pre-save. See
    test_to_excel_normalize_cell_never_returns_none in
    test_pdf_to_excel.py."""
    return "" if cell is None else cell


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
                    ws.append([_normalize_cell(cell) for cell in row])
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
