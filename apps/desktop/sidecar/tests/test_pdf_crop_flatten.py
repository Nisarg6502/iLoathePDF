"""Tests for pdf.crop and pdf.flatten."""
from __future__ import annotations

import io

import pikepdf
import pytest

from ops import pdf_crop, pdf_flatten
from ops._common import OpError, noop_progress

M = {"top": 10, "right": 20, "bottom": 30, "left": 0}


def boxes(path):
    with pikepdf.open(str(path)) as pdf:
        return [
            ([float(v) for v in p.MediaBox], [float(v) for v in p.get("/CropBox", p.MediaBox)])
            for p in pdf.pages
        ]


def test_crop_trims_every_page_by_visual_margins(make_pdf, out_dir):
    src = make_pdf("a", pages=2, size=(600, 800))
    dest = out_dir / "o.pdf"
    r = pdf_crop.run({"input": str(src), "output": str(dest), "margins": M}, noop_progress)
    assert r["pages"] == 2 and r["pages_cropped"] == 2
    for media, crop in boxes(dest):
        assert media == crop
        # left 0, bottom 30% of 800 = 240, right 20% of 600 = 120, top 10% = 80
        assert crop == pytest.approx([0, 240, 480, 720])


def test_crop_only_selected_pages(make_pdf, out_dir):
    src = make_pdf("a", pages=3, size=(600, 800))
    dest = out_dir / "o.pdf"
    r = pdf_crop.run({"input": str(src), "output": str(dest), "pages": "2", "margins": M}, noop_progress)
    assert r["pages_cropped"] == 1
    b = boxes(dest)
    assert b[0][1] == pytest.approx([0, 0, 600, 800])
    assert b[1][1] == pytest.approx([0, 240, 480, 720])
    assert b[2][1] == pytest.approx([0, 0, 600, 800])


def test_crop_follows_page_rotation(make_pdf, out_dir):
    src = make_pdf("a", pages=1, size=(600, 800))
    rotated = out_dir / "rot.pdf"
    with pikepdf.open(str(src)) as pdf:
        pdf.pages[0].Rotate = 90
        pdf.save(str(rotated))
    dest = out_dir / "o.pdf"
    # Visually the page is 800 wide x 600 tall. Trimming 10% off the visual top
    # removes the unrotated left edge: x0 moves by 10% of the visual height (600) = 60.
    pdf_crop.run(
        {"input": str(rotated), "output": str(dest),
         "margins": {"top": 10, "right": 0, "bottom": 0, "left": 0}},
        noop_progress,
    )
    assert boxes(dest)[0][1] == pytest.approx([60, 0, 600, 800])


def test_crop_works_from_an_existing_cropbox(make_pdf, out_dir):
    src = make_pdf("a", pages=1, size=(600, 800))
    first = out_dir / "first.pdf"
    second = out_dir / "second.pdf"
    m = {"top": 0, "right": 0, "bottom": 0, "left": 50}
    pdf_crop.run({"input": str(src), "output": str(first), "margins": m}, noop_progress)
    pdf_crop.run({"input": str(first), "output": str(second), "margins": m}, noop_progress)
    assert boxes(second)[0][1] == pytest.approx([450, 0, 600, 800])


@pytest.mark.parametrize(
    "margins",
    [
        {"top": 0, "right": 0, "bottom": 0, "left": 0},
        {"top": 60, "right": 0, "bottom": 40, "left": 0},
        {"top": -1, "right": 0, "bottom": 0, "left": 0},
        {"top": "x", "right": 0, "bottom": 0, "left": 0},
        "nope",
    ],
)
def test_crop_rejects_bad_margins(make_pdf, out_dir, margins):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_crop.run({"input": str(src), "output": str(out_dir / "o.pdf"), "margins": margins}, noop_progress)
    assert exc.value.code == "BAD_PARAMS"


def test_crop_rejects_out_of_range_page(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_crop.run({"input": str(src), "output": str(out_dir / "o.pdf"), "pages": "4", "margins": M}, noop_progress)
    assert exc.value.code == "BAD_PARAMS"


def _form_pdf(tmp_path):
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(300, 300))
    c.drawString(20, 280, "Hello")
    c.acroForm.textfield(name="n", value="Alice", x=20, y=200, width=150, height=24, forceBorder=True)
    c.acroForm.checkbox(name="c", checked=True, x=20, y=150, size=20)
    c.save()
    path = tmp_path / "form.pdf"
    path.write_bytes(buf.getvalue())
    return path


def test_flatten_bakes_form_fields_into_the_page(tmp_path, out_dir):
    import pdfplumber

    src = _form_pdf(tmp_path)
    dest = out_dir / "flat.pdf"
    r = pdf_flatten.run({"input": str(src), "output": str(dest)}, noop_progress)
    assert r["had_form"] is True
    assert r["flattened"] == 2
    with pikepdf.open(str(dest)) as pdf:
        assert "/AcroForm" not in pdf.Root
        assert len(pdf.pages[0].get("/Annots", [])) == 0
    with pdfplumber.open(str(dest)) as plumb:
        text = plumb.pages[0].extract_text()
    assert "Hello" in text and "Alice" in text


def test_flatten_plain_pdf_is_a_harmless_no_op(make_pdf, out_dir):
    src = make_pdf("a", pages=2)
    dest = out_dir / "flat.pdf"
    r = pdf_flatten.run({"input": str(src), "output": str(dest)}, noop_progress)
    assert r["pages"] == 2 and r["flattened"] == 0 and r["had_form"] is False
    with pikepdf.open(str(dest)) as pdf:
        assert len(pdf.pages) == 2
