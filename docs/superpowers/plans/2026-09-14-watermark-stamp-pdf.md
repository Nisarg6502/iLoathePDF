# Watermark, Page Numbers & Stamp PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Watermark, Page Numbers & Stamp PDF" tool (three modes: repeating watermark, sequential page numbers, fixed stamp) to both the desktop app and the website.

**Architecture:** One new sidecar op `pdf.watermark` (Python, pikepdf + reportlab, mirroring `pdf.sign`'s overlay-and-merge technique) on desktop, and one new engine `watermarkEngine` (TypeScript, pdf-lib's native `drawText`/`drawImage` with `rotate`/`opacity` options) on the website. Both compute a rotation-and-alignment anchor per mode rather than accepting freeform coordinates — this is a form-driven tool like Compress/Split, not a canvas tool like Sign & Fill.

**Tech Stack:** Python 3.11 + pikepdf + reportlab (desktop sidecar), TypeScript/React 19 + pdf-lib (web), TypeScript/React 19 + Tauri invoke (desktop UI).

## Global Constraints

- Op name: `pdf.watermark`. Design: `docs/superpowers/specs/2026-09-14-watermark-stamp-pdf-design.md`.
- Params (desktop, exact shape):
  ```json
  {
    "input": "a.pdf", "output": "out.pdf",
    "mode": "watermark|page_numbers|stamp",
    "pages": "all|first|1-3,5",
    "watermark": {
      "content": "text|image", "text": "CONFIDENTIAL", "image_b64": "...",
      "font_size": 48, "color": "#888888",
      "opacity": 0.35, "rotation": 45, "placement": "single|tiled"
    },
    "page_numbers": {
      "position": "bottom-center", "format": "n|page-n|n-of-total",
      "start": 1, "font_size": 11, "color": "#000000"
    },
    "stamp": {
      "content": "text|image", "text": "APPROVED", "image_b64": "...",
      "position": "bottom-right", "font_size": 24, "max_width_pct": 0.2
    }
  }
  ```
  Only the sub-object matching `mode` is required; the other two are ignored if present.
- Result: `{"output": str, "bytes": int, "pages": int, "pages_affected": int}`.
- `pages`: `"all"` (every page), `"first"` (page 0 only), or a custom range in the existing `1-3,5` grammar (`parse_pages` in `_common.py` / `parseRanges` on the web) — no new range syntax.
- Page-number positions (6): `top-left, top-center, top-right, bottom-left, bottom-center, bottom-right`. Stamp positions (9): those 6 plus `left, center, right` (the middle row).
- Watermark has no `position` field — it is always centered (`placement: "single"`) or tiled in a fixed 3×4 grid (`placement: "tiled"`), never one of the 9 named positions.
- Rotation applies only to Watermark. Page Numbers and Stamp are never rotated.
- Anchor convention (both engines, matches `pdf.sign`'s existing top-left-origin `y_pct` convention): the anchor point is the content's own drawing origin (bottom-left for unrotated text/images; the point everything extends from and rotates around for the watermark). This is deliberately simple — not "centered bounding box" — and is how both reportlab and pdf-lib naturally rotate, so the two engines produce visually consistent output without extra alignment math.
- New tint key `"j"` (hue 53, the largest remaining gap once `"i"` — added by the concurrent Protect & Unlock branch — is accounted for) on both apps. **This branch was cut from `main` before Protect & Unlock merged, so `main` does not have tint `"i"` yet.** Before starting Tasks 3/4 (UI wiring), rebase this branch onto the latest `main` if Protect & Unlock has merged by then, so the tint files start from a consistent base; if it hasn't merged yet, add `"j"` after whatever the last existing letter is (`"h"` or `"i"`) — the exact letter used doesn't matter as long as it's unused and consistently applied.
- Tool count copy: **do not hardcode a specific number** in this plan's steps. At Task 5 implementation time, count the entries in `apps/web/src/tools/registry.tsx`'s `TOOLS` array *after* this branch's own entry is added, and set every hardcoded tool-count string in **both** apps (`apps/web/src/pages/Home.tsx`, `apps/web/src/pages/ToolsIndex.tsx`, `apps/web/src/components/layout/SiteFooter.tsx`, `apps/web/src/pages/Download.tsx`, `README.md`, and — this is the one a previous feature's final review caught missing — **`apps/desktop/src/routes/Home.tsx`**) to match that count, spelled out as a word. Search both apps with `grep -rn "\b[a-z]*[Nn]ine\b\|\b[a-z]*[Tt]en\b\|TOOLS ·" apps/*/src -i` (or whatever the actual current number-word is) rather than assuming which word is currently live.

---

### Task 1: Desktop sidecar op `pdf.watermark`

**Files:**
- Create: `apps/desktop/sidecar/ops/pdf_watermark.py`
- Modify: `apps/desktop/sidecar/main.py:26-37` (DISPATCH table)
- Modify: `apps/desktop/sidecar/PROTOCOL.md`
- Create: `apps/desktop/sidecar/tests/test_pdf_watermark.py`

**Interfaces:**
- Consumes: `_common.py`'s `require`, `one_of`, `existing_file`, `open_pdf`, `atomic_output`, `parse_pages`, `size_of`, `OpError`, `ProgressFn` (all already exist — see `apps/desktop/sidecar/ops/_common.py`).
- Produces: `ops.pdf_watermark.run(params: dict, progress: ProgressFn) -> dict`, registered in `main.py`'s `DISPATCH` under op name `"pdf.watermark"`. Result shape: `{"output": str, "bytes": int, "pages": int, "pages_affected": int}`.
- Independent of Task 2 (web) and Task 4 (desktop UI, which only needs the frozen contract above) — no shared files, safe to run in parallel with both.

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/sidecar/tests/test_pdf_watermark.py`:

```python
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
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd apps/desktop && .venv\Scripts\python.exe -m pytest sidecar/tests/test_pdf_watermark.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ops.pdf_watermark'`

- [ ] **Step 3: Implement `pdf_watermark.py`**

Create `apps/desktop/sidecar/ops/pdf_watermark.py`:

