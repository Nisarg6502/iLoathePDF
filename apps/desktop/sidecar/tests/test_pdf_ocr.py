"""Tests for `pdf.ocr` -- OCR a scanned PDF into a searchable one."""
from __future__ import annotations

from pathlib import Path

import pikepdf
import pytest

from ops import pdf_ocr
from ops._common import OpError, has_ghostscript, has_tesseract, noop_progress

needs_gs = pytest.mark.skipif(not has_ghostscript(), reason="ghostscript not installed")
needs_tesseract = pytest.mark.skipif(not has_tesseract(), reason="tesseract not installed")


def _make_text_pdf(tmp_path: Path) -> Path:
    """A one-page PDF with real, vector, extractable text -- not a scan."""
    from reportlab.pdfgen import canvas as pdfcanvas

    out = tmp_path / "has_text.pdf"
    c = pdfcanvas.Canvas(str(out), pagesize=(595, 842))
    c.drawString(72, 700, "This PDF already has real text.")
    c.save()
    return out


def test_ocr_rejects_a_pdf_that_already_has_text(tmp_path, out_dir):
    src = _make_text_pdf(tmp_path)
    with pytest.raises(OpError) as exc:
        pdf_ocr.run({"input": str(src), "output": str(out_dir / "o.pdf")}, noop_progress)
    assert exc.value.code == "ALREADY_HAS_TEXT"
    assert not (out_dir / "o.pdf").exists()


def test_ocr_accepts_an_image_only_pdf_past_the_text_guard(make_pdf, out_dir, monkeypatch):
    # make_pdf's pages are PIL-rasterised images with no PDF text operators
    # (see conftest.py) -- this only proves the guard doesn't false-positive
    # on them; it doesn't require Ghostscript/Tesseract to actually run, so
    # the rest of the pipeline is stubbed out.
    monkeypatch.setattr("ops.pdf_ocr._ocr_page", lambda *a, **k: None)
    monkeypatch.setattr(
        "ops.pdf_ocr.pikepdf.Pdf.new",
        lambda: pikepdf.open(str(make_pdf("stub", pages=1))),
    )
    src = make_pdf("a", pages=1)
    # This will still fail past the guard (no real OCR happened), which is
    # fine -- this test only asserts ALREADY_HAS_TEXT was NOT raised.
    try:
        pdf_ocr.run({"input": str(src), "output": str(out_dir / "o.pdf")}, noop_progress)
    except OpError as exc:
        assert exc.code != "ALREADY_HAS_TEXT"
