"""Tests for `pdf.ocr` -- OCR a scanned PDF into a searchable one."""
from __future__ import annotations

import subprocess
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


def _make_sharp_scan_pdf(tmp_path: Path, text: str = "HELLO WORLD") -> Path:
    """A one-page, image-only PDF rendered directly at OCR resolution (300
    DPI) with a large, clean font -- unlike the shared `make_pdf` fixture
    (a 72 DPI PIL render whose embedded image then gets upscaled to 300 DPI
    for OCR, which is fairly blurry), this embeds the bitmap at its true
    pixel size tagged with the real 300 DPI it was drawn at, so Ghostscript's
    re-rasterisation at `_OCR_DPI` is a 1:1 copy rather than an upsample.
    Built here rather than in the shared `conftest.py` fixture because the
    strict text-content assertion below needs an OCR-friendly input, while
    every other test in this suite (and the rest of the app) only needs
    *a* page image and shouldn't have its fixture behaviour changed.
    """
    from PIL import Image, ImageDraw, ImageFont

    dpi = pdf_ocr._OCR_DPI
    width, height = 6 * dpi, 2 * dpi
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=200)
    draw.text((100, 100), text, fill="black", font=font)

    out = tmp_path / "sharp_scan.pdf"
    img.save(out, "PDF", resolution=float(dpi))
    return out


def _ocr_txt_mode(image_path: Path, tmp_path: Path) -> str:
    """Run Tesseract's plain `txt` output mode on `image_path`, independent
    of `pdf_ocr._ocr_page`'s `pdf` mode.

    Tesseract's PDF output embeds recognized text in a "GlyphLessFont" whose
    Tj operand strings aren't directly readable ASCII, and pikepdf has no
    text-extraction API in the version this project pins (no
    `Page.extract_text()`) -- so there's no straightforward way to pull
    recognized text back out of the PDF `pdf_ocr.run` produces. Running
    Tesseract's own `txt` mode on the same rasterized page image instead
    proves the OCR engine actually recognized the fixture's text correctly,
    decoupled from how that text ends up encoded inside the PDF.
    """
    exe = pdf_ocr.find_tesseract()
    output_base = tmp_path / "direct-ocr-check"
    argv = [exe, str(image_path), str(output_base)]
    tessdata_dir = pdf_ocr._tessdata_dir_for(exe)
    if tessdata_dir is not None:
        argv += ["--tessdata-dir", str(tessdata_dir)]
    argv += ["-l", "eng", "txt"]
    subprocess.run(argv, check=True, capture_output=True, creationflags=pdf_ocr._no_window_flags())
    return output_base.with_suffix(".txt").read_text(encoding="utf-8")


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
def test_ocr_round_trip_recognizes_the_actual_text(tmp_path, out_dir):
    """The round trip must recover the *actual* recognized text, not merely
    attach *some* text layer -- mirrors the web engine's equivalent test
    (apps/web/src/engines/ocr.test.ts: "adds selectable text that pdf.js can
    extract back out"), which extracts text via pdf.js and asserts it
    contains the known fixture string.

    See `_ocr_txt_mode` for why this checks Tesseract's independent `txt`
    output rather than trying to extract text back out of the produced PDF.
    """
    text = "HELLO WORLD"
    src = _make_sharp_scan_pdf(tmp_path, text)
    dest = out_dir / "searchable.pdf"

    result = pdf_ocr.run({"input": str(src), "output": str(dest)}, noop_progress)
    assert result["pages"] == 1
    with pikepdf.open(str(dest)) as after:
        assert len(after.pages) == 1
        assert pdf_ocr._page_has_text(after.pages[0])

    # Independent check: OCR the same source image directly in txt mode and
    # confirm Tesseract actually read the fixture's text correctly.
    png = tmp_path / "direct-check.png"
    pdf_ocr._rasterize_page(src, 1, png, noop_progress, 0, "check")
    recognized = _ocr_txt_mode(png, tmp_path)
    assert text in recognized.upper()


@needs_gs
@needs_tesseract
def test_ocr_round_trip_preserves_page_dimensions(make_pdf, out_dir):
    """Desktop's OCR page geometry depends on Ghostscript writing a DPI
    marker into the rasterized PNG that Tesseract/Leptonica reads back
    correctly as 300 DPI -- if that silently breaks (a Ghostscript flag
    change, a Tesseract/Leptonica DPI-inference change), every OCR'd page
    could come out the wrong physical size while every other test here
    (which only checks page *count* and presence of a text layer) keeps
    passing. Assert the output page's MediaBox matches the input's.
    """
    src = make_pdf("scan", pages=1)
    dest = out_dir / "searchable.pdf"

    pdf_ocr.run({"input": str(src), "output": str(dest)}, noop_progress)

    with pikepdf.open(str(src)) as before, pikepdf.open(str(dest)) as after:
        before_box = [float(v) for v in before.pages[0].MediaBox]
        after_box = [float(v) for v in after.pages[0].MediaBox]
    assert after_box == pytest.approx(before_box, abs=1.0)


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
