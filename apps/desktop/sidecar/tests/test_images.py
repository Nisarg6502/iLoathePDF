"""Tests for the image ops: img.convert, img.to_pdf, pdf.to_img."""
from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from ops import img_convert, img_to_pdf, pdf_to_img
from ops._common import OpError, has_ghostscript, noop_progress


def _rgba_png(path, size=(40, 30)):
    Image.new("RGBA", size, (0, 0, 0, 0)).save(path, "PNG")
    return path


def _jpeg_with_exif(path, size=(64, 48), orientation=1, make="iLoathePDF"):
    img = Image.new("RGB", size, (30, 90, 160))
    exif = img.getexif()
    exif[0x0112] = orientation
    exif[0x010F] = make
    img.save(path, "JPEG", exif=exif.tobytes())
    return path


# --------------------------------------------------------------------------
# img.convert
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "src_ext,target",
    [("png", "jpg"), ("jpg", "png"), ("png", "webp"), ("heic", "jpg")],
)
def test_convert_round_trips(make_image, out_dir, src_ext, target):
    src = make_image("photo", src_ext, size=(64, 48))
    result = img_convert.run(
        {"inputs": [str(src)], "output_dir": str(out_dir), "format": target},
        noop_progress,
    )
    assert result["count"] == 1
    out = result["outputs"][0]
    assert out["path"].endswith(f"photo.{target}")
    assert (out["width"], out["height"]) == (64, 48)
    assert out["bytes"] > 0
    with Image.open(out["path"]) as img:
        assert img.size == (64, 48)


def test_convert_applies_exif_orientation(tmp_path, out_dir):
    # Orientation 6 means "rotate 90 CW to display", so a 64x48 sensor image
    # must land as 48x64.
    src = _jpeg_with_exif(tmp_path / "sideways.jpg", size=(64, 48), orientation=6)
    result = img_convert.run(
        {"inputs": [str(src)], "output_dir": str(out_dir), "format": "png"},
        noop_progress,
    )
    out = result["outputs"][0]
    assert (out["width"], out["height"]) == (48, 64)
    with Image.open(out["path"]) as img:
        assert img.size == (48, 64)


def test_convert_composites_alpha_over_background(tmp_path, out_dir):
    src = _rgba_png(tmp_path / "clear.png")
    result = img_convert.run(
        {
            "inputs": [str(src)],
            "output_dir": str(out_dir),
            "format": "jpg",
            "background": "#FF0000",
            "quality": 95,
        },
        noop_progress,
    )
    with Image.open(result["outputs"][0]["path"]) as img:
        r, g, b = img.convert("RGB").getpixel((5, 5))
    assert r > 200 and g < 60 and b < 60  # red background, not black


def test_convert_strips_metadata_by_default(tmp_path, out_dir):
    src = _jpeg_with_exif(tmp_path / "gps.jpg")
    result = img_convert.run(
        {"inputs": [str(src)], "output_dir": str(out_dir), "format": "jpg"},
        noop_progress,
    )
    out_path = Path(result["outputs"][0]["path"])
    with Image.open(out_path) as img:
        assert dict(img.getexif()) == {}
    # Nothing from the source EXIF may survive anywhere in the file.
    assert b"iLoathePDF" not in out_path.read_bytes()


def test_convert_keeps_metadata_when_asked(tmp_path, out_dir):
    src = _jpeg_with_exif(tmp_path / "kept.jpg", orientation=6)
    result = img_convert.run(
        {
            "inputs": [str(src)],
            "output_dir": str(out_dir),
            "format": "jpg",
            "strip_metadata": False,
        },
        noop_progress,
    )
    out = result["outputs"][0]
    with Image.open(out["path"]) as img:
        exif = img.getexif()
        assert exif.get(0x010F) == "iLoathePDF"
        # Orientation is baked into the pixels, so the tag must read "upright"
        # or the viewer would rotate it a second time.
        assert exif.get(0x0112) == 1
    assert (out["width"], out["height"]) == (48, 64)


