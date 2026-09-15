"""Tests for `pdf.redact` -- visual cover-up and true redaction."""
from __future__ import annotations

import pikepdf
import pytest

from ops import pdf_redact
from ops._common import OpError, has_ghostscript, noop_progress

needs_gs = pytest.mark.skipif(not has_ghostscript(), reason="ghostscript not installed")


def page_count(path) -> int:
    with pikepdf.open(str(path)) as pdf:
        return len(pdf.pages)


def _page_image_bytes(pdf, page_index: int) -> bytes:
    """Raw (encoded) bytes of the first Image XObject on a page.

    `make_pdf` builds each page as a single embedded image (see conftest.py),
    so this is the one piece of content a redaction can touch or leave alone.
    """
    page = pdf.pages[page_index]
    if "/Resources" not in page or "/XObject" not in page.Resources:
        raise AssertionError(f"Page {page_index} has no /Resources/XObject")
    for _, xobj in page.Resources["/XObject"].items():
        if xobj.get("/Subtype") == pikepdf.Name("/Image"):
            return bytes(xobj.read_raw_bytes())
    raise AssertionError(f"No Image XObject found on page {page_index}")


def one_box(page: int) -> list[dict]:
    return [{"page": page, "x_pct": 0.1, "y_pct": 0.1, "w_pct": 0.3, "h_pct": 0.2}]


def test_redact_visual_preserves_page_count_and_original_image(make_pdf, out_dir):
    src = make_pdf("a", pages=2)
    dest = out_dir / "redacted.pdf"
    with pikepdf.open(str(src)) as before:
        original_bytes = _page_image_bytes(before, 0)

    result = pdf_redact.run(
        {"input": str(src), "output": str(dest), "mode": "visual", "boxes": one_box(0)},
        noop_progress,
    )

    assert set(result) == {"output", "bytes", "pages", "boxes", "mode"}
    assert result["pages"] == 2
    assert result["boxes"] == 1
    assert result["mode"] == "visual"
    assert page_count(dest) == 2
    assert dest.stat().st_size > src.stat().st_size

    with pikepdf.open(str(dest)) as after:
        # Visual cover-up draws on top -- the original image is still there,
        # byte for byte, underneath the box.
        assert _page_image_bytes(after, 0) == original_bytes


@needs_gs
def test_redact_true_replaces_the_boxed_pages_image(make_pdf, out_dir):
    src = make_pdf("a", pages=2)
    dest = out_dir / "redacted.pdf"
    with pikepdf.open(str(src)) as before:
        original_bytes = _page_image_bytes(before, 0)

    result = pdf_redact.run(
        {"input": str(src), "output": str(dest), "mode": "true", "boxes": one_box(0)},
        noop_progress,
    )

    assert result["mode"] == "true"
    assert page_count(dest) == 2
    with pikepdf.open(str(dest)) as after:
        # True redact flattens the page to a freshly rendered image -- the
        # original pixel data is gone, not merely covered.
        assert _page_image_bytes(after, 0) != original_bytes


@needs_gs
def test_redact_true_leaves_pages_without_a_box_untouched(make_pdf, out_dir):
    src = make_pdf("a", pages=3)
    dest = out_dir / "redacted.pdf"
    with pikepdf.open(str(src)) as before:
        page1_before = _page_image_bytes(before, 1)
        page2_before = _page_image_bytes(before, 2)

    pdf_redact.run(
        {"input": str(src), "output": str(dest), "mode": "true", "boxes": one_box(0)},
        noop_progress,
    )

    with pikepdf.open(str(dest)) as after:
        assert _page_image_bytes(after, 1) == page1_before
        assert _page_image_bytes(after, 2) == page2_before


@needs_gs
def test_redact_true_progress_reaches_100(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    dest = out_dir / "redacted.pdf"
    calls: list[int] = []

    pdf_redact.run(
        {"input": str(src), "output": str(dest), "mode": "true", "boxes": one_box(0)},
        lambda pct, note="": calls.append(pct),
    )
    assert calls[-1] == 100


def test_redact_true_without_ghostscript_fails_fast(make_pdf, out_dir, monkeypatch):
    def _raise():
        raise OpError("GHOSTSCRIPT_MISSING", "Ghostscript was not found.")

    monkeypatch.setattr("ops.pdf_redact.find_ghostscript", _raise)
    src = make_pdf("a", pages=1)
    dest = out_dir / "redacted.pdf"

    with pytest.raises(OpError) as exc:
        pdf_redact.run(
            {"input": str(src), "output": str(dest), "mode": "true", "boxes": one_box(0)},
            noop_progress,
        )
    assert exc.value.code == "GHOSTSCRIPT_MISSING"
    assert not dest.exists()


@pytest.mark.parametrize(
    "boxes",
    [
        [],
        "not-a-list",
        [{"page": 0}],  # missing percentages
        [{"page": 9, "x_pct": 0, "y_pct": 0, "w_pct": 0.1, "h_pct": 0.1}],  # out of range
        [{"page": 0, "x_pct": 1.5, "y_pct": 0, "w_pct": 0.1, "h_pct": 0.1}],  # x_pct out of bounds
    ],
)
def test_redact_rejects_bad_boxes(make_pdf, out_dir, boxes):
    src = make_pdf("a", pages=1)
    dest = out_dir / "redacted.pdf"
    with pytest.raises(OpError) as exc:
        pdf_redact.run({"input": str(src), "output": str(dest), "mode": "visual", "boxes": boxes}, noop_progress)
    assert exc.value.code == "BAD_PARAMS"
    assert not dest.exists()


def test_redact_requires_boxes_param(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_redact.run({"input": str(src), "output": str(out_dir / "r.pdf"), "mode": "visual"}, noop_progress)
    assert exc.value.code == "BAD_PARAMS"


def test_redact_defaults_mode_to_visual(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    dest = out_dir / "redacted.pdf"
    result = pdf_redact.run({"input": str(src), "output": str(dest), "boxes": one_box(0)}, noop_progress)
    assert result["mode"] == "visual"


def test_redact_propagates_encrypted_and_corrupt(encrypted_pdf, corrupt_pdf, out_dir):
    for src, code in ((encrypted_pdf, "ENCRYPTED_PDF"), (corrupt_pdf, "CORRUPT_PDF")):
        with pytest.raises(OpError) as exc:
            pdf_redact.run(
                {"input": str(src), "output": str(out_dir / "r.pdf"), "mode": "visual", "boxes": one_box(0)},
                noop_progress,
            )
        assert exc.value.code == code
    assert not (out_dir / "r.pdf").exists()
