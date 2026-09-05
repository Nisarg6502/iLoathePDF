"""Tests for `pdf.sign` -- signature/initials/text/date placement."""
from __future__ import annotations

import base64
from pathlib import Path

import pikepdf
import pytest

from ops import pdf_sign
from ops._common import OpError


class Recorder:
    def __init__(self) -> None:
        self.calls: list[tuple[int, str]] = []

    def __call__(self, pct: int, note: str = "") -> None:
        self.calls.append((int(pct), note))

    @property
    def pcts(self) -> list[int]:
        return [pct for pct, _ in self.calls]


def page_count(path) -> int:
    with pikepdf.open(str(path)) as pdf:
        return len(pdf.pages)


def png_b64(make_image) -> str:
    path = make_image("mark", "png", size=(40, 20))
    return base64.b64encode(Path(path).read_bytes()).decode("ascii")


def base_elements(image_b64: str) -> list[dict]:
    return [
        {"page": 0, "kind": "signature", "x_pct": 0.1, "y_pct": 0.8, "w_pct": 0.25, "h_pct": 0.08, "image_b64": image_b64},
        {"page": 0, "kind": "date", "x_pct": 0.5, "y_pct": 0.05, "w_pct": 0.2, "h_pct": 0.04, "text": "Sep 5, 2026", "font_size": 14, "color": "#1d4ed8"},
    ]


def test_sign_places_image_and_text_and_preserves_page_count(make_pdf, make_image, out_dir):
    src = make_pdf("a", pages=2)
    dest = out_dir / "signed.pdf"
    progress = Recorder()

    result = pdf_sign.run(
        {"input": str(src), "output": str(dest), "elements": base_elements(png_b64(make_image))},
        progress,
    )

    assert set(result) == {"output", "bytes", "pages", "elements"}
    assert result["pages"] == 2
    assert result["elements"] == 2
    assert page_count(dest) == 2
    assert result["bytes"] == dest.stat().st_size
    assert dest.stat().st_size > src.stat().st_size
    assert progress.pcts[-1] == 100


def test_sign_only_touches_pages_with_elements(make_pdf, make_image, out_dir):
    src = make_pdf("a", pages=3)
    dest = out_dir / "signed.pdf"

    elements = [{"page": 2, "kind": "text", "x_pct": 0.1, "y_pct": 0.1, "w_pct": 0.3, "h_pct": 0.05, "text": "hi", "font_size": 12}]
    result = pdf_sign.run({"input": str(src), "output": str(dest), "elements": elements}, Recorder())

    assert result["pages"] == 3
    assert page_count(dest) == 3


def test_sign_defaults_font_size_and_color(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    dest = out_dir / "signed.pdf"
    elements = [{"page": 0, "kind": "text", "x_pct": 0.1, "y_pct": 0.1, "w_pct": 0.3, "h_pct": 0.05, "text": "hi"}]

    result = pdf_sign.run({"input": str(src), "output": str(dest), "elements": elements}, Recorder())
    assert result["elements"] == 1


@pytest.mark.parametrize(
    "elements",
    [
        [],
        "not-a-list",
        [{"page": 0}],  # no kind
        [{"page": 0, "kind": "sticker", "x_pct": 0, "y_pct": 0, "w_pct": 0.1, "h_pct": 0.1}],
        [{"page": 9, "kind": "text", "x_pct": 0, "y_pct": 0, "w_pct": 0.1, "h_pct": 0.1, "text": "hi"}],  # out of range
        [{"page": 0, "kind": "text", "x_pct": 1.5, "y_pct": 0, "w_pct": 0.1, "h_pct": 0.1, "text": "hi"}],  # x_pct out of bounds
        [{"page": 0, "kind": "text", "x_pct": 0, "y_pct": 0, "w_pct": 0.1, "h_pct": 0.1}],  # text missing text
        [{"page": 0, "kind": "signature", "x_pct": 0, "y_pct": 0, "w_pct": 0.1, "h_pct": 0.1}],  # signature missing image_b64
        [{"page": 0, "kind": "text", "x_pct": 0, "y_pct": 0, "w_pct": 0.1, "h_pct": 0.1, "text": "hi", "font_size": -1}],
    ],
)
def test_sign_rejects_bad_elements(make_pdf, out_dir, elements):
    src = make_pdf("a", pages=1)
    dest = out_dir / "signed.pdf"
    with pytest.raises(OpError) as exc:
        pdf_sign.run({"input": str(src), "output": str(dest), "elements": elements}, Recorder())
    assert exc.value.code == "BAD_PARAMS"
    assert not dest.exists()


def test_sign_requires_elements_param(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        pdf_sign.run({"input": str(src), "output": str(out_dir / "s.pdf")}, Recorder())
    assert exc.value.code == "BAD_PARAMS"


def test_sign_propagates_encrypted_and_corrupt(encrypted_pdf, corrupt_pdf, out_dir, make_image):
    elements = base_elements(png_b64(make_image))
    for src, code in ((encrypted_pdf, "ENCRYPTED_PDF"), (corrupt_pdf, "CORRUPT_PDF")):
        with pytest.raises(OpError) as exc:
            pdf_sign.run({"input": str(src), "output": str(out_dir / "s.pdf"), "elements": elements}, Recorder())
        assert exc.value.code == code
    assert not (out_dir / "s.pdf").exists()
