"""Tests for pdf.watermark -- watermark, page_numbers and stamp modes."""
from __future__ import annotations

import base64
from pathlib import Path

import pikepdf
import pytest

from ops import pdf_watermark
from ops._common import OpError, noop_progress


def page_count(path) -> int:
    with pikepdf.open(str(path)) as pdf:
        return len(pdf.pages)


def png_b64(make_image) -> str:
    path = make_image("mark", "png", size=(60, 30))
    return base64.b64encode(Path(path).read_bytes()).decode("ascii")


def test_watermark_text_single_on_all_pages(make_pdf, out_dir):
    src = make_pdf("a", pages=3)
    dest = out_dir / "out.pdf"
    result = pdf_watermark.run(
        {
            "input": str(src), "output": str(dest), "mode": "watermark", "pages": "all",
            "watermark": {"content": "text", "text": "CONFIDENTIAL", "font_size": 48,
                          "color": "#888888", "opacity": 0.35, "rotation": 45, "placement": "single"},
        },
        noop_progress,
    )
    assert set(result) == {"output", "bytes", "pages", "pages_affected"}
    assert result["pages"] == 3
    assert result["pages_affected"] == 3
    assert page_count(dest) == 3
    assert dest.stat().st_size > src.stat().st_size


def test_watermark_tiled_grows_more_than_single(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    single_dest = out_dir / "single.pdf"
    tiled_dest = out_dir / "tiled.pdf"
    base_wm = {"content": "text", "text": "X", "font_size": 24, "color": "#888888", "opacity": 0.35, "rotation": 45}

    pdf_watermark.run(
        {"input": str(src), "output": str(single_dest), "mode": "watermark", "pages": "all",
         "watermark": {**base_wm, "placement": "single"}},
        noop_progress,
    )
    pdf_watermark.run(
        {"input": str(src), "output": str(tiled_dest), "mode": "watermark", "pages": "all",
         "watermark": {**base_wm, "placement": "tiled"}},
        noop_progress,
    )
    # 12 repeats of the same draw call produce a larger overlay than 1.
    assert tiled_dest.stat().st_size > single_dest.stat().st_size


def test_watermark_image_content(make_pdf, out_dir, make_image):
    src = make_pdf("a", pages=1)
    dest = out_dir / "out.pdf"
    result = pdf_watermark.run(
        {
            "input": str(src), "output": str(dest), "mode": "watermark", "pages": "all",
            "watermark": {"content": "image", "image_b64": png_b64(make_image), "opacity": 0.5,
                          "rotation": 0, "placement": "single"},
        },
        noop_progress,
    )
    assert result["pages_affected"] == 1


def test_watermark_respects_custom_page_range(make_pdf, out_dir):
    src = make_pdf("a", pages=5)
    dest = out_dir / "out.pdf"
    result = pdf_watermark.run(
        {
            "input": str(src), "output": str(dest), "mode": "watermark", "pages": "2-3",
            "watermark": {"content": "text", "text": "DRAFT", "font_size": 24, "color": "#888888",
                          "opacity": 0.35, "rotation": 45, "placement": "single"},
        },
        noop_progress,
    )
    assert result["pages"] == 5
    assert result["pages_affected"] == 2


def test_watermark_first_page_only(make_pdf, out_dir):
    src = make_pdf("a", pages=4)
    dest = out_dir / "out.pdf"
    result = pdf_watermark.run(
        {
            "input": str(src), "output": str(dest), "mode": "watermark", "pages": "first",
            "watermark": {"content": "text", "text": "DRAFT", "font_size": 24, "color": "#888888",
                          "opacity": 0.35, "rotation": 45, "placement": "single"},
        },
        noop_progress,
    )
    assert result["pages_affected"] == 1


def test_watermark_empty_custom_range_defaults_to_first_page(make_pdf, out_dir):
    src = make_pdf("a", pages=4)
    dest = out_dir / "out.pdf"
    result = pdf_watermark.run(
        {
            "input": str(src), "output": str(dest), "mode": "watermark", "pages": "",
            "watermark": {"content": "text", "text": "DRAFT", "font_size": 24, "color": "#888888",
                          "opacity": 0.35, "rotation": 45, "placement": "single"},
        },
        noop_progress,
    )
    assert result["pages_affected"] == 1


def test_watermark_missing_text_when_content_is_text(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_watermark.run(
            {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "watermark", "pages": "all",
             "watermark": {"content": "text", "font_size": 24, "color": "#888888",
                           "opacity": 0.35, "rotation": 45, "placement": "single"}},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"


def test_watermark_bad_opacity(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_watermark.run(
            {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "watermark", "pages": "all",
             "watermark": {"content": "text", "text": "X", "font_size": 24, "color": "#888888",
                           "opacity": 1.5, "rotation": 45, "placement": "single"}},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"


def test_page_numbers_all_pages(make_pdf, out_dir):
    src = make_pdf("a", pages=3)
    dest = out_dir / "out.pdf"
    result = pdf_watermark.run(
        {
            "input": str(src), "output": str(dest), "mode": "page_numbers", "pages": "all",
            "page_numbers": {"position": "bottom-center", "format": "n-of-total", "start": 1,
                             "font_size": 11, "color": "#000000"},
        },
        noop_progress,
    )
    assert result["pages_affected"] == 3
    assert page_count(dest) == 3


def test_page_numbers_respects_start_and_range(make_pdf, out_dir):
    src = make_pdf("a", pages=5)
    dest = out_dir / "out.pdf"
    result = pdf_watermark.run(
        {
            "input": str(src), "output": str(dest), "mode": "page_numbers", "pages": "3-5",
            "page_numbers": {"position": "top-right", "format": "page-n", "start": 1,
                             "font_size": 11, "color": "#000000"},
        },
        noop_progress,
    )
    assert result["pages_affected"] == 3


def test_page_numbers_bad_position(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_watermark.run(
            {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "page_numbers", "pages": "all",
             "page_numbers": {"position": "center", "format": "n", "start": 1,
                              "font_size": 11, "color": "#000000"}},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"  # "center" is a stamp-only position, not valid for page numbers


def test_page_numbers_bad_format(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_watermark.run(
            {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "page_numbers", "pages": "all",
             "page_numbers": {"position": "bottom-center", "format": "roman", "start": 1,
                              "font_size": 11, "color": "#000000"}},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"


def test_stamp_text_at_center_position(make_pdf, out_dir):
    src = make_pdf("a", pages=2)
    dest = out_dir / "out.pdf"
    result = pdf_watermark.run(
        {
            "input": str(src), "output": str(dest), "mode": "stamp", "pages": "all",
            "stamp": {"content": "text", "text": "APPROVED", "position": "center", "font_size": 24},
        },
        noop_progress,
    )
    assert result["pages_affected"] == 2


def test_stamp_image_at_bottom_right(make_pdf, out_dir, make_image):
    src = make_pdf("a", pages=1)
    dest = out_dir / "out.pdf"
    result = pdf_watermark.run(
        {
            "input": str(src), "output": str(dest), "mode": "stamp", "pages": "all",
            "stamp": {"content": "image", "image_b64": png_b64(make_image), "position": "bottom-right",
                     "max_width_pct": 0.2},
        },
        noop_progress,
    )
    assert result["pages_affected"] == 1


def test_stamp_bad_position(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_watermark.run(
            {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "stamp", "pages": "all",
             "stamp": {"content": "text", "text": "X", "position": "diagonal", "font_size": 24}},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"


def test_stamp_image_content_needs_valid_image_bytes(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_watermark.run(
            {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "stamp", "pages": "all",
             "stamp": {"content": "image", "image_b64": base64.b64encode(b"not an image").decode("ascii"),
                      "position": "center", "max_width_pct": 0.2}},
            noop_progress,
        )
    assert exc.value.code == "UNSUPPORTED_FORMAT"


def test_bad_mode(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_watermark.run(
            {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "underline", "pages": "all"},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"


def test_bad_page_range(make_pdf, out_dir):
    src = make_pdf("a", pages=3)
    with pytest.raises(OpError) as exc:
        pdf_watermark.run(
            {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "watermark", "pages": "1-99",
             "watermark": {"content": "text", "text": "X", "font_size": 24, "color": "#888888",
                           "opacity": 0.35, "rotation": 45, "placement": "single"}},
            noop_progress,
        )
    assert exc.value.code == "BAD_PARAMS"


def test_encrypted_input(encrypted_pdf, out_dir):
    with pytest.raises(OpError) as exc:
        pdf_watermark.run(
            {"input": str(encrypted_pdf), "output": str(out_dir / "o.pdf"), "mode": "watermark", "pages": "all",
             "watermark": {"content": "text", "text": "X", "font_size": 24, "color": "#888888",
                           "opacity": 0.35, "rotation": 45, "placement": "single"}},
            noop_progress,
        )
    assert exc.value.code == "ENCRYPTED_PDF"


def test_corrupt_input(corrupt_pdf, out_dir):
    with pytest.raises(OpError) as exc:
        pdf_watermark.run(
            {"input": str(corrupt_pdf), "output": str(out_dir / "o.pdf"), "mode": "watermark", "pages": "all",
             "watermark": {"content": "text", "text": "X", "font_size": 24, "color": "#888888",
                           "opacity": 0.35, "rotation": 45, "placement": "single"}},
            noop_progress,
        )
    assert exc.value.code == "CORRUPT_PDF"


def test_progress_is_reported(make_pdf, out_dir):
    calls = []
    src = make_pdf("a", pages=2)
    pdf_watermark.run(
        {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "watermark", "pages": "all",
         "watermark": {"content": "text", "text": "X", "font_size": 24, "color": "#888888",
                       "opacity": 0.35, "rotation": 45, "placement": "single"}},
        lambda pct, note="": calls.append((pct, note)),
    )
    assert calls
    assert calls[-1][0] == 100
