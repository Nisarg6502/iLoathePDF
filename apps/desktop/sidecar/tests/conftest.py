"""Shared fixtures for every op test.

Owned by the integration pass -- op agents use these rather than adding their
own fixture files, so nobody collides. Add a fixture here only if more than one
op test needs it.
"""
from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def make_pdf(tmp_path: Path):
    """make_pdf('a', pages=3) -> Path to a real 3-page PDF with page numbers drawn on it."""

    def _make(name: str = "sample", pages: int = 3, size=(595, 842)) -> Path:
        from PIL import Image, ImageDraw

        images = []
        for n in range(1, pages + 1):
            img = Image.new("RGB", (int(size[0]), int(size[1])), "white")
            draw = ImageDraw.Draw(img)
            draw.rectangle([20, 20, size[0] - 20, size[1] - 20], outline="black", width=3)
            draw.text((60, 60), f"PAGE {n}", fill="black")
            images.append(img)
        out = tmp_path / f"{name}.pdf"
        images[0].save(out, "PDF", save_all=True, append_images=images[1:], resolution=72.0)
        return out

    return _make


@pytest.fixture
def make_image(tmp_path: Path):
    """make_image('a', 'png', size=(64,48)) -> Path to a real image file.
    Supported ext: png, jpg, webp, heic."""

    def _make(name: str = "img", ext: str = "png", size=(64, 48), color=(200, 60, 40)) -> Path:
        from PIL import Image

        if ext.lower() in {"heic", "heif"}:
            import pillow_heif

            pillow_heif.register_heif_opener()
        img = Image.new("RGB", size, color)
        out = tmp_path / f"{name}.{ext}"
        img.save(out)
        return out

    return _make


@pytest.fixture
def encrypted_pdf(tmp_path: Path, make_pdf) -> Path:
    import pikepdf

    plain = make_pdf("plain", pages=2)
    out = tmp_path / "encrypted.pdf"
    with pikepdf.open(str(plain)) as pdf:
        pdf.save(str(out), encryption=pikepdf.Encryption(owner="o", user="u", R=6))
    return out


@pytest.fixture
def corrupt_pdf(tmp_path: Path) -> Path:
    out = tmp_path / "corrupt.pdf"
    out.write_bytes(b"%PDF-1.7\nthis is not a pdf at all\n")
    return out


@pytest.fixture
def out_dir(tmp_path: Path) -> Path:
    d = tmp_path / "out"
    d.mkdir()
    return d