```python
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
    if spec == "first":
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

    from ._common import size_of  # noqa: F401 (keeps import group simple; unused here, harmless)

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

    for cx, cy in pivots:
        c.saveState()
        c.translate(cx, cy)
        c.rotate(rotation)
        c.setFillAlpha(opacity)
        if spec.get("content") == "image":
            data = _decode_image(spec.get("image_b64"))
            iw, ih = _image_size(data)
            w_pt = width_pt * 0.3
            h_pt = w_pt * ih / iw
            c.drawImage(ImageReader(io.BytesIO(data)), 0, 0, width=w_pt, height=h_pt, mask="auto")
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
```

- [ ] **Step 4: Run to confirm it passes**

Run: `cd apps/desktop && .venv\Scripts\python.exe -m pytest sidecar/tests/test_pdf_watermark.py -v`
Expected: PASS (19 tests)

Run the full sidecar suite: `cd apps/desktop && .venv\Scripts\python.exe -m pytest`
Expected: PASS, all tests (existing + new)

- [ ] **Step 5: Register the op in `main.py`**

In `apps/desktop/sidecar/main.py`, add a line to the `DISPATCH` dict (after the `"pdf.protect"` entry if Task 1 of the Protect & Unlock branch already merged into this branch's history, otherwise after `"pdf.sign"`):

```python
    "pdf.watermark": "ops.pdf_watermark:run",
```

- [ ] **Step 6: Update the frozen protocol doc**

In `apps/desktop/sidecar/PROTOCOL.md`, add a new operation section (after the last existing operation section, before `## Page range spec`):

````markdown
### `pdf.watermark`
params:
```json
{"input": "a.pdf", "output": "out.pdf",
 "mode": "watermark|page_numbers|stamp", "pages": "all|first|1-3,5",
 "watermark": {"content": "text|image", "text": "CONFIDENTIAL", "image_b64": "...",
   "font_size": 48, "color": "#888888", "opacity": 0.35, "rotation": 45, "placement": "single|tiled"},
 "page_numbers": {"position": "bottom-center", "format": "n|page-n|n-of-total",
   "start": 1, "font_size": 11, "color": "#000000"},
 "stamp": {"content": "text|image", "text": "APPROVED", "image_b64": "...",
   "position": "bottom-right", "font_size": 24, "max_width_pct": 0.2}}
```
Only the sub-object matching `mode` is required. `pages` selects which pages
are affected: `all`, `first` (page 1 only), or a page-range spec (see "Page
range spec" below). `watermark` draws either centered once (`placement:
"single"`) or in a fixed 3x4 repeating grid (`"tiled"`), rotated by
`rotation` degrees and faded by `opacity` (0..1). `page_numbers` positions
are one of `top-left, top-center, top-right, bottom-left, bottom-center,
bottom-right`; `format` is `n` ("1"), `page-n` ("Page 1") or `n-of-total`
("1 of 12", where the total is the count of *selected* pages, not the whole
document); numbering starts at `start` on the first selected page and
increments by 1 per selected page. `stamp` positions add three more
(`left`, `center`, `right` -- the middle row) to page numbers' six, and
places identical content on every selected page. `max_width_pct` (stamp
images only) is the image's max width as a fraction of page width, aspect
ratio preserved.
result: `{"output": "...", "bytes": 4096, "pages": 12, "pages_affected": 10}`
````

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/sidecar/ops/pdf_watermark.py apps/desktop/sidecar/main.py apps/desktop/sidecar/PROTOCOL.md apps/desktop/sidecar/tests/test_pdf_watermark.py
git commit -m "feat(desktop): add pdf.watermark sidecar op (watermark, page numbers, stamp)"
```

---

### Task 2: Web engine `watermarkEngine`

**Files:**
- Create: `apps/web/src/engines/watermark.ts`
- Create: `apps/web/src/engines/watermark.test.ts`

**Interfaces:**
- Consumes: `Engine`, `EngineInput`, `EngineResult` from `./types` (existing, unchanged); `parseRanges` from `@/lib/ranges` (existing, unchanged).
- Produces: `watermarkEngine: Engine` from `apps/web/src/engines/watermark.ts`, reading `options.mode` (`"watermark"|"page_numbers"|"stamp"`), `options.pages` (`"all"|"first"|"1-3,5"`), and `options.watermark`/`options.page_numbers`/`options.stamp` sub-objects matching the desktop param shape (camelCase kept as-is in the nested objects since they cross into JS naming only at the top level — see Step 3's exact field names). Task 3 imports this exact export.
- Independent of Task 1 (desktop) and Task 4 (desktop UI) — different language, different repo area. Task 3 needs this task done first (its import must resolve), so land this before starting Task 3.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/engines/watermark.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { watermarkEngine } from "./watermark";
import { makeTestPdf, makeTestPng } from "./testHelpers";

async function toFile(bytes: Uint8Array, name = "in.pdf") {
  return new File([bytes as BlobPart], name, { type: "application/pdf" });
}

function pngDataUrl(): string {
  const bytes = makeTestPng();
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(binary)}`;
}

describe("watermarkEngine", () => {
  it("watermark: draws single centered text on every page", async () => {
    const file = await toFile(await makeTestPdf(3));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "watermark", pages: "all",
        watermark: { content: "text", text: "CONFIDENTIAL", fontSize: 48, color: "#888888",
                    opacity: 0.35, rotation: 45, placement: "single" },
      },
    });
    expect(result.files).toHaveLength(1);
    expect(result.isPreview).toBe(false);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
  });

  it("watermark: tiled placement produces a larger file than single", async () => {
    const single = await toFile(await makeTestPdf(1));
    const tiled = await toFile(await makeTestPdf(1));
    const base = { content: "text" as const, text: "X", fontSize: 24, color: "#888888", opacity: 0.35, rotation: 45 };

    const singleResult = await watermarkEngine({
      files: [single],
      options: { mode: "watermark", pages: "all", watermark: { ...base, placement: "single" } },
    });
    const tiledResult = await watermarkEngine({
      files: [tiled],
      options: { mode: "watermark", pages: "all", watermark: { ...base, placement: "tiled" } },
    });
    expect(tiledResult.files[0].blob.size).toBeGreaterThan(singleResult.files[0].blob.size);
  });

  it("watermark: image content embeds without error", async () => {
    const file = await toFile(await makeTestPdf(1));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "watermark", pages: "all",
        watermark: { content: "image", imageDataUrl: pngDataUrl(), opacity: 0.5, rotation: 0, placement: "single" },
      },
    });
    expect(result.files).toHaveLength(1);
  });

  it("watermark: respects a custom page range", async () => {
    const file = await toFile(await makeTestPdf(5));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "watermark", pages: "2-3",
        watermark: { content: "text", text: "DRAFT", fontSize: 24, color: "#888888",
                    opacity: 0.35, rotation: 45, placement: "single" },
      },
    });
    expect(result.summary).toMatch(/2/);
  });

  it("watermark: rejects a missing text when content is text", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      watermarkEngine({
        files: [file],
        options: { mode: "watermark", pages: "all",
                  watermark: { content: "text", fontSize: 24, color: "#888888", opacity: 0.35, rotation: 45, placement: "single" } },
      }),
    ).rejects.toThrow();
  });

  it("page_numbers: applies to every selected page and reports the count", async () => {
    const file = await toFile(await makeTestPdf(3));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "page_numbers", pages: "all",
        page_numbers: { position: "bottom-center", format: "n-of-total", start: 1, fontSize: 11, color: "#000000" },
      },
    });
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
    expect(result.summary).toMatch(/3/);
  });

  it("page_numbers: rejects a stamp-only position", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      watermarkEngine({
        files: [file],
        options: { mode: "page_numbers", pages: "all",
                  page_numbers: { position: "center", format: "n", start: 1, fontSize: 11, color: "#000000" } },
      }),
    ).rejects.toThrow();
  });

  it("stamp: text at the center position", async () => {
    const file = await toFile(await makeTestPdf(2));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "stamp", pages: "all",
        stamp: { content: "text", text: "APPROVED", position: "center", fontSize: 24 },
      },
    });
    expect(result.files).toHaveLength(1);
  });

  it("stamp: image at bottom-right, scaled by maxWidthPct", async () => {
    const file = await toFile(await makeTestPdf(1));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "stamp", pages: "all",
        stamp: { content: "image", imageDataUrl: pngDataUrl(), position: "bottom-right", maxWidthPct: 0.2 },
      },
    });
    expect(result.files).toHaveLength(1);
  });

  it("stamp: rejects an unknown position", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      watermarkEngine({
        files: [file],
        options: { mode: "stamp", pages: "all",
                  stamp: { content: "text", text: "X", position: "diagonal", fontSize: 24 } },
      }),
    ).rejects.toThrow();
  });

  it("rejects an unknown mode", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      watermarkEngine({ files: [file], options: { mode: "underline", pages: "all" } }),
    ).rejects.toThrow();
  });

  it("rejects an out-of-range custom page spec", async () => {
    const file = await toFile(await makeTestPdf(3));
    await expect(
      watermarkEngine({
        files: [file],
        options: { mode: "watermark", pages: "1-99",
                  watermark: { content: "text", text: "X", fontSize: 24, color: "#888888",
                              opacity: 0.35, rotation: 45, placement: "single" } },
      }),
    ).rejects.toThrow();
  });

  it("rejects an empty file list", async () => {
    await expect(
      watermarkEngine({
        files: [],
        options: { mode: "watermark", pages: "all",
                  watermark: { content: "text", text: "X", fontSize: 24, color: "#888888",
                              opacity: 0.35, rotation: 45, placement: "single" } },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm run test --workspace=apps/web -- watermark.test.ts`
Expected: FAIL — `Cannot find module './watermark'`

- [ ] **Step 3: Implement `watermark.ts`**

Create `apps/web/src/engines/watermark.ts`:

```ts
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { parseRanges } from "@/lib/ranges";
import type { Engine } from "./types";

type ContentKind = "text" | "image";
type Placement = "single" | "tiled";
type PageNumberFormat = "n" | "page-n" | "n-of-total";

interface WatermarkSpec {
  content: ContentKind; text?: string; imageDataUrl?: string;
  fontSize?: number; color?: string; opacity: number; rotation: number; placement: Placement;
}
interface PageNumbersSpec {
  position: string; format: PageNumberFormat; start: number; fontSize?: number; color?: string;
}
interface StampSpec {
  content: ContentKind; text?: string; imageDataUrl?: string; position: string;
  fontSize?: number; color?: string; maxWidthPct?: number;
}

// name -> [xPct, yPct, hAlign, vAlign], same top-left-origin convention pdf.sign already uses.
const ALL_POSITIONS: Record<string, [number, number, "left" | "center" | "right", "top" | "middle" | "bottom"]> = {
  "top-left": [0.05, 0.05, "left", "top"],
  "top-center": [0.5, 0.05, "center", "top"],
  "top-right": [0.95, 0.05, "right", "top"],
  left: [0.05, 0.5, "left", "middle"],
  center: [0.5, 0.5, "center", "middle"],
  right: [0.95, 0.5, "right", "middle"],
  "bottom-left": [0.05, 0.95, "left", "bottom"],
  "bottom-center": [0.5, 0.95, "center", "bottom"],
  "bottom-right": [0.95, 0.95, "right", "bottom"],
};
const PAGE_NUMBER_POSITIONS = Object.keys(ALL_POSITIONS).filter((p) => !["left", "center", "right"].includes(p));
const STAMP_POSITIONS = Object.keys(ALL_POSITIONS);
const TILE_COLS = 3;
const TILE_ROWS = 4;

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((hex || "#000000").trim());
  if (!m) return rgb(0, 0, 0);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function resolvePages(spec: string, pageCount: number): number[] {
  if (spec === "all") return Array.from({ length: pageCount }, (_, i) => i);
  if (spec === "first") return [0];
  return parseRanges(spec, pageCount);
}

/** x/y of the content's own drawing anchor (bottom-left before rotation), aligned per h/vAlign. */
function alignedXY(
  xPct: number, yPct: number, pageW: number, pageH: number,
  hAlign: "left" | "center" | "right", vAlign: "top" | "middle" | "bottom",
  contentW: number, contentH: number,
): { x: number; y: number } {
  const anchorX = xPct * pageW;
  const anchorY = pageH - yPct * pageH;
  const x = hAlign === "left" ? anchorX : hAlign === "right" ? anchorX - contentW : anchorX - contentW / 2;
  const y = vAlign === "bottom" ? anchorY : vAlign === "top" ? anchorY - contentH : anchorY - contentH / 2;
  return { x, y };
}

export const watermarkEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF.");

  const mode = options.mode as string;
  if (!["watermark", "page_numbers", "stamp"].includes(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const targetIndices = resolvePages((options.pages as string) ?? "all", pages.length);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  if (mode === "watermark") {
    const spec = options.watermark as WatermarkSpec;
    if (!spec.placement || !["single", "tiled"].includes(spec.placement)) {
      throw new Error(`Unknown placement: ${spec.placement}`);
    }
    let image: Awaited<ReturnType<typeof doc.embedPng>> | undefined;
    if (spec.content === "image") {
      if (!spec.imageDataUrl) throw new Error("Add an image for the watermark.");
      image = await doc.embedPng(dataUrlToBytes(spec.imageDataUrl));
    } else if (!spec.text) {
      throw new Error("Add watermark text.");
    }

    for (const pageIndex of targetIndices) {
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      const pivots: [number, number][] =
        spec.placement === "tiled"
          ? Array.from({ length: TILE_ROWS }, (_, row) =>
              Array.from({ length: TILE_COLS }, (_, col) => [
                (col + 0.5) * (width / TILE_COLS),
                (row + 0.5) * (height / TILE_ROWS),
              ] as [number, number]),
            ).flat()
          : [[width / 2, height / 2]];

      for (const [x, y] of pivots) {
        if (image) {
          const w = width * 0.3;
          const h = (w * image.height) / image.width;
          page.drawImage(image, { x, y, width: w, height: h, rotate: degrees(spec.rotation), opacity: spec.opacity });
        } else {
          page.drawText(spec.text!, {
            x, y, size: Math.max(4, spec.fontSize ?? 48), font,
            color: hexToRgb(spec.color ?? "#888888"),
            rotate: degrees(spec.rotation), opacity: spec.opacity,
          });
        }
      }
    }
  } else if (mode === "page_numbers") {
    const spec = options.page_numbers as PageNumbersSpec;
    if (!PAGE_NUMBER_POSITIONS.includes(spec.position)) {
      throw new Error(`Unknown position for page numbers: ${spec.position}`);
    }
    if (!["n", "page-n", "n-of-total"].includes(spec.format)) {
      throw new Error(`Unknown page number format: ${spec.format}`);
    }
    const [xPct, yPct, hAlign, vAlign] = ALL_POSITIONS[spec.position];
    const size = Math.max(4, spec.fontSize ?? 11);
    targetIndices.forEach((pageIndex, i) => {
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      const n = (spec.start ?? 1) + i;
      const text =
        spec.format === "n" ? String(n) : spec.format === "page-n" ? `Page ${n}` : `${n} of ${targetIndices.length}`;
      const textWidth = font.widthOfTextAtSize(text, size);
      const { x, y } = alignedXY(xPct, yPct, width, height, hAlign, vAlign, textWidth, size);
      page.drawText(text, { x, y, size, font, color: hexToRgb(spec.color ?? "#000000") });
    });
  } else {
    const spec = options.stamp as StampSpec;
    if (!STAMP_POSITIONS.includes(spec.position)) {
      throw new Error(`Unknown stamp position: ${spec.position}`);
    }
    const [xPct, yPct, hAlign, vAlign] = ALL_POSITIONS[spec.position];
    let image: Awaited<ReturnType<typeof doc.embedPng>> | undefined;
    if (spec.content === "image") {
      if (!spec.imageDataUrl) throw new Error("Add a stamp image.");
      image = await doc.embedPng(dataUrlToBytes(spec.imageDataUrl));
    } else if (!spec.text) {
      throw new Error("Add stamp text.");
    }
    for (const pageIndex of targetIndices) {
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      if (image) {
        const w = width * (spec.maxWidthPct ?? 0.2);
        const h = (w * image.height) / image.width;
        const { x, y } = alignedXY(xPct, yPct, width, height, hAlign, vAlign, w, h);
        page.drawImage(image, { x, y, width: w, height: h });
      } else {
        const size = Math.max(4, spec.fontSize ?? 24);
        const textWidth = font.widthOfTextAtSize(spec.text!, size);
        const { x, y } = alignedXY(xPct, yPct, width, height, hAlign, vAlign, textWidth, size);
        page.drawText(spec.text!, { x, y, size, font, color: hexToRgb(spec.color ?? "#000000") });
      }
    }
  }

  const outBytes = await doc.save();
  return {
    files: [
      {
        name: file.name.replace(/\.pdf$/i, `-${mode}.pdf`),
        blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }),
      },
    ],
    summary: `${targetIndices.length} page${targetIndices.length === 1 ? "" : "s"} affected`,
    isPreview: false,
  };
};
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npm run test --workspace=apps/web -- watermark.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Run the full web test suite and typecheck**

Run: `npm run test --workspace=apps/web`
Expected: PASS, all tests

Run: `npm run typecheck --workspace=apps/web`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/engines/watermark.ts apps/web/src/engines/watermark.test.ts
git commit -m "feat(web): add watermark/page-numbers/stamp PDF engine"
```

---

### Task 3: Web UI wiring (depends on Task 2)

**Files:**
- Modify: `apps/web/src/tools/tint.ts`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/tools/icons.tsx`
- Create: `apps/web/src/tools/options/WatermarkOptions.tsx`
- Modify: `apps/web/src/tools/registry.tsx`

**Interfaces:**
- Consumes: `watermarkEngine` from `@/engines/watermark` (Task 2), `ToolConfig`/`OptionsPanelProps` from `./ToolConfig` (existing, unchanged).
- Produces: nothing consumed elsewhere — `ToolDetail.tsx` renders any `TOOLS` entry generically.
- Run only after Task 2 lands.

- [ ] **Step 1: Add the tint key**

Check `apps/web/src/tools/tint.ts` first — if this branch has been rebased onto a `main` that already merged Protect & Unlock, the union will already include `"i"`; add `"j"` after whichever letter is last. If it's still `"a"..."h"`, add `"j"` directly after `"h"` (skip `"i"`, reserved by the other branch, to reduce merge-conflict risk):

```ts
export type TintKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "j"; // (or "...| "i" | "j"" if already rebased)
```

- [ ] **Step 2: Add the tint CSS variables**

In `apps/web/src/index.css`, add a `--tint-j` line (hue 53) immediately after the last existing `--tint-*` line in each of the four blocks (light base, light `-btn`, dark base, dark `-btn`):

```css
  --tint-j: oklch(0.575 0.145 53);
```
```css
  --tint-j-btn: oklch(0.5 0.145 53);
```
```css
  --tint-j: oklch(0.8 0.125 53);
```
```css
  --tint-j-btn: var(--tint-j);
```

- [ ] **Step 3: Add the icon**

In `apps/web/src/tools/icons.tsx`, add at the end of the file:

```tsx
export function WatermarkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-j)" strokeWidth="1.5" {...props}>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.2" />
      <path d="M6 12.5L12 5.5" strokeOpacity="0.5" />
      <path d="M9 9.5v-4M9 5.5l-1.3 1.3M9 5.5l1.3 1.3" strokeOpacity="0.5" />
    </svg>
  );
}
```

- [ ] **Step 4: Build the options panel**

Create `apps/web/src/tools/options/WatermarkOptions.tsx`:

```tsx
import type { OptionsPanelProps } from "@/tools/ToolConfig";

