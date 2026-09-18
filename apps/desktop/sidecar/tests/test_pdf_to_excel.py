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
