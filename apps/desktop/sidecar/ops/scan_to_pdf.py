"""scan.to_pdf -- turn photographed pages into a cleaned-up PDF. See PROTOCOL.md.

Each image is straightened (EXIF orientation), optionally cleaned up, and the
results are handed to img.to_pdf. Modes:

  color     the photo as it is
  enhanced  contrast stretched so paper reads white and ink reads dark
  bw        crisp black ink on white paper; each pixel is compared with the
            average of its surroundings, so shadows and uneven light across the
            page do not turn it grey or black
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps, UnidentifiedImageError

from ._common import OpError, ProgressFn, existing_file, one_of, require, temp_dir
from . import img_to_pdf

MODES = ("color", "enhanced", "bw")


def _otsu(hist: list[int], total: int) -> int:
    weighted = sum(i * c for i, c in enumerate(hist))
    below = weight_b = 0
    best = -1.0
    threshold = 0
    for t, count in enumerate(hist):
        weight_b += count
        if weight_b == 0:
            continue
        weight_f = total - weight_b
        if weight_f == 0:
            break
        below += t * count
        mean_b = below / weight_b
        mean_f = (weighted - below) / weight_f
        between = weight_b * weight_f * (mean_b - mean_f) ** 2
        if between > best:
            best, threshold = between, t
    return threshold


def to_black_and_white(img: Image.Image) -> Image.Image:
    gray = ImageOps.grayscale(img)
    radius = max(8, max(gray.size) // 30)
    background = gray.filter(ImageFilter.GaussianBlur(radius))
    # Ink is whatever sits clearly darker than its surroundings.
    diff = ImageChops.subtract(background, gray)
    threshold = max(12, min(60, _otsu(diff.histogram(), gray.size[0] * gray.size[1])))
    return diff.point(lambda v: 0 if v > threshold else 255, "L")


def _clean(src: Path, dest: Path, mode: str) -> Path:
    try:
        with Image.open(src) as opened:
            opened.load()
            upright = ImageOps.exif_transpose(opened) or opened.copy()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise OpError("UNSUPPORTED_FORMAT", f"Cannot read {src.name}: {exc}") from exc

    with upright:
        if upright.mode in ("RGBA", "LA", "PA") or "transparency" in upright.info:
            rgba = upright.convert("RGBA")
            flat = Image.new("RGB", rgba.size, (255, 255, 255))
            flat.paste(rgba, mask=rgba.getchannel("A"))
            rgb = flat
        else:
            rgb = upright.convert("RGB")
        if mode == "bw":
            out = to_black_and_white(rgb)
            path = dest.with_suffix(".png")
            out.save(path, "PNG", optimize=True)
        else:
            out = ImageOps.autocontrast(rgb, cutoff=1)
            path = dest.with_suffix(".jpg")
            out.save(path, "JPEG", quality=92, optimize=True)
    return path


def run(params: dict, progress: ProgressFn) -> dict:
    inputs = require(params, "inputs")
    if not isinstance(inputs, list) or not inputs:
        raise OpError("BAD_PARAMS", "'inputs' must be a non-empty list of paths")
    output = Path(require(params, "output"))
    mode = one_of(params, "mode", MODES, "enhanced")
    page_size = one_of(params, "page_size", ("fit", "a4", "letter"), "a4")
    orientation = one_of(params, "orientation", ("auto", "portrait", "landscape"), "auto")
    sources = [existing_file(raw) for raw in inputs]

    if mode == "color":
        return img_to_pdf.run(
            {"inputs": [str(s) for s in sources], "output": str(output), "page_size": page_size,
             "orientation": orientation, "margin_mm": 0},
            progress,
        )

    with temp_dir() as scratch:
        cleaned: list[str] = []
        for index, src in enumerate(sources):
            progress(int(70 * index / len(sources)), f"{src.name} ({index + 1} of {len(sources)})")
            cleaned.append(str(_clean(src, scratch / f"{index:04d}", mode)))
        return img_to_pdf.run(
            {"inputs": cleaned, "output": str(output), "page_size": page_size,
             "orientation": orientation, "margin_mm": 0},
            lambda pct, note="": progress(70 + int(pct * 0.3), note),
        )