const MODES = [
  { value: "watermark", label: "Watermark" },
  { value: "page_numbers", label: "Page Numbers" },
  { value: "stamp", label: "Stamp" },
] as const;

const PAGE_NUMBER_POSITIONS = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];
const STAMP_POSITIONS = [...PAGE_NUMBER_POSITIONS, "left", "center", "right"];

function PageRangeField({ options, onChange, disabled }: OptionsPanelProps) {
  const pages = (options.pages as string) ?? "all";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold">Apply to</span>
      <div className="flex gap-1.5">
        {(["all", "first", "custom"] as const).map((p) => (
          <label
            key={p}
            className={`flex-1 cursor-pointer rounded-lg border p-2 text-center text-[12px] ${
              (p === "custom" ? !["all", "first"].includes(pages) : pages === p)
                ? "border-accent bg-accent-soft"
                : "border-border bg-surface-2"
            }`}
          >
            <input
              type="radio"
              name="watermark-pages"
              className="sr-only"
              disabled={disabled}
              checked={p === "custom" ? !["all", "first"].includes(pages) : pages === p}
              onChange={() => onChange({ ...options, pages: p === "custom" ? "1" : p })}
            />
            {p === "all" ? "All pages" : p === "first" ? "First page only" : "Custom"}
          </label>
        ))}
      </div>
      {!["all", "first"].includes(pages) && (
        <input
          type="text"
          disabled={disabled}
          value={pages}
          onChange={(e) => onChange({ ...options, pages: e.target.value })}
          placeholder="1-3,5"
          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
        />
      )}
    </div>
  );
}

