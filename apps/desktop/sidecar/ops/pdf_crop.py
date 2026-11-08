"""pdf.crop -- trim the margins of every selected page. See PROTOCOL.md.

Margins are percentages of the page as the reader sees it (top / right /
bottom / left), so one setting behaves sensibly on mixed page sizes and on
rotated pages. The page's MediaBox and CropBox are both set to the trimmed
rectangle, which makes every viewer and rasteriser agree on the result.

Cropping hides content, it does not remove it: whatever lay outside the new
box is still inside the file. Redact is the tool for removal.
"""
from __future__ import annotations

from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    open_pdf,
    parse_pages,
    require,
    size_of,
)

_SIDES = ("top", "right", "bottom", "left")


def _margins(raw: object) -> dict[str, float]:
    if not isinstance(raw, dict):
        raise OpError("BAD_PARAMS", "'margins' must be an object with top, right, bottom and left")
    out: dict[str, float] = {}
    for side in _SIDES:
        value = raw.get(side, 0)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value < 100:
            raise OpError("BAD_PARAMS", f"Margin '{side}' must be a percentage from 0 to under 100, got {value!r}")
        out[side] = float(value)
    if out["top"] + out["bottom"] >= 100 or out["left"] + out["right"] >= 100:
        raise OpError("BAD_PARAMS", "Those margins would crop away the whole page")
    if not any(out.values()):
        raise OpError("BAD_PARAMS", "Set at least one margin above 0")
    return out


def _visible_box(page) -> list[float]:
    box = page.get("/CropBox", None)
    if box is None:
        box = page.MediaBox
    x0, y0, x1, y1 = (float(v) for v in box)
    return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]


def _trimmed_box(box: list[float], rotate: int, margins: dict[str, float]) -> list[float]:
    """Apply visual margins to an unrotated box, honouring /Rotate."""
    x0, y0, x1, y1 = box
    width, height = x1 - x0, y1 - y0
    turns = (rotate // 90) % 4
    visual_w, visual_h = (height, width) if turns % 2 else (width, height)

    # Sides in clockwise order starting at the top. Rotating the page clockwise
    # by 90 degrees moves unrotated side i to visual side i + 1.
    shave = {"top": 0.0, "right": 0.0, "bottom": 0.0, "left": 0.0}
    for visual_index, side in enumerate(_SIDES):
        unrotated = _SIDES[(visual_index - turns) % 4]
        extent = visual_h if side in ("top", "bottom") else visual_w
        shave[unrotated] += margins[side] / 100.0 * extent

    return [x0 + shave["left"], y0 + shave["bottom"], x1 - shave["right"], y1 - shave["top"]]


def run(params: dict, progress: ProgressFn) -> dict:
    import pikepdf

    src = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))
    margins = _margins(require(params, "margins"))
    progress(5, f"Reading {src.name}")

    with open_pdf(src) as pdf:
        total = len(pdf.pages)
        targets = sorted(set(parse_pages(str(params.get("pages") or ""), total)))
        for done, index in enumerate(targets, start=1):
            page = pdf.pages[index]
            rotate = int(page.get("/Rotate", 0) or 0)
            box = _trimmed_box(_visible_box(page), rotate, margins)
            rect = pikepdf.Array([round(v, 3) for v in box])
            page.MediaBox = rect
            page.CropBox = rect
            progress(5 + int(85 * done / len(targets)), f"page {index + 1}")

        progress(92, "Writing output")
        with atomic_output(dest) as tmp:
            pdf.save(str(tmp))

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest), "pages": total, "pages_cropped": len(targets)}
