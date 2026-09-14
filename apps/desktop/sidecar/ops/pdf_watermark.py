"""pdf.watermark -- draw a watermark, page numbers, or a stamp onto every
selected page. See PROTOCOL.md.

Like pdf.sign, this builds a single-page reportlab overlay per affected page
and merges it with pikepdf.Page.add_overlay -- nothing about the source
page's existing content is touched. Unlike pdf.sign, placement is computed
here from a named position/rotation rule rather than accepted as explicit
coordinates, because these are rule-based operations ("every page", "top
right") rather than freeform ones.

Anchor convention: the anchor point is the content's own drawing origin
(bottom-left for unrotated text/images), matching how both reportlab and
pdf-lib naturally rotate -- content extends up-and-right from the anchor and
the whole thing rotates around that fixed point. This is deliberately
simpler than centering a bounding box, and keeps the desktop and web engines
visually consistent without extra alignment math.
"""
from __future__ import annotations

import base64
import io
from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    one_of,
    open_pdf,
    parse_pages,
    require,
    size_of,
)

MODES = ("watermark", "page_numbers", "stamp")
CONTENT_KINDS = ("text", "image")
PLACEMENTS = ("single", "tiled")
FORMATS = ("n", "page-n", "n-of-total")

# name -> (x_pct, y_pct, h_align, v_align). x/y_pct use pdf.sign's existing
# top-left-origin convention (y_pct=0 is the top edge, 1 is the bottom).
_ALL_POSITIONS = {
    "top-left": (0.05, 0.05, "left", "top"),
    "top-center": (0.5, 0.05, "center", "top"),
    "top-right": (0.95, 0.05, "right", "top"),
    "left": (0.05, 0.5, "left", "middle"),
    "center": (0.5, 0.5, "center", "middle"),
    "right": (0.95, 0.5, "right", "middle"),
    "bottom-left": (0.05, 0.95, "left", "bottom"),
    "bottom-center": (0.5, 0.95, "center", "bottom"),
    "bottom-right": (0.95, 0.95, "right", "bottom"),
}
PAGE_NUMBER_POSITIONS = tuple(p for p in _ALL_POSITIONS if p not in ("left", "center", "right"))
STAMP_POSITIONS = tuple(_ALL_POSITIONS)

_TILE_COLS, _TILE_ROWS = 3, 4  # 12 repeats, per the design spec


def _resolve_pages(spec: str, total: int) -> list[int]:
    if spec == "all":
        return list(range(total))
    if spec == "first" or not spec.strip():
        return [0]
    return parse_pages(spec, total)


def _opacity(value: object) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 1:
        raise OpError("BAD_PARAMS", f"'opacity' must be between 0 and 1, got {value!r}")
    return float(value)


def _decode_image(image_b64: object) -> bytes:
    if not isinstance(image_b64, str) or not image_b64:
        raise OpError("BAD_PARAMS", "'image_b64' is required when content is 'image'")
    try:
        data = base64.b64decode(image_b64)
    except Exception as exc:
        raise OpError("UNSUPPORTED_FORMAT", f"'image_b64' is not valid base64: {exc}") from exc
    try:
        from PIL import Image

        Image.open(io.BytesIO(data)).verify()
    except Exception as exc:
        raise OpError("UNSUPPORTED_FORMAT", f"'image_b64' is not a readable image: {exc}") from exc
    return data


def _image_size(data: bytes) -> tuple[int, int]:
    from PIL import Image

    with Image.open(io.BytesIO(data)) as img:
        return img.size


def _draw_aligned_text(c, text: str, x_pt: float, y_pt: float, h_align: str, v_align: str, font_size: float) -> None:
    if v_align == "top":
        baseline_y = y_pt - font_size
    elif v_align == "bottom":
        baseline_y = y_pt
    else:
        baseline_y = y_pt - font_size * 0.35
    if h_align == "left":
        c.drawString(x_pt, baseline_y, text)
    elif h_align == "right":
        c.drawRightString(x_pt, baseline_y, text)
    else:
        c.drawCentredString(x_pt, baseline_y, text)


def _draw_aligned_image(c, reader, x_pt: float, y_pt: float, w_pt: float, h_pt: float, h_align: str, v_align: str) -> None:
    img_x = x_pt if h_align == "left" else x_pt - w_pt if h_align == "right" else x_pt - w_pt / 2
    img_y = y_pt if v_align == "bottom" else y_pt - h_pt if v_align == "top" else y_pt - h_pt / 2
    c.drawImage(reader, img_x, img_y, width=w_pt, height=h_pt, mask="auto", preserveAspectRatio=False)


