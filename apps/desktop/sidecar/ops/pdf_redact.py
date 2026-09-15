"""`pdf.redact` -- black out regions of a PDF.

Two modes:
  - "visual": a black rectangle is drawn on top of each box, the same
    reportlab+pikepdf overlay technique `pdf.sign` uses. The original page
    content is untouched underneath.
  - "true": every page that received at least one box is rasterised with
    Ghostscript (the same renderer `pdf.to_img` uses) and replaced wholesale,
    so nothing under a box -- or anywhere else on that page -- survives in
    extractable form. Pages with no boxes are never touched.
"""
from __future__ import annotations

import io
import subprocess
from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    find_ghostscript,
    one_of,
    open_pdf,
    require,
    size_of,
    temp_dir,
)

_REDACT_DPI = 200

_ROTATED_OR_CROPPED_MESSAGE = (
    "This page is rotated/cropped -- True Redact isn't supported for it yet. "
    "Try Visual Cover-up, or rotate the PDF to its default orientation first."
)


def _pct(box: dict, key: str) -> float:
    value = box.get(key)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise OpError("BAD_PARAMS", f"Box field '{key}' must be a number, got {value!r}")
    if not 0 <= value <= 1.0001:
        raise OpError("BAD_PARAMS", f"Box field '{key}' must be between 0 and 1, got {value!r}")
    return float(value)


def _validate(boxes: object, page_count: int) -> list[dict]:
    if not isinstance(boxes, list) or not boxes:
        raise OpError("BAD_PARAMS", "'boxes' must be a non-empty list")
    out: list[dict] = []
    for raw in boxes:
        if not isinstance(raw, dict):
            raise OpError("BAD_PARAMS", "Each box must be an object")
        page = raw.get("page")
        if not isinstance(page, int) or isinstance(page, bool) or not 0 <= page < page_count:
            raise OpError("BAD_PARAMS", f"Box targets page {page!r}, but the PDF has {page_count} pages")
        out.append(
            {
                "page": page,
                "x_pct": _pct(raw, "x_pct"),
                "y_pct": _pct(raw, "y_pct"),
                "w_pct": _pct(raw, "w_pct"),
                "h_pct": _pct(raw, "h_pct"),
            }
        )
    return out


def _assert_no_rotation_or_crop_mismatch(page) -> None:
    """Refuse pages the bake logic can't yet handle correctly.

    The box-drawing UI previews pages via pdf.js, which honors `/Rotate` and
    `CropBox`. This op's bake logic reads the raw, unrotated `mediabox` and
    Ghostscript-rasterizes at that implied orientation -- on a page with a
    non-default `/Rotate` (or a `CropBox` that differs from `MediaBox`) the
    box would land in the wrong place and/or the flattened image would be
    stretched into the wrong aspect ratio. Rather than a full rotation/crop-
    aware coordinate rewrite, True Redact refuses to touch such a page.
    """
    rotation = int(page.get("/Rotate", 0))
    if rotation % 360 != 0:
        raise OpError("BAD_PARAMS", _ROTATED_OR_CROPPED_MESSAGE)
    mediabox = [float(v) for v in page.mediabox]
    cropbox = [float(v) for v in page.cropbox]
    if any(abs(a - b) > 0.01 for a, b in zip(mediabox, cropbox)):
        raise OpError("BAD_PARAMS", _ROTATED_OR_CROPPED_MESSAGE)


def _rect_points(box: dict, width_pt: float, height_pt: float) -> tuple[float, float, float, float]:
    """-> (x_pt, y_pt, w_pt, h_pt); y_pt is the box's bottom edge (PDF y-up)."""
    x_pt = box["x_pct"] * width_pt
    box_top_pt = height_pt - box["y_pct"] * height_pt
    h_pt = box["h_pct"] * height_pt
    y_pt = box_top_pt - h_pt
    w_pt = box["w_pct"] * width_pt
    return x_pt, y_pt, w_pt, h_pt


def _draw_boxes(c, boxes: list[dict], width_pt: float, height_pt: float) -> None:
    from reportlab.lib.colors import black

    c.setFillColor(black)
    for box in boxes:
        x_pt, y_pt, w_pt, h_pt = _rect_points(box, width_pt, height_pt)
        c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=0)


def _visual_overlay_bytes(boxes: list[dict], width_pt: float, height_pt: float) -> bytes:
    from reportlab.pdfgen import canvas as pdfcanvas

    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=(width_pt, height_pt))
    _draw_boxes(c, boxes, width_pt, height_pt)
    c.save()
    return buf.getvalue()


