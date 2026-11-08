"""Tests for scan.to_pdf (cleanup of photographed pages)."""
from __future__ import annotations

import pikepdf
import pytest
from PIL import Image, ImageDraw

from ops import scan_to_pdf
from ops._common import OpError, noop_progress


def shaded_page(path, size=(400, 300)):
    """Paper with a strong left-to-right shadow and a block of black 'text'."""
    img = Image.new("RGB", size)
    px = img.load()
    for x in range(size[0]):
        shade = int(120 + 120 * x / size[0])  # 120 .. 240: the left is much darker paper
        for y in range(size[1]):
            px[x, y] = (shade, shade, shade)
    draw = ImageDraw.Draw(img)
    for row in range(5):
        draw.rectangle([40, 40 + row * 40, 360, 52 + row * 40], fill=(10, 10, 10))
    img.save(path)
    return path


def page_count(path) -> int:
    with pikepdf.open(str(path)) as pdf:
        return len(pdf.pages)


def test_black_and_white_removes_the_shadow_and_keeps_the_ink(tmp_path):
    src = shaded_page(tmp_path / "p.png")
    with Image.open(src) as img:
        out = scan_to_pdf.to_black_and_white(img.convert("RGB"))
    assert set(out.getdata()) <= {0, 255}
    # Paper on the dark left and the bright right both come out white...
    assert out.getpixel((10, 10)) == 255
    assert out.getpixel((390, 290)) == 255
    # ...and the text is black on both sides of the shadow.
    assert out.getpixel((60, 46)) == 0
    assert out.getpixel((340, 46)) == 0


@pytest.mark.parametrize("mode", ["color", "enhanced", "bw"])
def test_each_mode_makes_a_page_per_image(tmp_path, out_dir, mode):
    a = shaded_page(tmp_path / "a.png")
    b = shaded_page(tmp_path / "b.png", size=(300, 400))
    dest = out_dir / f"{mode}.pdf"
    r = scan_to_pdf.run({"inputs": [str(a), str(b)], "output": str(dest), "mode": mode}, noop_progress)
    assert r["pages"] == 2
    assert page_count(dest) == 2


def test_enhanced_stretches_contrast(tmp_path):
    flat = tmp_path / "flat.png"
    Image.new("RGB", (60, 60), (150, 150, 150)).save(flat)
    img = Image.new("RGB", (60, 60), (150, 150, 150))
    ImageDraw.Draw(img).rectangle([0, 0, 30, 60], fill=(100, 100, 100))
    img.save(flat)
    cleaned = scan_to_pdf._clean(flat, tmp_path / "x", "enhanced")
    with Image.open(cleaned) as out:
        lo, hi = out.convert("L").getextrema()
    assert lo < 20 and hi > 235  # was 100..150


def test_rejects_unknown_mode_and_unreadable_images(tmp_path, out_dir):
    src = shaded_page(tmp_path / "a.png")
    with pytest.raises(OpError) as exc:
        scan_to_pdf.run({"inputs": [str(src)], "output": str(out_dir / "o.pdf"), "mode": "sepia"}, noop_progress)
    assert exc.value.code == "BAD_PARAMS"

    bad = tmp_path / "bad.png"
    bad.write_bytes(b"not an image")
    with pytest.raises(OpError) as exc:
        scan_to_pdf.run({"inputs": [str(bad)], "output": str(out_dir / "o.pdf"), "mode": "bw"}, noop_progress)
    assert exc.value.code == "UNSUPPORTED_FORMAT"