def _build_watermark_overlay(spec: dict, width_pt: float, height_pt: float) -> bytes:
    from reportlab.lib.colors import Color
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as pdfcanvas

    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=(width_pt, height_pt))
    opacity = _opacity(spec.get("opacity", 1.0))
    rotation = float(spec.get("rotation", 0) or 0)

    if spec.get("placement", "single") == "tiled":
        pivots = [
            ((col + 0.5) * width_pt / _TILE_COLS, (row + 0.5) * height_pt / _TILE_ROWS)
            for row in range(_TILE_ROWS)
            for col in range(_TILE_COLS)
        ]
    else:
        pivots = [(width_pt / 2, height_pt / 2)]

    is_image = spec.get("content") == "image"
    if is_image:
        data = _decode_image(spec.get("image_b64"))
        iw, ih = _image_size(data)
        w_pt = width_pt * 0.3
        h_pt = w_pt * ih / iw
        reader = ImageReader(io.BytesIO(data))

    for cx, cy in pivots:
        c.saveState()
        c.translate(cx, cy)
        c.rotate(rotation)
        c.setFillAlpha(opacity)
        if is_image:
            c.drawImage(reader, 0, 0, width=w_pt, height=h_pt, mask="auto")
        else:
            text = spec.get("text")
            if not isinstance(text, str) or not text:
                raise OpError("BAD_PARAMS", "'text' is required when content is 'text'")
            size = max(4.0, float(spec.get("font_size", 48)))
            c.setFont("Helvetica", size)
            c.setFillColor(_hex_to_rgb_color(Color, spec.get("color", "#888888")))
            c.drawString(0, 0, text)
        c.restoreState()

    c.save()
    return buf.getvalue()


def _build_positioned_overlay(
    width_pt: float,
    height_pt: float,
    position: str,
    content: str,
    text: str | None,
    font_size: float,
    color: str,
    image_data: bytes | None,
    max_width_pct: float,
) -> bytes:
    from reportlab.lib.colors import Color
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as pdfcanvas

    x_pct, y_pct, h_align, v_align = _ALL_POSITIONS[position]
    x_pt = x_pct * width_pt
    y_pt = height_pt - y_pct * height_pt

    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=(width_pt, height_pt))
    if content == "image":
        iw, ih = _image_size(image_data)
        w_pt = width_pt * max_width_pct
        h_pt = w_pt * ih / iw
        _draw_aligned_image(c, ImageReader(io.BytesIO(image_data)), x_pt, y_pt, w_pt, h_pt, h_align, v_align)
    else:
        c.setFont("Helvetica", font_size)
        c.setFillColor(_hex_to_rgb_color(Color, color))
        _draw_aligned_text(c, text, x_pt, y_pt, h_align, v_align, font_size)
    c.save()
    return buf.getvalue()


def _hex_to_rgb_color(Color, hex_color: str):
    h = (hex_color or "#000000").lstrip("#")
    if len(h) != 6:
        return Color(0, 0, 0)
    try:
        return Color(int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255)
    except ValueError:
        return Color(0, 0, 0)


def run(params: dict, progress: ProgressFn) -> dict:
    import pikepdf

    src = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))
    mode = one_of(params, "mode", MODES)
    pages_spec = str(params.get("pages", "all"))

    progress(5, f"Reading {src.name}")

    with open_pdf(src) as pdf:
        total = len(pdf.pages)
        target_pages = _resolve_pages(pages_spec, total)

        if mode == "watermark":
            spec = require(params, "watermark")
            one_of(spec, "content", CONTENT_KINDS)
            one_of(spec, "placement", PLACEMENTS, default="single")
            _opacity(spec.get("opacity", 1.0))
        elif mode == "page_numbers":
            spec = require(params, "page_numbers")
            one_of(spec, "position", PAGE_NUMBER_POSITIONS)
            one_of(spec, "format", FORMATS)
        else:
            spec = require(params, "stamp")
            one_of(spec, "content", CONTENT_KINDS)
            one_of(spec, "position", STAMP_POSITIONS)

        done = 0
        for number, page_index in enumerate(target_pages, start=int(params.get("page_numbers", {}).get("start", 1)) if mode == "page_numbers" else 0):
            page = pdf.pages[page_index]
            box = [float(v) for v in page.mediabox]
            width_pt = abs(box[2] - box[0])
            height_pt = abs(box[3] - box[1])

            if mode == "watermark":
                overlay_bytes = _build_watermark_overlay(spec, width_pt, height_pt)
            elif mode == "page_numbers":
                fmt = spec["format"]
                text = str(number) if fmt == "n" else f"Page {number}" if fmt == "page-n" else f"{number} of {len(target_pages)}"
                overlay_bytes = _build_positioned_overlay(
                    width_pt, height_pt, spec["position"], "text", text,
                    float(spec.get("font_size", 11)), str(spec.get("color", "#000000")), None, 0.0,
                )
            else:
                content = spec["content"]
                image_data = _decode_image(spec.get("image_b64")) if content == "image" else None
                text = spec.get("text")
                if content == "text" and (not isinstance(text, str) or not text):
                    raise OpError("BAD_PARAMS", "'text' is required when content is 'text'")
                overlay_bytes = _build_positioned_overlay(
                    width_pt, height_pt, spec["position"], content, text,
                    float(spec.get("font_size", 24)), str(spec.get("color", "#000000")),
                    image_data, float(spec.get("max_width_pct", 0.2)),
                )

            with pikepdf.open(io.BytesIO(overlay_bytes)) as overlay_pdf:
                page.add_overlay(
                    overlay_pdf.pages[0],
                    pikepdf.Rectangle(box[0], box[1], box[2], box[3]),
                    shrink=False,
                    expand=False,
                )

            done += 1
            progress(5 + int(85 * done / len(target_pages)), f"page {page_index + 1}")

        progress(92, "Writing output")
        with atomic_output(dest) as tmp:
            pdf.save(str(tmp))

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest), "pages": total, "pages_affected": len(target_pages)}