export function WatermarkOptions(props: OptionsPanelProps) {
  const { options, onChange, disabled } = props;
  const mode = (options.mode as string) ?? "watermark";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`flex-1 cursor-pointer rounded-lg border p-2 text-center text-[12px] ${mode === m.value ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
          >
            <input
              type="radio"
              name="watermark-mode"
              className="sr-only"
              disabled={disabled}
              checked={mode === m.value}
              onChange={() => onChange({ ...options, mode: m.value })}
            />
            {m.label}
          </label>
        ))}
      </div>

      <PageRangeField {...props} />

      {mode === "watermark" && (
        <WatermarkFields options={options} onChange={onChange} disabled={disabled} />
      )}
      {mode === "page_numbers" && (
        <PageNumberFields options={options} onChange={onChange} disabled={disabled} />
      )}
      {mode === "stamp" && (
        <StampFields options={options} onChange={onChange} disabled={disabled} />
      )}
    </div>
  );
}

function ContentToggle({
  content, onSetContent, disabled,
}: { content: string; onSetContent: (c: string) => void; disabled: boolean }) {
  return (
    <div className="flex gap-1.5">
      {(["text", "image"] as const).map((c) => (
        <label
          key={c}
          className={`flex-1 cursor-pointer rounded-lg border p-1.5 text-center text-[12px] capitalize ${content === c ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
        >
          <input type="radio" name="content-kind" className="sr-only" disabled={disabled} checked={content === c} onChange={() => onSetContent(c)} />
          {c}
        </label>
      ))}
    </div>
  );
}