def test_convert_resize_max_never_upscales(make_image, out_dir):
    src = make_image("small", "png", size=(64, 48))
    result = img_convert.run(
        {
            "inputs": [str(src)],
            "output_dir": str(out_dir),
            "format": "png",
            "resize": {"mode": "max", "max_px": 1000},
        },
        noop_progress,
    )
    out = result["outputs"][0]
    assert (out["width"], out["height"]) == (64, 48)


def test_convert_resize_max_shrinks_longest_edge(make_image, out_dir):
    src = make_image("big", "png", size=(64, 48))
    result = img_convert.run(
        {
            "inputs": [str(src)],
            "output_dir": str(out_dir),
            "format": "png",
            "resize": {"mode": "max", "max_px": 32},
        },
        noop_progress,
    )
    out = result["outputs"][0]
    assert (out["width"], out["height"]) == (32, 24)


def test_convert_resize_percent(make_image, out_dir):
    src = make_image("pct", "png", size=(64, 48))
    result = img_convert.run(
        {
            "inputs": [str(src)],
            "output_dir": str(out_dir),
            "format": "png",
            "resize": {"mode": "percent", "percent": 50},
        },
        noop_progress,
    )
    out = result["outputs"][0]
    assert (out["width"], out["height"]) == (32, 24)


def test_convert_reports_progress(make_image, out_dir):
    src = make_image("p", "png")
    seen = []
    img_convert.run(
        {"inputs": [str(src)], "output_dir": str(out_dir), "format": "jpg"},
        lambda pct, note="": seen.append((pct, note)),
    )
    assert seen and seen[-1][0] == 100


def test_convert_missing_input(out_dir, tmp_path):
    with pytest.raises(OpError) as exc:
        img_convert.run(
            {
                "inputs": [str(tmp_path / "nope.png")],
                "output_dir": str(out_dir),
                "format": "jpg",
            },
            noop_progress,
        )
    assert exc.value.code == "FILE_NOT_FOUND"


def test_convert_rejects_unreadable_image(tmp_path, out_dir):
    bad = tmp_path / "bad.png"
    bad.write_bytes(b"not an image at all")
    with pytest.raises(OpError) as exc:
        img_convert.run(
            {"inputs": [str(bad)], "output_dir": str(out_dir), "format": "jpg"},
            noop_progress,
        )
    assert exc.value.code == "UNSUPPORTED_FORMAT"


