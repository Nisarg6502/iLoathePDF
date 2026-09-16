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


def _make_form_xobject_text_pdf(tmp_path: Path) -> Path:
    """A one-page PDF whose text is drawn inside a Form XObject (via
    beginForm/doForm), not directly in the page's own content stream --
    `pikepdf.parse_content_stream(page)` alone would miss this."""
    from reportlab.pdfgen import canvas as pdfcanvas

    out = tmp_path / "has_text_in_xobject.pdf"
    c = pdfcanvas.Canvas(str(out), pagesize=(595, 842))
    c.beginForm("textform", 0, 0, 595, 842)
    c.setFont("Helvetica", 12)
    c.drawString(72, 700, "Text hidden inside a Form XObject.")
    c.endForm()
    c.doForm("textform")
    c.save()
    return out


def test_ocr_rejects_a_pdf_with_text_only_inside_a_form_xobject(tmp_path, out_dir):
    src = _make_form_xobject_text_pdf(tmp_path)
    with pytest.raises(OpError) as exc:
        pdf_ocr.run({"input": str(src), "output": str(out_dir / "o.pdf")}, noop_progress)
    assert exc.value.code == "ALREADY_HAS_TEXT"
    assert not (out_dir / "o.pdf").exists()


def _make_cyclic_xobject_pdf(tmp_path: Path) -> Path:
    """A one-page PDF with two Form XObjects whose /Resources/XObject
    entries reference each other, forming a cycle -- built directly with
    pikepdf since reportlab has no way to produce this. Legal per PDF's
    indirect-object model, not something `_page_has_text`'s recursion
    should be able to loop forever on."""
    pdf = pikepdf.Pdf.new()
    page = pdf.add_blank_page(page_size=(200, 200))

    xobj1 = pdf.make_indirect(pikepdf.Stream(pdf, b"q Q"))
    xobj1.Type = pikepdf.Name.XObject
    xobj1.Subtype = pikepdf.Name.Form
    xobj1.BBox = pikepdf.Array([0, 0, 200, 200])

    xobj2 = pdf.make_indirect(pikepdf.Stream(pdf, b"q Q"))
    xobj2.Type = pikepdf.Name.XObject
    xobj2.Subtype = pikepdf.Name.Form
    xobj2.BBox = pikepdf.Array([0, 0, 200, 200])

    xobj1.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Fx2=xobj2))
    xobj2.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Fx1=xobj1))  # cycle back to xobj1

    page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Fx1=xobj1))
    page.Contents = pdf.make_indirect(pikepdf.Stream(pdf, b"q /Fx1 Do Q"))

    out = tmp_path / "cyclic_xobjects.pdf"
    pdf.save(str(out))
    return out


def test_page_has_text_survives_a_cyclic_xobject_graph(tmp_path):
    src = _make_cyclic_xobject_pdf(tmp_path)
    with pikepdf.open(str(src)) as pdf:
        # Must return (no text anywhere in the cycle) rather than raise
        # RecursionError -- that's the whole point of this test.
        assert pdf_ocr._page_has_text(pdf.pages[0]) is False


@needs_gs
@needs_tesseract
def test_ocr_page_produces_a_searchable_single_page_pdf(make_pdf, tmp_path):
    src = make_pdf("a", pages=1)
    png = tmp_path / "page-1.png"
    pdf_ocr._rasterize_page(src, 1, png, noop_progress, 0, "page 1")
    assert png.exists() and png.stat().st_size > 0

    output_base = tmp_path / "page-1"
    pdf_ocr._ocr_page(png, output_base, noop_progress, 0, "page 1")
    out_pdf = output_base.with_suffix(".pdf")
    assert out_pdf.exists()
    with pikepdf.open(str(out_pdf)) as ocred:
        assert len(ocred.pages) == 1
        assert pdf_ocr._page_has_text(ocred.pages[0])


@needs_gs
@needs_tesseract
def test_ocr_round_trip_produces_selectable_text(make_pdf, out_dir):
    src = make_pdf("scan", pages=1)  # image-only page, no text guard trip
    dest = out_dir / "searchable.pdf"

    result = pdf_ocr.run({"input": str(src), "output": str(dest)}, noop_progress)

    assert result["pages"] == 1
    assert result["output"] == str(dest)
    assert result["bytes"] > 0
    with pikepdf.open(str(dest)) as after:
        assert len(after.pages) == 1
        assert pdf_ocr._page_has_text(after.pages[0])


@needs_gs
@needs_tesseract
def test_ocr_preserves_page_count_on_multi_page_input(make_pdf, out_dir):
    src = make_pdf("scan", pages=3)
    dest = out_dir / "searchable.pdf"

    result = pdf_ocr.run({"input": str(src), "output": str(dest)}, noop_progress)

    assert result["pages"] == 3
    with pikepdf.open(str(dest)) as after:
        assert len(after.pages) == 3
        for page in after.pages:
            assert pdf_ocr._page_has_text(page)


@needs_gs
@needs_tesseract
def test_ocr_progress_reaches_100(make_pdf, out_dir):
    src = make_pdf("scan", pages=1)
    dest = out_dir / "searchable.pdf"
    calls: list[int] = []

    pdf_ocr.run({"input": str(src), "output": str(dest)}, lambda pct, note="": calls.append(pct))
    assert calls[-1] == 100


def test_ocr_without_ghostscript_fails_fast(make_pdf, out_dir, monkeypatch):
    def _raise():
        raise OpError("GHOSTSCRIPT_MISSING", "Ghostscript was not found.")

    monkeypatch.setattr("ops.pdf_ocr.find_ghostscript", _raise)
    src = make_pdf("a", pages=1)
    dest = out_dir / "o.pdf"

    with pytest.raises(OpError) as exc:
        pdf_ocr.run({"input": str(src), "output": str(dest)}, noop_progress)
    assert exc.value.code == "GHOSTSCRIPT_MISSING"
    assert not dest.exists()


def test_ocr_without_tesseract_fails_fast(make_pdf, out_dir, monkeypatch):
    def _raise():
        raise OpError("TESSERACT_MISSING", "Tesseract was not found.")

    monkeypatch.setattr("ops.pdf_ocr.find_tesseract", _raise)
    src = make_pdf("a", pages=1)
    dest = out_dir / "o.pdf"

    with pytest.raises(OpError) as exc:
        pdf_ocr.run({"input": str(src), "output": str(dest)}, noop_progress)
    assert exc.value.code == "TESSERACT_MISSING"
    assert not dest.exists()


def test_ocr_propagates_encrypted_and_corrupt(encrypted_pdf, corrupt_pdf, out_dir):
    for src, code in ((encrypted_pdf, "ENCRYPTED_PDF"), (corrupt_pdf, "CORRUPT_PDF")):
        with pytest.raises(OpError) as exc:
            pdf_ocr.run({"input": str(src), "output": str(out_dir / "o.pdf")}, noop_progress)
        assert exc.value.code == code
    assert not (out_dir / "o.pdf").exists()


def test_ocr_missing_input_file(out_dir, tmp_path):
    with pytest.raises(OpError) as exc:
        pdf_ocr.run({"input": str(tmp_path / "ghost.pdf"), "output": str(out_dir / "o.pdf")}, noop_progress)
    assert exc.value.code == "FILE_NOT_FOUND"