def _no_window_flags() -> int:
    return getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _rasterize_page(src: Path, page_no: int, dpi: int, dest: Path, progress: ProgressFn, pct: int, note: str) -> None:
    """Render one 1-based page of `src` to a PNG at `dest` with Ghostscript."""
    gs = find_ghostscript()
    proc = subprocess.Popen(
        [
            gs, "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE",
            "-sDEVICE=png16m", f"-r{dpi}",
            "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4",
            f"-dFirstPage={page_no}", f"-dLastPage={page_no}",
            f"-sOutputFile={dest}", str(src),
        ],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=_no_window_flags(),
    )
    try:
        while True:
            try:
                _, stderr = proc.communicate(timeout=0.2)
                break
            except subprocess.TimeoutExpired:
                progress(pct, note)
    except BaseException:
        proc.kill()
        proc.wait()
        raise
    if proc.returncode != 0:
        tail = (stderr or b"").decode("utf-8", "replace").strip().splitlines()[-3:]
        raise OpError("INTERNAL", "Ghostscript failed: " + " ".join(tail))


def _flattened_page_bytes(image_path: Path, boxes: list[dict], width_pt: float, height_pt: float) -> bytes:
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as pdfcanvas

    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=(width_pt, height_pt))
    c.drawImage(ImageReader(str(image_path)), 0, 0, width=width_pt, height=height_pt)
    _draw_boxes(c, boxes, width_pt, height_pt)
    c.save()
    return buf.getvalue()


def run(params: dict, progress: ProgressFn) -> dict:
    import pikepdf

    path = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))
    mode = one_of(params, "mode", ("visual", "true"), "visual")

    if mode == "true":
        # Resolved before any processing so a missing binary fails fast and
        # loudly, the same discipline `pdf.to_img` uses.
        find_ghostscript()

    with open_pdf(path) as src:
        total = len(src.pages)
        boxes = _validate(require(params, "boxes"), total)

        by_page: dict[int, list[dict]] = {}
        for box in boxes:
            by_page.setdefault(box["page"], []).append(box)
        pages_in_order = sorted(by_page)

        progress(5, f"Redacting {len(pages_in_order)} page(s)")
        pages_done = 0

        if mode == "visual":
            for page_index in pages_in_order:
                page = src.pages[page_index]
                mbox = [float(v) for v in page.mediabox]
                width_pt = abs(mbox[2] - mbox[0])
                height_pt = abs(mbox[3] - mbox[1])
                overlay_bytes = _visual_overlay_bytes(by_page[page_index], width_pt, height_pt)
                with pikepdf.open(io.BytesIO(overlay_bytes)) as overlay_pdf:
                    page.add_overlay(
                        overlay_pdf.pages[0],
                        pikepdf.Rectangle(mbox[0], mbox[1], mbox[2], mbox[3]),
                        shrink=False,
                        expand=False,
                    )
                pages_done += 1
                progress(5 + int(85 * pages_done / len(pages_in_order)), f"page {page_index + 1}")
        else:
            # Fail fast, like the Ghostscript check above, before any
            # rasterization work: reject rotated/cropped pages up front.
            for page_index in pages_in_order:
                _assert_no_rotation_or_crop_mismatch(src.pages[page_index])

            with temp_dir() as tmp:
                for page_index in pages_in_order:
                    page = src.pages[page_index]
                    mbox = [float(v) for v in page.mediabox]
                    width_pt = abs(mbox[2] - mbox[0])
                    height_pt = abs(mbox[3] - mbox[1])
                    page_no = page_index + 1
                    note = f"page {page_no}"
                    png_path = tmp / f"page-{page_no}.png"
                    _rasterize_page(
                        path, page_no, _REDACT_DPI, png_path, progress,
                        5 + int(85 * pages_done / len(pages_in_order)), note,
                    )
                    flattened_bytes = _flattened_page_bytes(png_path, by_page[page_index], width_pt, height_pt)
                    with pikepdf.open(io.BytesIO(flattened_bytes)) as flat_pdf:
                        # del+insert at the same index nets to zero shift for
                        # every other page, so iteration order doesn't matter.
                        del src.pages[page_index]
                        src.pages.insert(page_index, flat_pdf.pages[0])
                    pages_done += 1
                    progress(5 + int(85 * pages_done / len(pages_in_order)), note)

        progress(92, "Writing output")
        with atomic_output(dest) as tmp_out:
            try:
                src.save(str(tmp_out))
            except OSError as exc:
                raise OpError("OUTPUT_WRITE_FAILED", f"Cannot write {dest}: {exc}") from exc

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest), "pages": total, "boxes": len(boxes), "mode": mode}