function WatermarkFields({ options, onChange, disabled }: OptionsPanelProps) {
  const wm = (options.watermark as Record<string, unknown>) ?? {};
  const set = (patch: Record<string, unknown>) => onChange({ ...options, watermark: { ...wm, ...patch } });
  const content = (wm.content as string) ?? "text";

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <ContentToggle content={content} onSetContent={(c) => set({ content: c })} disabled={!!disabled} />
      {content === "text" ? (
        <>
          <input
            type="text" disabled={disabled} placeholder="CONFIDENTIAL"
            value={(wm.text as string) ?? ""}
            onChange={(e) => set({ text: e.target.value })}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <label className="flex flex-1 items-center justify-between text-[12.5px]">
              Font size
              <input type="number" min={4} disabled={disabled}
                value={(wm.fontSize as number) ?? 48}
                onChange={(e) => set({ fontSize: Number(e.target.value) })}
                className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-[12.5px]">
              Color
              <input type="color" disabled={disabled}
                value={(wm.color as string) ?? "#888888"}
                onChange={(e) => set({ color: e.target.value })}
                className="h-7 w-10 rounded border border-border bg-surface" />
            </label>
          </div>
        </>
      ) : (
        <ImagePicker disabled={!!disabled} onPick={(dataUrl) => set({ imageDataUrl: dataUrl })} />
      )}
      <label className="flex items-center justify-between text-[12.5px]">
        Opacity
        <input type="range" min={0} max={1} step={0.05} disabled={disabled}
          value={(wm.opacity as number) ?? 0.35}
          onChange={(e) => set({ opacity: Number(e.target.value) })} />
      </label>
      <label className="flex items-center justify-between text-[12.5px]">
        Rotation (degrees)
        <input type="number" disabled={disabled}
          value={(wm.rotation as number) ?? 45}
          onChange={(e) => set({ rotation: Number(e.target.value) })}
          className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
      </label>
      <div className="flex gap-1.5">
        {(["single", "tiled"] as const).map((p) => (
          <label key={p} className={`flex-1 cursor-pointer rounded-lg border p-1.5 text-center text-[12px] capitalize ${((wm.placement as string) ?? "single") === p ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}>
            <input type="radio" name="watermark-placement" className="sr-only" disabled={disabled} checked={((wm.placement as string) ?? "single") === p} onChange={() => set({ placement: p })} />
            {p}
          </label>
        ))}
      </div>
    </div>
  );
}

function PageNumberFields({ options, onChange, disabled }: OptionsPanelProps) {
  const pn = (options.page_numbers as Record<string, unknown>) ?? {};
  const set = (patch: Record<string, unknown>) => onChange({ ...options, page_numbers: { ...pn, ...patch } });

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <select
        disabled={disabled}
        value={(pn.position as string) ?? "bottom-center"}
        onChange={(e) => set({ position: e.target.value })}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
      >
        {PAGE_NUMBER_POSITIONS.map((p) => (
          <option key={p} value={p}>{p.replace("-", " ")}</option>
        ))}
      </select>
      <select
        disabled={disabled}
        value={(pn.format as string) ?? "n"}
        onChange={(e) => set({ format: e.target.value })}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
      >
        <option value="n">1</option>
        <option value="page-n">Page 1</option>
        <option value="n-of-total">1 of N</option>
      </select>
      <label className="flex items-center justify-between text-[12.5px]">
        Starting number
        <input type="number" min={1} disabled={disabled}
          value={(pn.start as number) ?? 1}
          onChange={(e) => set({ start: Number(e.target.value) })}
          className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 items-center justify-between text-[12.5px]">
          Font size
          <input type="number" min={4} disabled={disabled}
            value={(pn.fontSize as number) ?? 11}
            onChange={(e) => set({ fontSize: Number(e.target.value) })}
            className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-[12.5px]">
          Color
          <input type="color" disabled={disabled}
            value={(pn.color as string) ?? "#000000"}
            onChange={(e) => set({ color: e.target.value })}
            className="h-7 w-10 rounded border border-border bg-surface" />
        </label>
      </div>
    </div>
  );
}

function StampFields({ options, onChange, disabled }: OptionsPanelProps) {
  const st = (options.stamp as Record<string, unknown>) ?? {};
  const set = (patch: Record<string, unknown>) => onChange({ ...options, stamp: { ...st, ...patch } });
  const content = (st.content as string) ?? "text";

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <ContentToggle content={content} onSetContent={(c) => set({ content: c })} disabled={!!disabled} />
      {content === "text" ? (
        <>
          <input
            type="text" disabled={disabled} placeholder="APPROVED"
            value={(st.text as string) ?? ""}
            onChange={(e) => set({ text: e.target.value })}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <label className="flex flex-1 items-center justify-between text-[12.5px]">
              Font size
              <input type="number" min={4} disabled={disabled}
                value={(st.fontSize as number) ?? 24}
                onChange={(e) => set({ fontSize: Number(e.target.value) })}
                className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-[12.5px]">
              Color
              <input type="color" disabled={disabled}
                value={(st.color as string) ?? "#000000"}
                onChange={(e) => set({ color: e.target.value })}
                className="h-7 w-10 rounded border border-border bg-surface" />
            </label>
          </div>
        </>
      ) : (
        <ImagePicker disabled={!!disabled} onPick={(dataUrl) => set({ imageDataUrl: dataUrl })} />
      )}
      <select
        disabled={disabled}
        value={(st.position as string) ?? "bottom-right"}
        onChange={(e) => set({ position: e.target.value })}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
      >
        {STAMP_POSITIONS.map((p) => (
          <option key={p} value={p}>{p.replace("-", " ")}</option>
        ))}
      </select>
    </div>
  );
}

function ImagePicker({ onPick, disabled }: { onPick: (dataUrl: string) => void; disabled: boolean }) {
  return (
    <input
      type="file" accept="image/*" disabled={disabled}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => onPick(reader.result as string);
        reader.readAsDataURL(f);
      }}
      className="text-[12.5px]"
    />
  );
}
```

- [ ] **Step 5: Register the tool**

In `apps/web/src/tools/registry.tsx`, add import lines alongside the existing ones:

```tsx
import { WatermarkOptions } from "./options/WatermarkOptions";
import { watermarkEngine } from "@/engines/watermark";
```

Add `WatermarkIcon` to the icon import list from `./icons`.

Add an entry to the `TOOLS` array:

```tsx
  { slug: "watermark", name: "Watermark, Page Numbers & Stamp", description: "Add a repeating watermark, sequential page numbers, or a fixed stamp to every page.", category: "pdf", Icon: WatermarkIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "watermark", pages: "all", watermark: { content: "text", text: "", opacity: 0.35, rotation: 45, placement: "single" }, page_numbers: { position: "bottom-center", format: "n", start: 1 }, stamp: { content: "text", text: "", position: "bottom-right", maxWidthPct: 0.2 } }, OptionsPanel: WatermarkOptions, engine: watermarkEngine, status: "live", tint: "j" },
```

- [ ] **Step 6: Typecheck, test, build**

Run: `npm run typecheck --workspace=apps/web` — no errors
Run: `npm run test --workspace=apps/web` — all pass
Run: `npm run build --workspace=apps/web` — builds cleanly

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/tools/tint.ts apps/web/src/index.css apps/web/src/tools/icons.tsx apps/web/src/tools/options/WatermarkOptions.tsx apps/web/src/tools/registry.tsx
git commit -m "feat(web): wire up the Watermark, Page Numbers & Stamp PDF tool"
```

---

### Task 4: Desktop UI wiring

**Files:**
- Modify: `apps/desktop/src/lib/tools.ts`
- Modify: `apps/desktop/src/lib/jobs.ts`
- Modify: `apps/desktop/src/lib/run.ts`
- Modify: `apps/desktop/src/components/OptionsPanel.tsx`
- Modify: `apps/desktop/src/index.css`

**Interfaces:**
- Consumes: the frozen `pdf.watermark` param/result contract from this plan's Global Constraints — TypeScript-only, typechecks without Task 1's Python code existing.
- Produces: a `"watermark"` entry in `TOOLS`, consumed automatically by the router/Home grid.
- Independent of Tasks 1-3 — different files, different app.

- [ ] **Step 1: Add the tint variant and tool entry to `tools.ts`**

Same rebase caveat as Task 3 Step 1 applies to the `Tint` type union in `apps/desktop/src/lib/tools.ts`.

Add an appropriate icon import from `lucide-react` (e.g. `Stamp` — check it exists in the installed `lucide-react` version; if not, use `Droplet` or another reasonable stand-in and note the substitution in your commit message).

Add a new entry to the `TOOLS` array:

```ts
  {
    id: "watermark",
    path: "/t/watermark",
    title: "Watermark, Page Numbers & Stamp",
    description: "Add a repeating watermark, sequential page numbers, or a fixed stamp to every page.",
    icon: Stamp,
    group: "pdf",
    tint: "j",
    op: "pdf.watermark",
    accepts: ["pdf"],
    acceptsLabel: "a PDF file",
    multiple: false,
    ordered: false,
    action: "Save PDF",
    defaults: {
      mode: "watermark", pages: "all",
      watermarkContent: "text", watermarkText: "", watermarkImageDataUrl: "",
      watermarkFontSize: 48, watermarkColor: "#888888",
      watermarkOpacity: 0.35, watermarkRotation: 45, watermarkPlacement: "single",
      pageNumberPosition: "bottom-center", pageNumberFormat: "n", pageNumberStart: 1,
      pageNumberFontSize: 11, pageNumberColor: "#000000",
      stampContent: "text", stampText: "", stampImageDataUrl: "", stampPosition: "bottom-right",
      stampFontSize: 24, stampColor: "#000000",
    },
  },
```

Note: unlike the web app's nested-object `options`, this desktop app's `OptionValues` type (`apps/desktop/src/lib/tools.ts:26-27`) is `Record<string, OptionValue>` with `OptionValue = string | number | boolean` — **no nested objects allowed**. So the desktop UI flattens every field with a mode prefix (`watermarkOpacity`, `pageNumberPosition`, etc.) as shown above, and `run.ts` (Step 3 below) re-nests them into the `pdf.watermark` op's actual nested JSON shape when building the job params. A data URL is just a (long) string, so `watermarkImageDataUrl`/`stampImageDataUrl` fit this type without any special handling — they're plain string fields exactly like `watermarkText`, populated by a file-to-data-URL picker in Step 4 and converted to `image_b64` in Step 3 via the same `dataUrlToBase64` helper `pdf.sign`'s runner already uses.

- [ ] **Step 2: Add the op to `jobs.ts`**

Add `"pdf.watermark"` to the `OpName` union.

Add params/result types:

```ts
export type WatermarkMode = "watermark" | "page_numbers" | "stamp";
export interface WatermarkSpecParams {
  content?: "text" | "image"; text?: string; image_b64?: string;
  font_size?: number; color?: string; opacity?: number; rotation?: number; placement?: "single" | "tiled";
}
export interface PageNumbersSpecParams {
  position: string; format: "n" | "page-n" | "n-of-total"; start: number; font_size?: number; color?: string;
}
export interface StampSpecParams {
  content: "text" | "image"; text?: string; image_b64?: string; position: string;
  font_size?: number; color?: string; max_width_pct?: number;
}
export interface PdfWatermarkParams {
  input: string; output: string; mode: WatermarkMode; pages: string;
  watermark?: WatermarkSpecParams; page_numbers?: PageNumbersSpecParams; stamp?: StampSpecParams;
}
export interface PdfWatermarkResult { output: string; bytes: number; pages: number; pages_affected: number }
```

Add a line to the `OpMap` interface:

```ts
  "pdf.watermark": [PdfWatermarkParams, PdfWatermarkResult];
```

- [ ] **Step 3: Add the runner case to `run.ts`**

Add a new `case` in the `execute` function's `switch (op)`:

```ts
    case "pdf.watermark": {
      const mode = str("mode", "watermark") as "watermark" | "page_numbers" | "stamp";
      const pages = str("pages", "all");
      const params: import("./jobs").PdfWatermarkParams = {
        input: first.path,
        output: join(`${base}-${mode}.pdf`),
        mode,
        pages,
      };
      if (mode === "watermark") {
        params.watermark = {
          content: str("watermarkContent", "text") as "text" | "image",
          text: str("watermarkText") || undefined,
          image_b64: str("watermarkImageDataUrl") ? dataUrlToBase64(str("watermarkImageDataUrl")) : undefined,
          font_size: num("watermarkFontSize", 48),
          color: str("watermarkColor", "#888888"),
          opacity: num("watermarkOpacity", 0.35),
          rotation: num("watermarkRotation", 45),
          placement: str("watermarkPlacement", "single") as "single" | "tiled",
        };
      } else if (mode === "page_numbers") {
        params.page_numbers = {
          position: str("pageNumberPosition", "bottom-center"),
          format: str("pageNumberFormat", "n") as "n" | "page-n" | "n-of-total",
          start: num("pageNumberStart", 1),
          font_size: num("pageNumberFontSize", 11),
          color: str("pageNumberColor", "#000000"),
        };
      } else {
        params.stamp = {
          content: str("stampContent", "text") as "text" | "image",
          text: str("stampText") || undefined,
          image_b64: str("stampImageDataUrl") ? dataUrlToBase64(str("stampImageDataUrl")) : undefined,
          position: str("stampPosition", "bottom-right"),
          font_size: num("stampFontSize", 24),
          color: str("stampColor", "#000000"),
          max_width_pct: num("stampMaxWidthPct", 0.2),
        };
      }
      const r = await runJob("pdf.watermark", params, opts);
      return {
        outputs: [{ path: r.output, bytes: r.bytes }],
        summary: `${r.pages_affected} of ${r.pages} page${r.pages === 1 ? "" : "s"} updated.`,
      };
    }
```

`dataUrlToBase64` is the existing helper already defined at the bottom of `run.ts` for `pdf.sign` (`function dataUrlToBase64(dataUrl: string): string { return dataUrl.slice(dataUrl.indexOf(",") + 1); }`) — reuse it as-is, don't write a second copy.

- [ ] **Step 4: Add the options form to `OptionsPanel.tsx`**

Add a `case "watermark":` in the `ToolOptions` function's `switch (tool.id)`, following the exact structural pattern of the `case "protect":` block already in this file (if the Protect & Unlock branch has merged) or the `case "split":` block (mode-dependent sub-fields) otherwise: a mode `RadioGroup` (Watermark / Page Numbers / Stamp), a page-range `RadioGroup` (All / First page only / Custom, with a conditional `Input` for the custom spec), and per-mode fields using `Field`, `Input`, `Slider`, `Select`, `RadioGroup` — mirroring `case "convert-image":`'s style for the mix of sliders/selects/radios it already has. Text-vs-image content within Watermark/Stamp is a two-option `RadioGroup` the same way `case "compress":`'s level picker works.

For the image picker (shown when content is "image"): there is no existing reusable image-file-picker component in this file, so add a small local helper function at the end of the file (same pattern as Protect & Unlock's `ProtectPasswordField` helper, if that branch has merged — otherwise just a new local function), e.g.:

```tsx
function ImageFileField({ label, value, onChange }: { label: string; value: string; onChange: (dataUrl: string) => void }) {
  return (
    <Field label={label} hint={value ? "Image selected." : undefined}>
      {(id) => (
        <input
          id={id}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result as string);
            reader.readAsDataURL(file);
          }}
          className="text-xs text-muted file:mr-2 file:rounded-md file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs"
        />
      )}
    </Field>
  );
}
```

Call it as `<ImageFileField label="Watermark image" value={str("watermarkImageDataUrl")} onChange={(v) => set({ watermarkImageDataUrl: v })} />` (and the equivalent for `stampImageDataUrl`) when `str("watermarkContent")`/`str("stampContent")` is `"image"`. This is exactly the field `run.ts` (Step 3) reads and passes through `dataUrlToBase64` — confirm the field names match exactly (`watermarkImageDataUrl`, `stampImageDataUrl`), since that's the only place these two files agree on a contract.

- [ ] **Step 5: Add the tint CSS variables**

Add `--tint-j` (hue 53) to both the light and dark blocks of `apps/desktop/src/index.css`, same values as Task 3 Step 2's desktop-side lines (no `-btn` suffix needed — desktop's CSS doesn't use that variant, per the existing `--tint-a`..`--tint-h` pattern in that file).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck --workspace=apps/desktop` — no errors
Run: `npm run lint --workspace=apps/desktop` — no errors (or only pre-existing warnings unrelated to these files)

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/lib/tools.ts apps/desktop/src/lib/jobs.ts apps/desktop/src/lib/run.ts apps/desktop/src/components/OptionsPanel.tsx apps/desktop/src/index.css
git commit -m "feat(desktop): wire up the Watermark, Page Numbers & Stamp PDF tool"
```

---

### Task 5: Copy updates (after Tasks 3 and 4)

**Files:**
- Modify: `README.md`
- Modify: `apps/web/src/pages/Download.tsx`
- Modify: `apps/web/src/pages/Home.tsx`
- Modify: `apps/web/src/pages/ToolsIndex.tsx`
- Modify: `apps/web/src/components/layout/SiteFooter.tsx`
- Modify: `apps/desktop/src/routes/Home.tsx`

**Interfaces:** None — text-only changes.

- [ ] **Step 1: Determine the current tool count**

Run: `grep -c "^  { slug:" apps/web/src/tools/registry.tsx` (or open the file and count `TOOLS` entries) to get the exact current count *including* this branch's own new entry. Spell it as a word (e.g. 10 → "ten").

- [ ] **Step 2: Update every hardcoded tool-count string**

Search first, don't guess: `grep -rn "TOOLS ·\|tools, one page\|same [a-z]* that ship\|[A-Za-z]* PDF and image tools\|same [a-z]* tools" apps/web/src apps/desktop/src README.md -i`

Update each match found (this list is illustrative of what was true right after Protect & Unlock landed — re-verify against the grep output, since exact strings may have shifted):
- `README.md` — the `## The N tools` heading and the tools table (add a row for this new tool if the table doesn't already reflect it).
- `apps/web/src/pages/Download.tsx` — "The same N tools, with no browser in the way."
- `apps/web/src/pages/Home.tsx` — the `N TOOLS · ZERO UPLOADS` hero badge and the "N tools, one page each" section heading.
- `apps/web/src/pages/ToolsIndex.tsx` — "the same N that ship in the desktop app."
- `apps/web/src/components/layout/SiteFooter.tsx` — "N PDF and image tools that run on your machine."
- `apps/desktop/src/routes/Home.tsx` — its own `N TOOLS · ZERO UPLOADS`-style badge (confirm the exact current string with the grep above; do not skip this file).

- [ ] **Step 3: Typecheck both apps**

Run: `npm run typecheck --workspace=apps/web && npm run typecheck --workspace=apps/desktop`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add README.md apps/web/src/pages/Download.tsx apps/web/src/pages/Home.tsx apps/web/src/pages/ToolsIndex.tsx apps/web/src/components/layout/SiteFooter.tsx apps/desktop/src/routes/Home.tsx
git commit -m "docs: update tool count after adding Watermark, Page Numbers & Stamp PDF"
```

---

### Task 6: Integration verification (after all prior tasks)

**Files:** None modified — verification only.

**Interfaces:** None.

- [ ] **Step 1: Full test suites**

Run: `npm run test --workspace=apps/web` — PASS, all tests
Run: `cd apps/desktop && .venv\Scripts\python.exe -m pytest` — PASS, all tests

- [ ] **Step 2: Full typechecks and builds**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web` — no errors, build succeeds
Run: `npm run typecheck --workspace=apps/desktop` — no errors
Run: `npm install --workspace=apps/web` if any dependency was added in a task's isolated worktree and not yet physically installed in this working directory (check `node_modules` before assuming a clean `npm run test` run means dependencies are present — a prior feature's verification pass hit exactly this gap when a worktree's `npm install` didn't carry over to the merged working directory).

- [ ] **Step 3: Manual browser verification of the web tool**

Start the web dev server and open the Watermark tool. Confirm, for each of the three modes:
- Watermark: upload a multi-page PDF, set text + opacity + rotation, run with "single" placement, then again with "tiled" — open both outputs and visually confirm rotation/opacity/tiling look right (this is a human check; automated tests only prove the draw calls ran with the right parameters, not that 45° looks like 45°).
- Page Numbers: run with a custom page range and a non-1 starting number, confirm the page-range control's custom-input toggle works and the tool lists correctly on the tools index with its own (10th, or whatever the actual count is) tint color.
- Stamp: run with both text and an uploaded image at a non-default position.
- Confirm switching modes doesn't leak state oddly (e.g. leftover watermark text doesn't show up if you switch to Page Numbers and back).

- [ ] **Step 4: Manual desktop verification**

Same caveat as the Protect & Unlock plan's Task 6: a full native Tauri UI E2E requires a native OS window this environment's browser-automation tools cannot drive. If that's still true here, rely on the pytest suite (Task 1, real pikepdf/reportlab) as the primary evidence of correctness, and note explicitly that native UI E2E was skipped rather than claiming it passed. If a way to drive the native window becomes available, repeat Step 3's checks there instead, specifically confirming a PDF watermarked on the web engine and one watermarked on the desktop engine look visually equivalent (same rotation direction, same opacity behavior) — the two engines were implemented independently from the same spec and have not been cross-checked visually anywhere in this plan.
