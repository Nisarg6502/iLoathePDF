"""`pdf.sign` -- stamp signatures, initials, free text and dates onto a PDF.

Placement arrives as percentages of each page's own box (top-left origin,
0..1), the same convention the React canvas and the website's browser
engine both use, so the baking math below is identical to
`apps/web/src/engines/sign.ts`'s. For each page that has elements, a
single-page overlay is built with reportlab (sized to that page's own
mediabox) and merged on top of the original content with
`pikepdf.Page.add_overlay` -- nothing about the source page's existing
content is touched.
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
    open_pdf,
    require,
    size_of,
)

IMAGE_KINDS = ("signature", "initials")
TEXT_KINDS = ("text", "date")


def _pct(el: dict, key: str) -> float:
    value = el.get(key)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise OpError("BAD_PARAMS", f"Element field '{key}' must be a number, got {value!r}")
    if not 0 <= value <= 1.0001:
        raise OpError("BAD_PARAMS", f"Element field '{key}' must be between 0 and 1, got {value!r}")
    return float(value)


def _validate(elements: object, page_count: int) -> list[dict]:
    if not isinstance(elements, list) or not elements:
        raise OpError("BAD_PARAMS", "'elements' must be a non-empty list")
    out: list[dict] = []
    for raw in elements:
        if not isinstance(raw, dict):
            raise OpError("BAD_PARAMS", "Each element must be an object")
        page = raw.get("page")
        if not isinstance(page, int) or isinstance(page, bool) or not 0 <= page < page_count:
            raise OpError("BAD_PARAMS", f"Element targets page {page!r}, but the PDF has {page_count} pages")
        kind = raw.get("kind")
        if kind not in IMAGE_KINDS + TEXT_KINDS:
            raise OpError("BAD_PARAMS", f"Unknown element kind {kind!r}")
        el = {
            "page": page,
            "kind": kind,
            "x_pct": _pct(raw, "x_pct"),
            "y_pct": _pct(raw, "y_pct"),
            "w_pct": _pct(raw, "w_pct"),
            "h_pct": _pct(raw, "h_pct"),
        }
        if kind in IMAGE_KINDS:
            image_b64 = raw.get("image_b64")
            if not isinstance(image_b64, str) or not image_b64:
                raise OpError("BAD_PARAMS", f"'{kind}' element is missing 'image_b64'")
            el["image_b64"] = image_b64
        else:
            text = raw.get("text")
            if not isinstance(text, str) or not text:
                raise OpError("BAD_PARAMS", f"'{kind}' element is missing 'text'")
            font_size = raw.get("font_size", 16)
            if not isinstance(font_size, (int, float)) or isinstance(font_size, bool) or font_size <= 0:
                raise OpError("BAD_PARAMS", f"'font_size' must be a positive number, got {font_size!r}")
            el["text"] = text
            el["font_size"] = float(font_size)
            el["color"] = str(raw.get("color") or "#000000")
        out.append(el)
    return out


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return (0.0, 0.0, 0.0)
    try:
        return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255)
    except ValueError:
        return (0.0, 0.0, 0.0)


def _build_overlay_bytes(elements: list[dict], width_pt: float, height_pt: float) -> bytes:
    from reportlab.lib.colors import Color
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as pdfcanvas

    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=(width_pt, height_pt))

    for el in elements:
        x_pt = el["x_pct"] * width_pt
        box_top_pt = height_pt - el["y_pct"] * height_pt
        box_h_pt = el["h_pct"] * height_pt
        y_pt = box_top_pt - box_h_pt
        w_pt = el["w_pct"] * width_pt

        if el["kind"] in IMAGE_KINDS:
            image_bytes = base64.b64decode(el["image_b64"])
            reader = ImageReader(io.BytesIO(image_bytes))
            c.drawImage(reader, x_pt, y_pt, width=w_pt, height=box_h_pt, mask="auto", preserveAspectRatio=False)
        else:
            size = max(4.0, el["font_size"])
            baseline_y = y_pt + max(0.0, (box_h_pt - size) / 2) + size * 0.18
            c.setFont("Helvetica", size)
            c.setFillColor(Color(*_hex_to_rgb(el["color"])))
            c.drawString(x_pt, baseline_y, el["text"])

    c.save()
    return buf.getvalue()


def run(params: dict, progress: ProgressFn) -> dict:
    path = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))

    import pikepdf

    with open_pdf(path) as src:
        total = len(src.pages)
        elements = _validate(require(params, "elements"), total)

        by_page: dict[int, list[dict]] = {}
        for el in elements:
            by_page.setdefault(el["page"], []).append(el)

        progress(5, f"Placing {len(elements)} element(s)")
        pages_done = 0
        for page_index, page_elements in by_page.items():
            page = src.pages[page_index]
            box = [float(v) for v in page.mediabox]
            width_pt = abs(box[2] - box[0])
            height_pt = abs(box[3] - box[1])

            overlay_bytes = _build_overlay_bytes(page_elements, width_pt, height_pt)
            with pikepdf.open(io.BytesIO(overlay_bytes)) as overlay_pdf:
                page.add_overlay(
                    overlay_pdf.pages[0],
                    pikepdf.Rectangle(box[0], box[1], box[2], box[3]),
                    shrink=False,
                    expand=False,
                )

            pages_done += 1
            progress(5 + int(85 * pages_done / len(by_page)), f"page {page_index + 1}")

        progress(92, "Writing output")
        with atomic_output(dest) as tmp:
            try:
                src.save(str(tmp))
            except OSError as exc:
                raise OpError("OUTPUT_WRITE_FAILED", f"Cannot write {dest}: {exc}") from exc

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest), "pages": total, "elements": len(elements)}