def test_convert_rejects_bad_format(make_image, out_dir):
    src = make_image("x", "png")
    with pytest.raises(OpError) as exc:
        img_convert.run(
            {"inputs": [str(src)], "output_dir": str(out_dir), "format": "gif"},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"


def test_convert_never_overwrites(make_image, out_dir):
    src = make_image("dup", "png", size=(64, 48))
    params = {"inputs": [str(src)], "output_dir": str(out_dir), "format": "jpg"}
    first = img_convert.run(params, noop_progress)["outputs"][0]["path"]
    second = img_convert.run(params, noop_progress)["outputs"][0]["path"]
    assert first != second


# --------------------------------------------------------------------------
# img.to_pdf
# --------------------------------------------------------------------------

def _page_size(path, index=0):
    import pikepdf

    with pikepdf.open(str(path)) as pdf:
        box = [float(v) for v in pdf.pages[index].mediabox]
    return round(abs(box[2] - box[0]), 1), round(abs(box[3] - box[1]), 1)


def test_to_pdf_page_count_matches_inputs(make_image, tmp_path):
    srcs = [str(make_image(f"i{n}", "jpg", size=(80, 60))) for n in range(3)]
    out = tmp_path / "album.pdf"
    result = img_to_pdf.run({"inputs": srcs, "output": str(out)}, noop_progress)
    assert result["pages"] == 3
    assert result["bytes"] > 0

    import pikepdf

    with pikepdf.open(str(out)) as pdf:
        assert len(pdf.pages) == 3


def test_to_pdf_a4_differs_from_fit(make_image, tmp_path):
    src = str(make_image("one", "jpg", size=(80, 60)))
    fit = tmp_path / "fit.pdf"
    a4 = tmp_path / "a4.pdf"
    img_to_pdf.run({"inputs": [src], "output": str(fit), "page_size": "fit"}, noop_progress)
    img_to_pdf.run(
        {"inputs": [src], "output": str(a4), "page_size": "a4", "orientation": "portrait"},
        noop_progress,
    )
    assert _page_size(fit) != _page_size(a4)
    assert _page_size(a4) == (595.3, 841.9)


def test_to_pdf_letter_landscape(make_image, tmp_path):
    src = str(make_image("l", "jpg", size=(80, 60)))
    out = tmp_path / "letter.pdf"
    img_to_pdf.run(
        {
            "inputs": [src],
            "output": str(out),
            "page_size": "letter",
            "orientation": "landscape",
        },
        noop_progress,
    )
    width, height = _page_size(out)
    assert width > height


def test_to_pdf_fit_margin_enlarges_page(make_image, tmp_path):
    src = str(make_image("m", "jpg", size=(80, 60)))
    plain = tmp_path / "plain.pdf"
    margined = tmp_path / "margined.pdf"
    img_to_pdf.run({"inputs": [src], "output": str(plain)}, noop_progress)
    img_to_pdf.run({"inputs": [src], "output": str(margined), "margin_mm": 10}, noop_progress)
    bare_w, bare_h = _page_size(plain)
    wide_w, wide_h = _page_size(margined)
    assert wide_w > bare_w and wide_h > bare_h


def test_to_pdf_accepts_heic(make_image, tmp_path):
    src = str(make_image("phone", "heic", size=(80, 60)))
    out = tmp_path / "heic.pdf"
    result = img_to_pdf.run({"inputs": [src], "output": str(out)}, noop_progress)
    assert result["pages"] == 1

    import pikepdf

    with pikepdf.open(str(out)) as pdf:
        assert len(pdf.pages) == 1


def test_to_pdf_accepts_alpha_png(tmp_path):
    src = _rgba_png(tmp_path / "alpha.png")
    out = tmp_path / "alpha.pdf"
    result = img_to_pdf.run({"inputs": [str(src)], "output": str(out)}, noop_progress)
    assert result["pages"] == 1


def test_to_pdf_reports_progress(make_image, tmp_path):
    src = str(make_image("pg", "jpg"))
    seen = []
    img_to_pdf.run(
        {"inputs": [src], "output": str(tmp_path / "p.pdf")},
        lambda pct, note="": seen.append(pct),
    )
    assert seen and seen[-1] == 100


def test_to_pdf_missing_input(tmp_path):
    with pytest.raises(OpError) as exc:
        img_to_pdf.run(
            {"inputs": [str(tmp_path / "gone.jpg")], "output": str(tmp_path / "o.pdf")},
            noop_progress,
        )
    assert exc.value.code == "FILE_NOT_FOUND"


def test_to_pdf_rejects_bad_page_size(make_image, tmp_path):
    src = str(make_image("bp", "jpg"))
    with pytest.raises(OpError) as exc:
        img_to_pdf.run(
            {"inputs": [src], "output": str(tmp_path / "o.pdf"), "page_size": "a3"},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"


def test_to_pdf_leaves_no_output_on_failure(tmp_path):
    bad = tmp_path / "bad.jpg"
    bad.write_bytes(b"still not an image")
    out = tmp_path / "never.pdf"
    with pytest.raises(OpError) as exc:
        img_to_pdf.run({"inputs": [str(bad)], "output": str(out)}, noop_progress)
    assert exc.value.code == "UNSUPPORTED_FORMAT"
    assert not out.exists()


# --------------------------------------------------------------------------
# pdf.to_img
# --------------------------------------------------------------------------

@pytest.mark.skipif(has_ghostscript(), reason="Ghostscript is installed")
def test_to_img_without_ghostscript(make_pdf, out_dir):
    src = make_pdf("doc", pages=2)
    with pytest.raises(OpError) as exc:
        pdf_to_img.run(
            {"input": str(src), "output_dir": str(out_dir), "format": "png"},
            noop_progress,
        )
    assert exc.value.code == "GHOSTSCRIPT_MISSING"


def test_to_img_missing_input(out_dir, tmp_path):
    with pytest.raises(OpError) as exc:
        pdf_to_img.run(
            {"input": str(tmp_path / "nope.pdf"), "output_dir": str(out_dir)},
            noop_progress,
        )
    assert exc.value.code == "FILE_NOT_FOUND"


@pytest.mark.skipif(not has_ghostscript(), reason="Ghostscript not installed")
def test_to_img_renders_every_page(make_pdf, out_dir):
    src = make_pdf("doc", pages=3)
    result = pdf_to_img.run(
        {"input": str(src), "output_dir": str(out_dir), "format": "png", "dpi": 72},
        noop_progress,
    )
    assert result["count"] == 3
    for entry in result["outputs"]:
        assert entry["bytes"] > 0
        with Image.open(entry["path"]) as img:
            assert img.size[0] > 0
    assert [p.name for p in sorted(out_dir.iterdir())] == [
        "doc-001.png",
        "doc-002.png",
        "doc-003.png",
    ]


@pytest.mark.skipif(not has_ghostscript(), reason="Ghostscript not installed")
def test_to_img_honours_page_spec_and_base_name(make_pdf, out_dir):
    src = make_pdf("doc", pages=4)
    result = pdf_to_img.run(
        {
            "input": str(src),
            "output_dir": str(out_dir),
            "format": "jpg",
            "dpi": 72,
            "pages": "2,4",
            "base_name": "slice",
        },
        noop_progress,
    )
    assert result["count"] == 2
    assert [Path(e["path"]).name for e in result["outputs"]] == [
        "slice-002.jpg",
        "slice-004.jpg",
    ]


@pytest.mark.skipif(not has_ghostscript(), reason="Ghostscript not installed")
def test_to_img_dpi_changes_pixel_size(make_pdf, out_dir):
    src = make_pdf("doc", pages=1)
    low = pdf_to_img.run(
        {"input": str(src), "output_dir": str(out_dir), "dpi": 72, "base_name": "low"},
        noop_progress,
    )
    high = pdf_to_img.run(
        {"input": str(src), "output_dir": str(out_dir), "dpi": 144, "base_name": "high"},
        noop_progress,
    )
    with Image.open(low["outputs"][0]["path"]) as a, Image.open(high["outputs"][0]["path"]) as b:
        assert b.size[0] > a.size[0]


@pytest.mark.skipif(not has_ghostscript(), reason="Ghostscript not installed")
def test_to_img_reports_progress(make_pdf, out_dir):
    src = make_pdf("doc", pages=2)
    seen = []
    pdf_to_img.run(
        {"input": str(src), "output_dir": str(out_dir), "dpi": 72},
        lambda pct, note="": seen.append(pct),
    )
    assert seen and seen[-1] == 100


def test_to_img_rejects_bad_dpi(make_pdf, out_dir):
    src = make_pdf("doc", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_to_img.run(
            {"input": str(src), "output_dir": str(out_dir), "dpi": 0},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"


def test_to_img_rejects_bad_format(make_pdf, out_dir):
    src = make_pdf("doc", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_to_img.run(
            {"input": str(src), "output_dir": str(out_dir), "format": "tiff"},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"


@pytest.mark.skipif(not has_ghostscript(), reason="Ghostscript not installed")
def test_to_img_out_of_range_page(make_pdf, out_dir):
    src = make_pdf("doc", pages=2)
    with pytest.raises(OpError) as exc:
        pdf_to_img.run(
            {"input": str(src), "output_dir": str(out_dir), "pages": "5"},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"
