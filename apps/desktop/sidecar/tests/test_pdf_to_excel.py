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
    from reportlab.platypus import PageBreak, Paragraph, Spacer
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
        for table_index, table_data in enumerate(tables):
            if table_index > 0:
                story.append(Spacer(1, 24))
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


def test_to_excel_normalize_cell_never_returns_none():
    """The write-time guard itself, tested directly and pre-save.

    openpyxl==3.1.5 cannot tell a cell written as "" apart from a cell that
    was never written at all -- both come back None after a save()/
    load_workbook() round-trip (confirmed by inspecting the raw sheet XML:
    an empty-string cell serializes as `<c t="inlineStr"></c>` with no
    `<is><t>` child, identical to an omitted cell on reload). That means a
    round-tripped assertion can't distinguish "the guard ran" from "the
    guard was deleted" -- it would pass either way. Testing
    `_normalize_cell` directly, before any openpyxl involvement, is the
    only way this test can actually fail if the None -> "" normalization
    is ever removed from pdf_to_excel.py.
    """
    assert pdf_to_excel._normalize_cell(None) == ""
    assert pdf_to_excel._normalize_cell("") == ""
    assert pdf_to_excel._normalize_cell("Alice") == "Alice"


def test_to_excel_writes_none_cells_as_empty_string(tmp_path, out_dir):
    src = tmp_path / "ragged.pdf"
    # A row with a genuinely empty cell -- reportlab renders an empty string
    # cell as blank, which pdfplumber can report back as None.
    table = [["Name", "Note"], ["Alice", ""]]
    _make_table_pdf(src, [[table]])
    dest = out_dir / "o.xlsx"

    pdf_to_excel.run({"input": str(src), "output": str(dest)}, noop_progress)

    # Real cell content must survive the full run, end to end. The blank
    # cell's own round-tripped value isn't asserted here -- see
    # test_to_excel_normalize_cell_never_returns_none for the guard itself.
    wb = openpyxl.load_workbook(str(dest))
    rows = list(wb["Page 1"].iter_rows(values_only=True))
    assert rows[0] == ("Name", "Note")
    assert rows[1][0] == "Alice"


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
