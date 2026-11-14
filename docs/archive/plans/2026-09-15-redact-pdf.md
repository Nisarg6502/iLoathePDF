# Redact PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `redact` tool on both the desktop app and the website that lets a user draw black boxes over a PDF's pages, in either a Visual Cover-up mode (overlay only) or a True Redact mode (affected pages are flattened to an image so nothing underneath survives).

**Architecture:** One new sidecar op (`pdf.redact`, desktop) and one new client-side engine (`redactEngine`, web), each reusing an existing technique already proven in this codebase: `pdf_sign.py`'s reportlab+pikepdf overlay for Visual Cover-up, `pdf_to_img.py`'s Ghostscript rasterization for desktop True Redact, and `pdfToImages.ts`'s pdf.js canvas rendering for web True Redact. The selection UI on both platforms reuses Sign & Fill's drag/resize box interaction (`SignCanvas`/`SignElementBox` on desktop, the inline element boxes in `SignWorkspace` on web), stripped down to a position-only box with no content variants.

**Tech Stack:** Desktop: Python (pikepdf, reportlab, vendored Ghostscript) + React/TypeScript. Web: TypeScript, pdf-lib, pdfjs-dist. No new dependency on either platform.

## Global Constraints

- True Redact rasterization is fixed at 200 DPI, not user-configurable.
- Box color is fixed black, not user-configurable.
- No page-range control — affected pages are implied by which pages have boxes.
- Tint key `"k"` on both platforms' `Tint`/`TintKey` types.
- Tool count copy (README, both apps' Home/Download/ToolsIndex/Footer) moves from ten to eleven tools.
- No new third-party dependency on either platform.

---

## Execution plan (for the controller)

Two fully independent tracks can run in parallel from the start:

- **Wave 1 (parallel):** Task 1 (desktop op) + Task 2 (web engine) — no shared files, dispatch together in isolated worktrees.
- **Wave 2 (parallel):** Task 3 (desktop UI, needs Task 1's op contract) + Task 4 (web UI, needs Task 2's engine) — dispatch together once Wave 1 has merged; still no shared files between the two.
- **Wave 3 (sequential):** Task 5 (copy sync) — touches files from both tracks, needs both Wave 2 tasks merged first.
- **Wave 4 (sequential):** Task 6 (integration & cross-engine visual verification) — needs everything merged.

---

### Task 1: Desktop sidecar op `pdf.redact`

**Files:**
- Create: `apps/desktop/sidecar/ops/pdf_redact.py`
- Modify: `apps/desktop/sidecar/main.py:26-38` (DISPATCH table)
- Test: `apps/desktop/sidecar/tests/test_pdf_redact.py`

**Interfaces:**
- Consumes: `_common.py`'s `OpError`, `ProgressFn`, `atomic_output`, `existing_file`, `find_ghostscript`, `one_of`, `open_pdf`, `require`, `size_of`, `temp_dir` (all already exist, do not modify `_common.py`).
- Produces: `pdf_redact.run(params: dict, progress: ProgressFn) -> dict` with `params = {"input": str, "output": str, "mode": "visual"|"true", "boxes": [{"page": int, "x_pct": float, "y_pct": float, "w_pct": float, "h_pct": float}, ...]}`, returning `{"output": str, "bytes": int, "pages": int, "boxes": int, "mode": str}`. Later tasks (Task 3) call this op by name `"pdf.redact"` with this exact params/result shape — do not rename any field.

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/sidecar/tests/test_pdf_redact.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/desktop/sidecar`): `python -m pytest tests/test_pdf_redact.py -v`
Expected: FAIL / ERROR on every test with `ModuleNotFoundError: No module named 'ops.pdf_redact'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `pdf_redact.py`**

Create `apps/desktop/sidecar/ops/pdf_redact.py`:

```python
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
```

- [ ] **Step 4: Register the op in the sidecar's dispatch table**

In `apps/desktop/sidecar/main.py`, the `DISPATCH` dict currently reads:

```python
DISPATCH: dict[str, str] = {
    "pdf.info": "ops.pdf_info:run",
    "pdf.merge": "ops.pdf_merge:run",
    "pdf.split": "ops.pdf_split:run",
    "pdf.organize": "ops.pdf_organize:run",
    "pdf.compress": "ops.pdf_compress:run",
    "pdf.sign": "ops.pdf_sign:run",
    "pdf.protect": "ops.pdf_protect:run",
    "pdf.watermark": "ops.pdf_watermark:run",
    "img.convert": "ops.img_convert:run",
    "img.to_pdf": "ops.img_to_pdf:run",
    "pdf.to_img": "ops.pdf_to_img:run",
}
```

Add a `"pdf.redact"` line after `"pdf.watermark"`:

```python
DISPATCH: dict[str, str] = {
    "pdf.info": "ops.pdf_info:run",
    "pdf.merge": "ops.pdf_merge:run",
    "pdf.split": "ops.pdf_split:run",
    "pdf.organize": "ops.pdf_organize:run",
    "pdf.compress": "ops.pdf_compress:run",
    "pdf.sign": "ops.pdf_sign:run",
    "pdf.protect": "ops.pdf_protect:run",
    "pdf.watermark": "ops.pdf_watermark:run",
    "pdf.redact": "ops.pdf_redact:run",
    "img.convert": "ops.img_convert:run",
    "img.to_pdf": "ops.img_to_pdf:run",
    "pdf.to_img": "ops.pdf_to_img:run",
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python -m pytest tests/test_pdf_redact.py -v`
Expected: PASS on every test (the `needs_gs`-marked tests pass if Ghostscript is installed in this environment, otherwise SKIP — both are acceptable; none may FAIL).

- [ ] **Step 6: Run the full sidecar suite to check for regressions**

Run: `python -m pytest -v`
Expected: PASS (plus any pre-existing skips), no new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/sidecar/ops/pdf_redact.py apps/desktop/sidecar/main.py apps/desktop/sidecar/tests/test_pdf_redact.py
git commit -m "feat(desktop): add pdf.redact sidecar op"
```

---

### Task 2: Web engine `redactEngine`

**Files:**
- Create: `apps/web/src/tools/redact/types.ts`
- Create: `apps/web/src/engines/redact.ts`
- Test: `apps/web/src/engines/redact.test.ts`

**Interfaces:**
- Produces: `RedactBox { id: string; pageIndex: number; xPct: number; yPct: number; wPct: number; hPct: number }` and `RedactMode = "visual" | "true"` in `apps/web/src/tools/redact/types.ts`. `redactEngine: Engine` in `apps/web/src/engines/redact.ts`, called as `tool.engine({ files: [file], options: { mode: RedactMode, boxes: RedactBox[] } })`. Later tasks (Task 4) import both from these exact paths.

- [ ] **Step 1: Write the box/mode types**

Create `apps/web/src/tools/redact/types.ts`:

```ts
/**
 * Element model for the Redact tool's canvas. Placement is a fraction
 * (0..1) of the page's own box, top-left origin -- the same convention
 * Sign & Fill's `SignElement` and Watermark's positions already use.
 */

export interface RedactBox {
  id: string;
  pageIndex: number; // 0-based
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export type RedactMode = "visual" | "true";
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/engines/redact.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { redactEngine } from "./redact";
import { makeTestPdf } from "./testHelpers";
import type { RedactBox } from "@/tools/redact/types";

async function toFile(bytes: Uint8Array, name = "in.pdf") {
  return new File([bytes as BlobPart], name, { type: "application/pdf" });
}

function box(pageIndex: number, overrides: Partial<RedactBox> = {}): RedactBox {
  return { id: "b1", pageIndex, xPct: 0.05, yPct: 0.05, wPct: 0.9, hPct: 0.9, ...overrides };
}

async function pageText(bytes: ArrayBuffer, pageNumber: number): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  try {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    return content.items.map((item) => ("str" in item ? item.str : "")).join("");
  } finally {
    await doc.destroy();
  }
}

describe("redactEngine", () => {
  it("visual: preserves page count and leaves the original text extractable underneath the box", async () => {
    const file = await toFile(await makeTestPdf(1));
    const result = await redactEngine({ files: [file], options: { mode: "visual", boxes: [box(0)] } });

    expect(result.files).toHaveLength(1);
    expect(result.isPreview).toBe(false);
    const outBytes = await result.files[0].blob.arrayBuffer();
    const out = await PDFDocument.load(outBytes);
    expect(out.getPageCount()).toBe(1);
    expect(await pageText(outBytes, 1)).toContain("Page 1");
  });

  it("true: removes the original text from a page that received a box", async () => {
    const file = await toFile(await makeTestPdf(1));
    const result = await redactEngine({ files: [file], options: { mode: "true", boxes: [box(0)] } });
    const outBytes = await result.files[0].blob.arrayBuffer();
    expect(await pageText(outBytes, 1)).not.toContain("Page 1");
  });

  it("true: leaves a page with no box exactly as searchable as before", async () => {
    const file = await toFile(await makeTestPdf(3));
    const result = await redactEngine({ files: [file], options: { mode: "true", boxes: [box(0)] } });
    const outBytes = await result.files[0].blob.arrayBuffer();
    const out = await PDFDocument.load(outBytes);
    expect(out.getPageCount()).toBe(3);
    expect(await pageText(outBytes, 3)).toContain("Page 3");
  });

  it("rejects when no boxes are given", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      redactEngine({ files: [file], options: { mode: "visual", boxes: [] } }),
    ).rejects.toThrow(/at least one box/);
  });

  it("rejects a box targeting a page that doesn't exist", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      redactEngine({ files: [file], options: { mode: "visual", boxes: [box(5)] } }),
    ).rejects.toThrow(/only has 1 pages/);
  });

  it("summary reports box and page counts for both modes", async () => {
    const file = await toFile(await makeTestPdf(2));
    const result = await redactEngine({
      files: [file],
      options: { mode: "true", boxes: [box(0), box(0, { id: "b2", yPct: 0.02 })] },
    });
    expect(result.summary).toMatch(/2 boxes redacted across 1 page/);
    expect(result.summary).toMatch(/true redact/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run src/engines/redact.test.ts`
Expected: FAIL with a module-resolution error (`./redact` and `@/tools/redact/types` don't exist yet).

- [ ] **Step 4: Implement `redactEngine`**

Create `apps/web/src/engines/redact.ts`:

```ts
import { PDFDocument, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { Engine } from "./types";
import type { RedactBox } from "@/tools/redact/types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const REDACT_DPI = 200;

function boxRectPt(box: RedactBox, widthPt: number, heightPt: number) {
  const x = box.xPct * widthPt;
  const boxTop = heightPt - box.yPct * heightPt;
  const h = box.hPct * heightPt;
  const y = boxTop - h;
  const w = box.wPct * widthPt;
  return { x, y, w, h };
}

export const redactEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to redact.");

  const boxes = (options.boxes as RedactBox[] | undefined) ?? [];
  if (boxes.length === 0) throw new Error("Add at least one box before exporting.");
  const mode = (options.mode as string) === "true" ? "true" : "visual";

  const byPage = new Map<number, RedactBox[]>();
  for (const box of boxes) {
    const list = byPage.get(box.pageIndex);
    if (list) list.push(box);
    else byPage.set(box.pageIndex, [box]);
  }

  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const pageCount = doc.getPageCount();
  for (const pageIndex of byPage.keys()) {
    if (pageIndex < 0 || pageIndex >= pageCount) {
      throw new Error(`Box targets page ${pageIndex + 1}, but the PDF only has ${pageCount} pages.`);
    }
  }

  if (mode === "visual") {
    for (const [pageIndex, pageBoxes] of byPage) {
      const page = doc.getPage(pageIndex);
      const { width, height } = page.getSize();
      for (const box of pageBoxes) {
        const { x, y, w, h } = boxRectPt(box, width, height);
        page.drawRectangle({ x, y, width: w, height: h, color: rgb(0, 0, 0) });
      }
    }
  } else {
    // True redact: render each affected page from the ORIGINAL bytes (so
    // pdf.js's 1-based page numbers line up with the pageIndex keys above),
    // burn the boxes into that raster, then replace the page in `doc`.
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
    const pdfjsDoc = await loadingTask.promise;
    try {
      for (const [pageIndex, pageBoxes] of byPage) {
        const jsPage = await pdfjsDoc.getPage(pageIndex + 1);
        const viewport = jsPage.getViewport({ scale: REDACT_DPI / 72 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable.");
        await jsPage.render({ canvasContext: ctx, viewport, canvas }).promise;

        ctx.fillStyle = "#000000";
        for (const box of pageBoxes) {
          ctx.fillRect(
            box.xPct * canvas.width,
            box.yPct * canvas.height,
            box.wPct * canvas.width,
            box.hPct * canvas.height,
          );
        }

        const pngBlob: Blob = await new Promise((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), "image/png");
        });
        const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

        const originalPage = doc.getPage(pageIndex);
        const { width: widthPt, height: heightPt } = originalPage.getSize();
        const png = await doc.embedPng(pngBytes);

        doc.removePage(pageIndex);
        const newPage = doc.insertPage(pageIndex, [widthPt, heightPt]);
        newPage.drawImage(png, { x: 0, y: 0, width: widthPt, height: heightPt });
      }
    } finally {
      await loadingTask.destroy();
    }
  }

  const outBytes = await doc.save();
  const pageWord = byPage.size === 1 ? "page" : "pages";
  return {
    files: [
      {
        name: file.name.replace(/\.pdf$/i, "-redacted.pdf"),
        blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }),
      },
    ],
    summary: `${boxes.length} box${boxes.length === 1 ? "" : "es"} redacted across ${byPage.size} ${pageWord} (${mode === "true" ? "true redact" : "visual cover-up"}).`,
    isPreview: false,
  };
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/engines/redact.test.ts`
Expected: PASS on all 6 tests.

- [ ] **Step 6: Run the full web test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS, no new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/tools/redact/types.ts apps/web/src/engines/redact.ts apps/web/src/engines/redact.test.ts
git commit -m "feat(web): add redactEngine"
```

---

### Task 3: Desktop UI wiring

**Depends on:** Task 1 (needs the `pdf.redact` op contract and its registration in `main.py`/`jobs.ts`'s `OpName`).

**Files:**
- Create: `apps/desktop/src/lib/redactTypes.ts`
- Create: `apps/desktop/src/components/RedactBoxElement.tsx`
- Create: `apps/desktop/src/components/RedactCanvas.tsx`
- Create: `apps/desktop/src/components/RedactOptionsPanel.tsx`
- Modify: `apps/desktop/src/lib/jobs.ts` (add `OpName` entry, `RedactBoxParams`/`PdfRedactParams`/`PdfRedactResult`, `OpMap` entry)
- Modify: `apps/desktop/src/lib/tools.ts` (add `TOOLS` entry, extend `Tint`)
- Modify: `apps/desktop/src/lib/run.ts` (add `case "pdf.redact":`, extend `execute()`'s signature)
- Modify: `apps/desktop/src/routes/ToolWorkspace.tsx` (state, blocker, canvas branch, sidebar branch)

**Interfaces:**
- Consumes: `pdf.redact`'s params/result shape from Task 1 (`{input, output, mode, boxes: [{page, x_pct, y_pct, w_pct, h_pct}]}` -> `{output, bytes, pages, boxes, mode}`).
- Produces: nothing further tasks depend on (this is a leaf UI task).

- [ ] **Step 1: Add the box/mode types**

Create `apps/desktop/src/lib/redactTypes.ts`:

```ts
/**
 * Element model for the Redact tool's canvas. Mirrors `signTypes.ts`'s
 * `BaseSignElement` -- placement is a fraction (0..1) of the page's own
 * box, top-left origin -- but a redaction box has no content variant, only
 * a position.
 */

export interface RedactBox {
  id: string;
  pageIndex: number; // 0-based
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export type RedactMode = "visual" | "true";
```

- [ ] **Step 2: Add the sidecar contract types to `jobs.ts`**

In `apps/desktop/src/lib/jobs.ts`, the `OpName` union currently reads:

```ts
export type OpName =
  | "sys.ping"
  | "pdf.info"
  | "pdf.merge"
  | "pdf.split"
  | "pdf.organize"
  | "pdf.compress"
  | "pdf.sign"
  | "pdf.protect"
  | "pdf.watermark"
  | "img.convert"
  | "img.to_pdf"
  | "pdf.to_img";
```

Change it to:

```ts
export type OpName =
  | "sys.ping"
  | "pdf.info"
  | "pdf.merge"
  | "pdf.split"
  | "pdf.organize"
  | "pdf.compress"
  | "pdf.sign"
  | "pdf.protect"
  | "pdf.watermark"
  | "pdf.redact"
  | "img.convert"
  | "img.to_pdf"
  | "pdf.to_img";
```

Directly below the existing `PdfSignParams`/`PdfSignResult` interfaces (near `apps/desktop/src/lib/jobs.ts:113-118`), add:

```ts
export type RedactMode = "visual" | "true";
export interface RedactBoxParams {
  page: number;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
}
export interface PdfRedactParams {
  input: string;
  output: string;
  mode: RedactMode;
  boxes: RedactBoxParams[];
}
export interface PdfRedactResult { output: string; bytes: number; pages: number; boxes: number; mode: RedactMode }
```

In the `OpMap` interface (`apps/desktop/src/lib/jobs.ts:187-200`), currently:

```ts
export interface OpMap {
  "sys.ping": [Record<string, never>, PingResult];
  "pdf.info": [PdfInfoParams, PdfInfoResult];
  "pdf.merge": [PdfMergeParams, PdfMergeResult];
  "pdf.split": [PdfSplitParams, PdfSplitResult];
  "pdf.organize": [PdfOrganizeParams, PdfOrganizeResult];
  "pdf.compress": [PdfCompressParams, PdfCompressResult];
  "pdf.sign": [PdfSignParams, PdfSignResult];
  "pdf.protect": [PdfProtectParams, PdfProtectResult];
  "pdf.watermark": [PdfWatermarkParams, PdfWatermarkResult];
  "img.convert": [ImgConvertParams, ImgConvertResult];
  "img.to_pdf": [ImgToPdfParams, ImgToPdfResult];
  "pdf.to_img": [PdfToImgParams, PdfToImgResult];
}
```

Add a `"pdf.redact"` line after `"pdf.watermark"`:

```ts
export interface OpMap {
  "sys.ping": [Record<string, never>, PingResult];
  "pdf.info": [PdfInfoParams, PdfInfoResult];
  "pdf.merge": [PdfMergeParams, PdfMergeResult];
  "pdf.split": [PdfSplitParams, PdfSplitResult];
  "pdf.organize": [PdfOrganizeParams, PdfOrganizeResult];
  "pdf.compress": [PdfCompressParams, PdfCompressResult];
  "pdf.sign": [PdfSignParams, PdfSignResult];
  "pdf.protect": [PdfProtectParams, PdfProtectResult];
  "pdf.watermark": [PdfWatermarkParams, PdfWatermarkResult];
  "pdf.redact": [PdfRedactParams, PdfRedactResult];
  "img.convert": [ImgConvertParams, ImgConvertResult];
  "img.to_pdf": [ImgToPdfParams, ImgToPdfResult];
  "pdf.to_img": [PdfToImgParams, PdfToImgResult];
}
```

- [ ] **Step 3: Add the `RedactBoxElement` (draggable/resizable box)**

Create `apps/desktop/src/components/RedactBoxElement.tsx`:

```tsx
import { useRef } from "react";
import type { RedactBox } from "@/lib/redactTypes";

/** One placed redaction box: draggable by its body, resizable from the bottom-right handle. */
export function RedactBoxElement({
  box,
  selected,
  onSelect,
  onUpdate,
  onDelete,
  containerRef,
}: {
  box: RedactBox;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<Pick<RedactBox, "xPct" | "yPct" | "wPct" | "hPct">>) => void;
  onDelete: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const drag = useRef<{ mode: "move" | "resize"; startX: number; startY: number; box: RedactBox } | null>(null);

  function onPointerDown(e: React.PointerEvent, mode: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    drag.current = { mode, startX: e.clientX, startY: e.clientY, box };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dxPct = (e.clientX - d.startX) / rect.width;
    const dyPct = (e.clientY - d.startY) / rect.height;
    if (d.mode === "move") {
      const xPct = clamp(d.box.xPct + dxPct, 0, 1 - d.box.wPct);
      const yPct = clamp(d.box.yPct + dyPct, 0, 1 - d.box.hPct);
      onUpdate({ xPct, yPct });
    } else {
      const wPct = clamp(d.box.wPct + dxPct, 0.02, 1 - d.box.xPct);
      const hPct = clamp(d.box.hPct + dyPct, 0.02, 1 - d.box.yPct);
      onUpdate({ wPct, hPct });
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${box.xPct * 100}%`,
    top: `${box.yPct * 100}%`,
    width: `${box.wPct * 100}%`,
    height: `${box.hPct * 100}%`,
  };

  return (
    <div
      style={style}
      className={`group cursor-move select-none rounded-sm bg-black ${
        selected ? "outline outline-2 outline-accent" : "outline outline-1 outline-dashed outline-white/40 hover:outline-accent/60"
      }`}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {selected && (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -right-2.5 -top-2.5 grid size-5 place-items-center rounded-full bg-danger text-[10px] text-white shadow"
            aria-label="Delete box"
          >
            ✕
          </button>
          <div
            onPointerDown={(e) => onPointerDown(e, "resize")}
            className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize rounded-full border-2 border-accent bg-white"
          />
        </>
      )}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (hi < lo) hi = lo;
  return Math.min(hi, Math.max(lo, n));
}
```

- [ ] **Step 4: Add the `RedactCanvas` (page preview + boxes)**

Create `apps/desktop/src/components/RedactCanvas.tsx`:

```tsx
/**
 * The page canvas for the Redact tool: loads a PDF's pages and lets placed
 * boxes be dragged and resized on top of them. Mirrors `SignCanvas`, minus
 * the per-element content variants (a redaction box has no font/image).
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { RedactBoxElement } from "./RedactBoxElement";
import { PdfPreviewDocument, isCancellation } from "@/lib/pdfPreview";
import { JobError, readFileBytes } from "@/lib/jobs";
import type { RedactBox } from "@/lib/redactTypes";

export interface RedactCanvasProps {
  file: { id: string; path: string; name: string; blob?: File };
  boxes: RedactBox[];
  activePageIndex: number;
  onActivePageChange: (index: number) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Pick<RedactBox, "xPct" | "yPct" | "wPct" | "hPct">>) => void;
  onDelete: (id: string) => void;
  className?: string;
}

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; doc: PdfPreviewDocument }
  | { phase: "error"; message: string };

const RENDER_WIDTH = 680;

export function RedactCanvas({
  file,
  boxes,
  activePageIndex,
  onActivePageChange,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  className,
}: RedactCanvasProps) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [urls, setUrls] = useState<Record<number, string>>({});
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    let opened: PdfPreviewDocument | null = null;

    setState({ phase: "loading" });
    setUrls({});

    (async () => {
      try {
        const bytes = await readFileBytes(file);
        const doc = await PdfPreviewDocument.load(bytes);
        if (cancelled) {
          doc.destroy();
          return;
        }
        opened = doc;
        setState({ phase: "ready", doc });
        for (let n = 1; n <= doc.pageCount; n++) {
          const dims = await doc.dimensions(n);
          const width = Math.min(RENDER_WIDTH, dims.width);
          const url = await doc.renderPage(n, { width });
          if (cancelled) return;
          setUrls((prev) => ({ ...prev, [n - 1]: url }));
        }
      } catch (err) {
        if (cancelled || isCancellation(err)) return;
        const message =
          err instanceof JobError ? err.message : "That PDF could not be opened for preview.";
        setState({ phase: "error", message });
      }
    })();

    return () => {
      cancelled = true;
      opened?.destroy();
    };
  }, [file]);

  if (state.phase === "loading") {
    return (
      <div className={className}>
        <div className="flex items-center justify-center gap-2 rounded-card border border-border bg-surface px-5 py-10 text-[14px] text-muted">
          <Loader2 className="size-4 animate-spin" />
          Reading pages…
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className={className}>
        <div className="rounded-card border border-danger/40 bg-surface px-5 py-6 text-center">
          <p className="text-[14px] font-medium text-text">Preview unavailable</p>
          <p className="mt-1 text-[14px] text-muted">{state.message}</p>
        </div>
      </div>
    );
  }

  const pageCount = state.doc.pageCount;

  return (
    <div className={className}>
      <div className="mx-auto flex max-w-[720px] flex-col gap-4">
        {Array.from({ length: pageCount }, (_, pageIndex) => (
          <div
            key={pageIndex}
            ref={(node) => {
              pageRefs.current[pageIndex] = node;
            }}
            onPointerDown={() => onActivePageChange(pageIndex)}
            className={`relative shrink-0 overflow-hidden rounded-card border bg-white shadow-sm ${
              activePageIndex === pageIndex ? "border-accent" : "border-border"
            }`}
            onClick={(e) => {
              if (e.target === e.currentTarget) onSelect(null);
            }}
          >
            {urls[pageIndex] ? (
              <img
                src={urls[pageIndex]}
                alt={`Page ${pageIndex + 1}`}
                className="block w-full select-none"
                draggable={false}
              />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-[13px] text-muted">
                Rendering page {pageIndex + 1}…
              </div>
            )}
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
              Page {pageIndex + 1}
            </div>
            <div className="pointer-events-auto absolute inset-0">
              {boxes
                .filter((b) => b.pageIndex === pageIndex)
                .map((b) => (
                  <RedactBoxElement
                    key={b.id}
                    box={b}
                    selected={selectedId === b.id}
                    onSelect={() => {
                      onSelect(b.id);
                      onActivePageChange(pageIndex);
                    }}
                    onUpdate={(patch) => onUpdate(b.id, patch)}
                    onDelete={() => onDelete(b.id)}
                    containerRef={{ current: pageRefs.current[pageIndex] }}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RedactCanvas;
```

- [ ] **Step 5: Add the `RedactOptionsPanel` (mode toggle + box list)**

Create `apps/desktop/src/components/RedactOptionsPanel.tsx`:

```tsx
import { Button } from "./ui/button";
import type { RedactBox, RedactMode } from "@/lib/redactTypes";

const MODE_COPY: Record<RedactMode, string> = {
  visual:
    "Draws a black box over each area. The PDF's original text and images are still underneath — recoverable by anyone who knows to look.",
  true:
    "Flattens every page that has a box to a picture, so nothing underneath survives. Only pages with a box are affected; the rest of the document stays fully searchable.",
};

export function RedactOptionsPanel({
  mode,
  onModeChange,
  boxes,
  selectedId,
  activePageIndex,
  onAddBox,
  onSelect,
  onDelete,
}: {
  mode: RedactMode;
  onModeChange: (mode: RedactMode) => void;
  boxes: RedactBox[];
  selectedId: string | null;
  activePageIndex: number;
  onAddBox: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 font-mono text-[11px] font-bold tracking-[0.13em] text-faint">MODE</div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={mode === "visual" ? "primary" : "secondary"} size="sm" onClick={() => onModeChange("visual")}>
            Visual cover-up
          </Button>
          <Button variant={mode === "true" ? "primary" : "secondary"} size="sm" onClick={() => onModeChange("true")}>
            True redact
          </Button>
        </div>
        <p className="mt-2 text-[12px] text-muted">{MODE_COPY[mode]}</p>
      </div>

      <div>
        <div className="mb-2 font-mono text-[11px] font-bold tracking-[0.13em] text-faint">
          PAGE {activePageIndex + 1}
        </div>
        <Button variant="secondary" size="sm" onClick={onAddBox} className="w-full">
          Add box
        </Button>
      </div>

      <div>
        <div className="mb-2 font-mono text-[11px] font-bold tracking-[0.13em] text-faint">
          BOXES ({boxes.length})
        </div>
        <ul className="flex flex-col gap-1.5">
          {boxes.map((b) => (
            <li
              key={b.id}
              onClick={() => onSelect(b.id)}
              className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-[12.5px] ${
                selectedId === b.id ? "border-accent bg-accent-soft" : "border-border bg-surface-2"
              }`}
            >
              <span className="text-text">Box · p{b.pageIndex + 1}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(b.id);
                }}
                className="text-muted hover:text-danger"
              >
                ✕
              </button>
            </li>
          ))}
          {boxes.length === 0 && <li className="text-[12.5px] text-muted">Nothing placed yet.</li>}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add the `redact` tool entry to `tools.ts`**

In `apps/desktop/src/lib/tools.ts`, change the `lucide-react` import block (`apps/desktop/src/lib/tools.ts:10-21`) from:

```ts
import {
  Combine,
  FileImage,
  FileOutput,
  Images,
  Lock,
  Minimize2,
  Replace,
  Scissors,
  Signature,
  Stamp,
} from "lucide-react";
```

to:

```ts
import {
  Combine,
  EyeOff,
  FileImage,
  FileOutput,
  Images,
  Lock,
  Minimize2,
  Replace,
  Scissors,
  Signature,
  Stamp,
} from "lucide-react";
```

Change the `Tint` type (`apps/desktop/src/lib/tools.ts:26`) from:

```ts
export type Tint = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j";
```

to:

```ts
export type Tint = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k";
```

Add a new entry to the `TOOLS` array, directly after the `watermark` entry (`apps/desktop/src/lib/tools.ts:224-247`, before the closing `];`):

```ts
  {
    id: "redact",
    path: "/t/redact",
    title: "Redact PDF",
    description: "Black out sensitive text, photos or signatures — visually or for good.",
    icon: EyeOff,
    group: "pdf",
    tint: "k",
    op: "pdf.redact",
    accepts: ["pdf"],
    acceptsLabel: "a PDF file",
    multiple: false,
    ordered: false,
    action: "Save PDF",
    defaults: { mode: "visual" },
  },
```

- [ ] **Step 7: Add the `pdf.redact` case to `run.ts`**

In `apps/desktop/src/lib/run.ts`, add the import (near the existing `SignElementParams`/`signTypes` imports):

```ts
import type { RedactBoxParams } from "./jobs";
import type { RedactBox } from "./redactTypes";
```

Change `execute()`'s signature from:

```ts
export async function execute(
  tool: Tool,
  files: PickedFile[],
  v: OptionValues,
  pages: PdfPageItem[],
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
  signElements: SignElement[] = [],
): Promise<JobResult> {
```

to:

```ts
export async function execute(
  tool: Tool,
  files: PickedFile[],
  v: OptionValues,
  pages: PdfPageItem[],
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
  signElements: SignElement[] = [],
  redactBoxes: RedactBox[] = [],
): Promise<JobResult> {
```

Add a `case "pdf.redact":` in the `switch (op)` block, directly after the existing `case "pdf.sign":` block:

```ts
    case "pdf.redact": {
      if (redactBoxes.length === 0) {
        throw new JobError("BAD_PARAMS", "Add at least one box before exporting.");
      }
      const boxes: RedactBoxParams[] = redactBoxes.map((b) => ({
        page: b.pageIndex,
        x_pct: b.xPct,
        y_pct: b.yPct,
        w_pct: b.wPct,
        h_pct: b.hPct,
      }));
      const r = await runJob(
        "pdf.redact",
        { input: first.path, output: join(`${base}-redacted.pdf`), mode: str("mode", "visual") as "visual" | "true", boxes },
        opts,
      );
      return {
        outputs: [{ path: r.output, bytes: r.bytes }],
        summary: `${r.boxes} box${r.boxes === 1 ? "" : "es"} redacted (${r.mode === "true" ? "true redact" : "visual cover-up"}).`,
      };
    }
```

- [ ] **Step 8: Wire the workspace in `ToolWorkspace.tsx`**

In `apps/desktop/src/routes/ToolWorkspace.tsx`, add imports (alongside the existing `SignCanvas`/`SignOptionsPanel` imports):

```ts
import { RedactOptionsPanel } from "@/components/RedactOptionsPanel";
import type { RedactBox, RedactMode } from "@/lib/redactTypes";
```

Change the lazy-import block (`apps/desktop/src/routes/ToolWorkspace.tsx:36-41`) from:

```ts
const OrganizeCanvas = lazy(() =>
  import("@/components/OrganizeCanvas").then((m) => ({ default: m.OrganizeCanvas })),
);
const SignCanvas = lazy(() =>
  import("@/components/SignCanvas").then((m) => ({ default: m.SignCanvas })),
);
```

to:

```ts
const OrganizeCanvas = lazy(() =>
  import("@/components/OrganizeCanvas").then((m) => ({ default: m.OrganizeCanvas })),
);
const SignCanvas = lazy(() =>
  import("@/components/SignCanvas").then((m) => ({ default: m.SignCanvas })),
);
const RedactCanvas = lazy(() =>
  import("@/components/RedactCanvas").then((m) => ({ default: m.RedactCanvas })),
);
```

Add a `newRedactId` helper next to the existing `newSignId`/`todayFormatted` helpers (`apps/desktop/src/routes/ToolWorkspace.tsx:43-49`):

```ts
function newRedactId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
```

Add state, directly after the existing sign-related state block (`apps/desktop/src/routes/ToolWorkspace.tsx:65-68`):

```ts
  const [redactBoxes, setRedactBoxes] = useState<RedactBox[]>([]);
  const [redactSelectedId, setRedactSelectedId] = useState<string | null>(null);
  const [redactActivePage, setRedactActivePage] = useState(0);
```

In the tool-switch `useEffect` (`apps/desktop/src/routes/ToolWorkspace.tsx:82-94`), which currently reads:

```ts
  useEffect(() => {
    const handed = takePendingFiles().filter((f) =>
      tool.accepts.includes((f.name.split(".").pop() ?? "").toLowerCase()),
    );
    setFiles(tool.multiple ? handed : handed.slice(0, 1));
    setValues(tool.defaults);
    setPages([]);
    setSignElements([]);
    setSignSelectedId(null);
    setSignActivePage(0);
    setSignCaptureKind(null);
    setState({ phase: "idle" });
  }, [tool]);
```

add the redact resets:

```ts
  useEffect(() => {
    const handed = takePendingFiles().filter((f) =>
      tool.accepts.includes((f.name.split(".").pop() ?? "").toLowerCase()),
    );
    setFiles(tool.multiple ? handed : handed.slice(0, 1));
    setValues(tool.defaults);
    setPages([]);
    setSignElements([]);
    setSignSelectedId(null);
    setSignActivePage(0);
    setSignCaptureKind(null);
    setRedactBoxes([]);
    setRedactSelectedId(null);
    setRedactActivePage(0);
    setState({ phase: "idle" });
  }, [tool]);
```

In the `blocker` memo (`apps/desktop/src/routes/ToolWorkspace.tsx:96-111`), which currently reads:

```ts
  const blocker = useMemo(() => {
    if (files.length === 0) return `Add ${tool.acceptsLabel} to continue.`;
    if (tool.id === "merge" && files.length < 2) return "Merging needs at least two PDFs.";
    if (tool.id === "sign" && signElements.length === 0) {
      return "Add a signature, text, date or initials to continue.";
    }
    if (tool.id === "protect") {
      const password = String(values.password ?? "");
      const mode = String(values.mode ?? "protect");
      if (password.length < 4) return "Enter a password of at least 4 characters.";
      if (mode === "protect" && password !== String(values.confirmPassword ?? "")) {
        return "Passwords do not match.";
      }
    }
    return null;
  }, [files.length, tool, signElements.length, values]);
```

add the redact check and the `redactBoxes.length` dependency:

```ts
  const blocker = useMemo(() => {
    if (files.length === 0) return `Add ${tool.acceptsLabel} to continue.`;
    if (tool.id === "merge" && files.length < 2) return "Merging needs at least two PDFs.";
    if (tool.id === "sign" && signElements.length === 0) {
      return "Add a signature, text, date or initials to continue.";
    }
    if (tool.id === "redact" && redactBoxes.length === 0) {
      return "Add at least one box to continue.";
    }
    if (tool.id === "protect") {
      const password = String(values.password ?? "");
      const mode = String(values.mode ?? "protect");
      if (password.length < 4) return "Enter a password of at least 4 characters.";
      if (mode === "protect" && password !== String(values.confirmPassword ?? "")) {
        return "Passwords do not match.";
      }
    }
    return null;
  }, [files.length, tool, signElements.length, redactBoxes.length, values]);
```

In the `run` callback (`apps/desktop/src/routes/ToolWorkspace.tsx:115-135`), change the `execute(...)` call from:

```ts
      const result = await execute(tool, files, values, pages, onProgress, controller.signal, signElements);
```

to:

```ts
      const result = await execute(tool, files, values, pages, onProgress, controller.signal, signElements, redactBoxes);
```

and add `redactBoxes` to the `useCallback` dependency array (`apps/desktop/src/routes/ToolWorkspace.tsx:135`), changing:

```ts
  }, [blocker, running, tool, files, values, pages, signElements]);
```

to:

```ts
  }, [blocker, running, tool, files, values, pages, signElements, redactBoxes]);
```

Add box handlers, directly after the existing `deleteSignElement` function (`apps/desktop/src/routes/ToolWorkspace.tsx:180-183`):

```ts
  function addRedactBox() {
    const b: RedactBox = { id: newRedactId(), pageIndex: redactActivePage, xPct: 0.3, yPct: 0.4, wPct: 0.3, hPct: 0.1 };
    setRedactBoxes((prev) => [...prev, b]);
    setRedactSelectedId(b.id);
  }

  function updateRedactBox(id: string, patch: Partial<Pick<RedactBox, "xPct" | "yPct" | "wPct" | "hPct">>) {
    setRedactBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function deleteRedactBox(id: string) {
    setRedactBoxes((prev) => prev.filter((b) => b.id !== id));
    setRedactSelectedId((cur) => (cur === id ? null : cur));
  }
```

In the canvas `AnimatePresence` block, change the final `tool.id === "sign"` branch (`apps/desktop/src/routes/ToolWorkspace.tsx:368-395`) from ending with:

```tsx
            ) : tool.id === "sign" ? (
              <motion.div
                key="sign-canvas"
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="min-h-0 flex-1 overflow-auto p-4"
              >
                <Suspense
                  fallback={
                    <div className="grid h-full place-items-center text-[14px] text-muted">
                      Loading the page canvas…
                    </div>
                  }
                >
                  <SignCanvas
                    file={files[0]}
                    elements={signElements}
                    activePageIndex={signActivePage}
                    onActivePageChange={setSignActivePage}
                    selectedId={signSelectedId}
                    onSelect={setSignSelectedId}
                    onUpdate={updateSignElement}
                    onDelete={deleteSignElement}
                  />
                </Suspense>
              </motion.div>
            ) : (
```

to:

```tsx
            ) : tool.id === "sign" ? (
              <motion.div
                key="sign-canvas"
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="min-h-0 flex-1 overflow-auto p-4"
              >
                <Suspense
                  fallback={
                    <div className="grid h-full place-items-center text-[14px] text-muted">
                      Loading the page canvas…
                    </div>
                  }
                >
                  <SignCanvas
                    file={files[0]}
                    elements={signElements}
                    activePageIndex={signActivePage}
                    onActivePageChange={setSignActivePage}
                    selectedId={signSelectedId}
                    onSelect={setSignSelectedId}
                    onUpdate={updateSignElement}
                    onDelete={deleteSignElement}
                  />
                </Suspense>
              </motion.div>
            ) : tool.id === "redact" ? (
              <motion.div
                key="redact-canvas"
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="min-h-0 flex-1 overflow-auto p-4"
              >
                <Suspense
                  fallback={
                    <div className="grid h-full place-items-center text-[14px] text-muted">
                      Loading the page canvas…
                    </div>
                  }
                >
                  <RedactCanvas
                    file={files[0]}
                    boxes={redactBoxes}
                    activePageIndex={redactActivePage}
                    onActivePageChange={setRedactActivePage}
                    selectedId={redactSelectedId}
                    onSelect={setRedactSelectedId}
                    onUpdate={updateRedactBox}
                    onDelete={deleteRedactBox}
                  />
                </Suspense>
              </motion.div>
            ) : (
```

In the sidebar options block (`apps/desktop/src/routes/ToolWorkspace.tsx:417-430`), change:

```tsx
            {tool.id === "sign" ? (
              <SignOptionsPanel
                elements={signElements}
                selectedId={signSelectedId}
                activePageIndex={signActivePage}
                onAddCapture={setSignCaptureKind}
                onAddText={addTextSignElement}
                onSelect={setSignSelectedId}
                onUpdate={updateSignElement}
                onDelete={deleteSignElement}
              />
            ) : (
              <ToolOptions tool={tool} values={values} onChange={setValues} />
            )}
```

to:

```tsx
            {tool.id === "sign" ? (
              <SignOptionsPanel
                elements={signElements}
                selectedId={signSelectedId}
                activePageIndex={signActivePage}
                onAddCapture={setSignCaptureKind}
                onAddText={addTextSignElement}
                onSelect={setSignSelectedId}
                onUpdate={updateSignElement}
                onDelete={deleteSignElement}
              />
            ) : tool.id === "redact" ? (
              <RedactOptionsPanel
                mode={(values.mode as RedactMode) ?? "visual"}
                onModeChange={(mode) => setValues((v) => ({ ...v, mode }))}
                boxes={redactBoxes}
                selectedId={redactSelectedId}
                activePageIndex={redactActivePage}
                onAddBox={addRedactBox}
                onSelect={setRedactSelectedId}
                onDelete={deleteRedactBox}
              />
            ) : (
              <ToolOptions tool={tool} values={values} onChange={setValues} />
            )}
```

- [ ] **Step 9: Typecheck**

Run (from `apps/desktop`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Run the full desktop test suite to check for regressions**

Run (from `apps/desktop`): `npx vitest run`
Expected: PASS, no new failures.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src/lib/redactTypes.ts apps/desktop/src/components/RedactBoxElement.tsx apps/desktop/src/components/RedactCanvas.tsx apps/desktop/src/components/RedactOptionsPanel.tsx apps/desktop/src/lib/jobs.ts apps/desktop/src/lib/tools.ts apps/desktop/src/lib/run.ts apps/desktop/src/routes/ToolWorkspace.tsx
git commit -m "feat(desktop): wire up the Redact PDF tool"
```

---

### Task 4: Web UI wiring

**Depends on:** Task 2 (needs `redactEngine` and `apps/web/src/tools/redact/types.ts`).

**Files:**
- Create: `apps/web/src/tools/redact/RedactBoxElement.tsx`
- Create: `apps/web/src/tools/redact/RedactWorkspace.tsx`
- Create: `apps/web/src/tools/options/RedactOptions.tsx`
- Modify: `apps/web/src/tools/tint.ts` (extend `TintKey`)
- Modify: `apps/web/src/tools/icons.tsx` (add `RedactIcon`)
- Modify: `apps/web/src/tools/registry.tsx` (add `TOOLS` entry)
- Modify: `apps/web/src/index.css` (add `--tint-k` tokens)

**Interfaces:**
- Consumes: `redactEngine` from `@/engines/redact`, `RedactBox`/`RedactMode` from `./types` (Task 2).
- Produces: nothing further tasks depend on (this is a leaf UI task).

- [ ] **Step 1: Add the `RedactBoxElement` (draggable/resizable box)**

Create `apps/web/src/tools/redact/RedactBoxElement.tsx`:

```tsx
import { useRef } from "react";
import type { RedactBox } from "./types";

/** One placed redaction box: draggable by its body, resizable from the bottom-right handle. */
export function RedactBoxElement({
  box,
  selected,
  onSelect,
  onUpdate,
  onDelete,
  containerRef,
}: {
  box: RedactBox;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<Pick<RedactBox, "xPct" | "yPct" | "wPct" | "hPct">>) => void;
  onDelete: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const drag = useRef<{ mode: "move" | "resize"; startX: number; startY: number; box: RedactBox } | null>(null);

  function onPointerDown(e: React.PointerEvent, mode: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    drag.current = { mode, startX: e.clientX, startY: e.clientY, box };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dxPct = (e.clientX - d.startX) / rect.width;
    const dyPct = (e.clientY - d.startY) / rect.height;
    if (d.mode === "move") {
      const xPct = clamp(d.box.xPct + dxPct, 0, 1 - d.box.wPct);
      const yPct = clamp(d.box.yPct + dyPct, 0, 1 - d.box.hPct);
      onUpdate({ xPct, yPct });
    } else {
      const wPct = clamp(d.box.wPct + dxPct, 0.02, 1 - d.box.xPct);
      const hPct = clamp(d.box.hPct + dyPct, 0.02, 1 - d.box.yPct);
      onUpdate({ wPct, hPct });
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${box.xPct * 100}%`,
    top: `${box.yPct * 100}%`,
    width: `${box.wPct * 100}%`,
    height: `${box.hPct * 100}%`,
  };

  return (
    <div
      style={style}
      className={`group cursor-move select-none rounded-sm bg-black ${
        selected ? "outline outline-2 outline-accent" : "outline outline-1 outline-dashed outline-white/40 hover:outline-accent/60"
      }`}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {selected && (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -right-2.5 -top-2.5 grid size-5 place-items-center rounded-full bg-danger text-[10px] text-white shadow"
            aria-label="Delete box"
          >
            ✕
          </button>
          <div
            onPointerDown={(e) => onPointerDown(e, "resize")}
            className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize rounded-full border-2 border-accent bg-white"
          />
        </>
      )}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (hi < lo) hi = lo;
  return Math.min(hi, Math.max(lo, n));
}
```

- [ ] **Step 2: Add the never-rendered `RedactOptions` placeholder**

Create `apps/web/src/tools/options/RedactOptions.tsx`:

```tsx
// Redact uses its own workspace (RedactWorkspace) instead of the generic
// ToolPage, so this panel is never actually rendered -- it only exists to
// satisfy ToolConfig's shape.
export function RedactOptions() {
  return null;
}
```

- [ ] **Step 3: Add the `RedactWorkspace` (page preview + mode toggle + box list)**

Create `apps/web/src/tools/redact/RedactWorkspace.tsx`:

```tsx
/**
 * Bespoke workspace for the Redact tool: a scrollable page preview with
 * draggable/resizable black boxes, instead of the generic drop-zone +
 * options sidebar every other tool uses (ToolPage doesn't render a page
 * canvas). Mirrors SignWorkspace's structure.
 */
import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { FileDropZone } from "@/components/FileDropZone";
import { ResultCard } from "@/components/ResultCard";
import type { ToolConfig } from "@/tools/ToolConfig";
import type { EngineResult } from "@/engines/types";
import { RedactBoxElement } from "./RedactBoxElement";
import type { RedactBox, RedactMode } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PageInfo {
  index: number;
  dataUrl: string;
  widthPt: number;
  heightPt: number;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MODE_COPY: Record<RedactMode, string> = {
  visual:
    "Draws a black box over each area. The PDF's original text and images are still underneath — recoverable by anyone who knows to look.",
  true:
    "Flattens every page that has a box to a picture, so nothing underneath survives. Only pages with a box are affected; the rest of the document stays fully searchable.",
};

export function RedactWorkspace({ tool }: { tool: ToolConfig }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [boxes, setBoxes] = useState<RedactBox[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [mode, setMode] = useState<RedactMode>("visual");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPages([]);
    setBoxes([]);
    setSelectedId(null);

    (async () => {
      try {
        const bytes = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        const out: PageInfo[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2, (900 * (globalThis.devicePixelRatio || 1)) / base.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas 2D context unavailable.");
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          out.push({ index: n - 1, dataUrl: canvas.toDataURL("image/png"), widthPt: base.width, heightPt: base.height });
        }
        if (!cancelled) setPages(out);
      } catch {
        if (!cancelled) setLoadError("That PDF couldn't be opened for preview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  function addBox() {
    const b: RedactBox = { id: newId(), pageIndex: activePage, xPct: 0.3, yPct: 0.4, wPct: 0.3, hPct: 0.1 };
    setBoxes((prev) => [...prev, b]);
    setSelectedId(b.id);
  }

  function updateBox(id: string, patch: Partial<Pick<RedactBox, "xPct" | "yPct" | "wPct" | "hPct">>) {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function deleteBox(id: string) {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  async function runExport() {
    if (!file) return;
    setRunning(true);
    setRunError(null);
    try {
      const engineResult = await tool.engine({ files: [file], options: { mode, boxes } });
      setResult(engineResult);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setFile(null);
    setPages([]);
    setBoxes([]);
    setSelectedId(null);
    setResult(null);
    setRunError(null);
  }

  const boxCount = boxes.length;

  if (!file) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mt-3.5 max-w-2xl">
          <FileDropZone accept={tool.accept} multiple={false} onFiles={(files) => files[0] && setFile(files[0])} />
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mt-3.5 max-w-2xl">
          <ResultCard result={result} onReset={reset} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mt-3.5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
        {/* Page preview */}
        <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-surface-2 p-5">
          {loading && <p className="text-center text-[13px] text-muted">Reading pages…</p>}
          {loadError && <p className="text-center text-[13px] text-danger">{loadError}</p>}
          {pages.map((page) => (
            <div
              key={page.index}
              ref={(node) => {
                pageRefs.current[page.index] = node;
              }}
              onPointerDown={() => setActivePage(page.index)}
              onFocus={() => setActivePage(page.index)}
              className={`relative mx-auto w-full max-w-[640px] shrink-0 overflow-hidden rounded-lg border bg-white shadow-sm ${
                activePage === page.index ? "border-accent" : "border-border"
              }`}
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedId(null);
              }}
            >
              <img
                src={page.dataUrl}
                alt={`Page ${page.index + 1}`}
                className="block w-full select-none"
                draggable={false}
              />
              <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                Page {page.index + 1}
              </div>
              <div className="pointer-events-auto absolute inset-0">
                {boxes
                  .filter((b) => b.pageIndex === page.index)
                  .map((b) => (
                    <RedactBoxElement
                      key={b.id}
                      box={b}
                      selected={selectedId === b.id}
                      onSelect={() => {
                        setSelectedId(b.id);
                        setActivePage(page.index);
                      }}
                      onUpdate={(patch) => updateBox(b.id, patch)}
                      onDelete={() => deleteBox(b.id)}
                      containerRef={{ current: pageRefs.current[page.index] }}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <div className="sticky top-[82px] flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Mode</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("visual")}
                className={`rounded-[10px] border px-3 py-2 text-[13px] font-medium ${
                  mode === "visual" ? "border-accent bg-accent-soft" : "border-border bg-surface-2 hover:bg-surface-3"
                }`}
              >
                Visual cover-up
              </button>
              <button
                type="button"
                onClick={() => setMode("true")}
                className={`rounded-[10px] border px-3 py-2 text-[13px] font-medium ${
                  mode === "true" ? "border-accent bg-accent-soft" : "border-border bg-surface-2 hover:bg-surface-3"
                }`}
              >
                True redact
              </button>
            </div>
            <p className="mt-2 text-[12px] text-muted">{MODE_COPY[mode]}</p>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Add to page {activePage + 1}</div>
            <button
              type="button"
              onClick={addBox}
              className="mt-2 w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium hover:bg-surface-3"
            >
              Add box
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Boxes ({boxCount})
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {boxes.map((b) => (
                <li
                  key={b.id}
                  onClick={() => {
                    setSelectedId(b.id);
                    setActivePage(b.pageIndex);
                  }}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-[12.5px] ${
                    selectedId === b.id ? "border-accent bg-accent-soft" : "border-border bg-surface-2"
                  }`}
                >
                  <span>Box · p{b.pageIndex + 1}</span>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      deleteBox(b.id);
                    }}
                    className="text-muted hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {boxes.length === 0 && <li className="text-[12.5px] text-muted">Nothing placed yet.</li>}
            </ul>
          </div>

          {runError && <p className="text-[12.5px] text-danger">{runError}</p>}

          <button
            type="button"
            onClick={runExport}
            disabled={running || boxCount === 0}
            className="flex h-10 w-full items-center justify-center rounded-[11px] bg-accent text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
          >
            {running ? "Working…" : "Export redacted PDF"}
          </button>
          <button type="button" onClick={reset} className="text-[12.5px] text-muted hover:text-text">
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}

export default RedactWorkspace;
```

- [ ] **Step 4: Extend `TintKey` and add `RedactIcon`**

In `apps/web/src/tools/tint.ts`, change line 1 from:

```ts
export type TintKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j";
```

to:

```ts
export type TintKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k";
```

In `apps/web/src/tools/icons.tsx`, add `RedactIcon` after `WatermarkIcon` (after `apps/web/src/tools/icons.tsx:103`):

```tsx
export function RedactIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-k)" strokeWidth="1.5" {...props}>
      <rect x="2.5" y="3.5" width="13" height="11" rx="1.2" />
      <rect x="4.5" y="8" width="9" height="3" fill="var(--tint-k)" stroke="none" />
    </svg>
  );
}
```

- [ ] **Step 5: Add `--tint-k` to `index.css`**

In `apps/web/src/index.css`, change the light `:root` tint block (`apps/web/src/index.css:74-93`) — currently ending with:

```css
  --tint-j: oklch(0.575 0.145 53);
  --tint-a-btn: oklch(0.5 0.145 265);
  --tint-b-btn: oklch(0.5 0.145 310);
  --tint-c-btn: oklch(0.5 0.145 200);
  --tint-d-btn: oklch(0.5 0.145 162);
  --tint-e-btn: oklch(0.5 0.145 78);
  --tint-f-btn: oklch(0.5 0.145 28);
  --tint-g-btn: oklch(0.5 0.145 340);
  --tint-h-btn: oklch(0.5 0.145 120);
  --tint-i-btn: oklch(0.5 0.145 230);
  --tint-j-btn: oklch(0.5 0.145 53);
```

to:

```css
  --tint-j: oklch(0.575 0.145 53);
  --tint-k: oklch(0.575 0.145 10);
  --tint-a-btn: oklch(0.5 0.145 265);
  --tint-b-btn: oklch(0.5 0.145 310);
  --tint-c-btn: oklch(0.5 0.145 200);
  --tint-d-btn: oklch(0.5 0.145 162);
  --tint-e-btn: oklch(0.5 0.145 78);
  --tint-f-btn: oklch(0.5 0.145 28);
  --tint-g-btn: oklch(0.5 0.145 340);
  --tint-h-btn: oklch(0.5 0.145 120);
  --tint-i-btn: oklch(0.5 0.145 230);
  --tint-j-btn: oklch(0.5 0.145 53);
  --tint-k-btn: oklch(0.5 0.145 10);
```

Change the dark `:root[data-theme="dark"]` tint block (`apps/web/src/index.css:123-142`) — currently ending with:

```css
  --tint-j: oklch(0.8 0.125 53);
  --tint-a-btn: var(--tint-a);
  --tint-b-btn: var(--tint-b);
  --tint-c-btn: var(--tint-c);
  --tint-d-btn: var(--tint-d);
  --tint-e-btn: var(--tint-e);
  --tint-f-btn: var(--tint-f);
  --tint-g-btn: var(--tint-g);
  --tint-h-btn: var(--tint-h);
  --tint-i-btn: var(--tint-i);
  --tint-j-btn: var(--tint-j);
```

to:

```css
  --tint-j: oklch(0.8 0.125 53);
  --tint-k: oklch(0.8 0.125 10);
  --tint-a-btn: var(--tint-a);
  --tint-b-btn: var(--tint-b);
  --tint-c-btn: var(--tint-c);
  --tint-d-btn: var(--tint-d);
  --tint-e-btn: var(--tint-e);
  --tint-f-btn: var(--tint-f);
  --tint-g-btn: var(--tint-g);
  --tint-h-btn: var(--tint-h);
  --tint-i-btn: var(--tint-i);
  --tint-j-btn: var(--tint-j);
  --tint-k-btn: var(--tint-k);
```

- [ ] **Step 6: Register the tool in `registry.tsx`**

In `apps/web/src/tools/registry.tsx`, add the imports (alongside the existing `Protect`/`Watermark` imports):

```tsx
import { RedactOptions } from "./options/RedactOptions";
import { redactEngine } from "@/engines/redact";
import { RedactWorkspace } from "./redact/RedactWorkspace";
```

Change the `icons` import block (`apps/web/src/tools/registry.tsx:23-34`) from:

```tsx
import {
  CompressIcon,
  MergeIcon,
  SplitIcon,
  OrganizeIcon,
  PdfToImagesIcon,
  ImagesToPdfIcon,
  ConvertImagesIcon,
  SignIcon,
  ProtectIcon,
  WatermarkIcon,
} from "./icons";
```

to:

```tsx
import {
  CompressIcon,
  MergeIcon,
  SplitIcon,
  OrganizeIcon,
  PdfToImagesIcon,
  ImagesToPdfIcon,
  ConvertImagesIcon,
  SignIcon,
  ProtectIcon,
  WatermarkIcon,
  RedactIcon,
} from "./icons";
```

Add a new entry to the `TOOLS` array, directly after the `watermark` entry (`apps/web/src/tools/registry.tsx:46`, before the closing `];`):

```tsx
  { slug: "redact", name: "Redact PDF", description: "Black out sensitive text, photos or signatures — visually or for good.", category: "pdf", Icon: RedactIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "visual", boxes: [] }, OptionsPanel: RedactOptions, engine: redactEngine, status: "live", tint: "k", Workspace: RedactWorkspace },
```

- [ ] **Step 7: Typecheck**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Run the full web test suite to check for regressions**

Run (from `apps/web`): `npx vitest run`
Expected: PASS, no new failures.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/tools/redact/RedactBoxElement.tsx apps/web/src/tools/redact/RedactWorkspace.tsx apps/web/src/tools/options/RedactOptions.tsx apps/web/src/tools/tint.ts apps/web/src/tools/icons.tsx apps/web/src/tools/registry.tsx apps/web/src/index.css
git commit -m "feat(web): wire up the Redact PDF tool"
```

---

### Task 5: Copy sync (ten tools -> eleven)

**Depends on:** Task 3 and Task 4 (both must be merged — this task makes the "eleven tools" claim true).

**Files:**
- Modify: `README.md`
- Modify: `apps/desktop/src/routes/Home.tsx`
- Modify: `apps/web/src/pages/Home.tsx`
- Modify: `apps/web/src/pages/ToolsIndex.tsx`
- Modify: `apps/web/src/pages/Download.tsx`
- Modify: `apps/web/src/components/layout/SiteFooter.tsx`

**Interfaces:** none — this task only changes copy, no code interfaces.

- [ ] **Step 1: Update `README.md`**

Change the section header (`README.md:37`) from:

```markdown
## The ten tools
```

to:

```markdown
## The eleven tools
```

Add a new row to the tools table (`README.md:39-50`), directly after the Watermark row and before the Compress row:

```markdown
| Watermark, Page Numbers & Stamp | Add a repeating watermark, sequential page numbers, or a fixed stamp to every page |
| Redact PDF | Black out sensitive text, photos or signatures — visually or for good |
| Compress PDF | Lossless, Balanced or Strong, with the size trade-off shown |
```

- [ ] **Step 2: Update the desktop Home hero**

In `apps/desktop/src/routes/Home.tsx`, change (`apps/desktop/src/routes/Home.tsx:44`):

```
TEN TOOLS · ZERO UPLOADS
```

to:

```
ELEVEN TOOLS · ZERO UPLOADS
```

- [ ] **Step 3: Update the web Home page**

In `apps/web/src/pages/Home.tsx`, change (`apps/web/src/pages/Home.tsx:19`):

```
TEN TOOLS · ZERO UPLOADS
```

to:

```
ELEVEN TOOLS · ZERO UPLOADS
```

and change (`apps/web/src/pages/Home.tsx:61`):

```tsx
<h2 className="m-0 text-[26px] font-semibold tracking-[-0.025em]">Ten tools, one page each</h2>
```

to:

```tsx
<h2 className="m-0 text-[26px] font-semibold tracking-[-0.025em]">Eleven tools, one page each</h2>
```

- [ ] **Step 4: Update the web ToolsIndex page**

In `apps/web/src/pages/ToolsIndex.tsx`, change (`apps/web/src/pages/ToolsIndex.tsx:13-16`):

```tsx
      <p className="mt-2.5 max-w-[58ch] text-[15.5px] text-muted">
        Each one runs locally. Pick a tool, drop a file, get a file — the
        same ten that ship in the desktop app.
      </p>
```

to:

```tsx
      <p className="mt-2.5 max-w-[58ch] text-[15.5px] text-muted">
        Each one runs locally. Pick a tool, drop a file, get a file — the
        same eleven that ship in the desktop app.
      </p>
```

- [ ] **Step 5: Update the web Download page**

In `apps/web/src/pages/Download.tsx`, change (`apps/web/src/pages/Download.tsx:64`):

```tsx
            The same ten tools, with no browser in the way.
```

to:

```tsx
            The same eleven tools, with no browser in the way.
```

- [ ] **Step 6: Update the site footer**

In `apps/web/src/components/layout/SiteFooter.tsx`, change (`apps/web/src/components/layout/SiteFooter.tsx:13`):

```tsx
            Ten PDF and image tools that run on your machine. Browser or desktop, your choice.
```

to:

```tsx
            Eleven PDF and image tools that run on your machine. Browser or desktop, your choice.
```

- [ ] **Step 7: Run both test suites to check for regressions**

Run (from `apps/desktop`): `npx vitest run`
Run (from `apps/web`): `npx vitest run`
Expected: PASS on both, no new failures.

- [ ] **Step 8: Commit**

```bash
git add README.md apps/desktop/src/routes/Home.tsx apps/web/src/pages/Home.tsx apps/web/src/pages/ToolsIndex.tsx apps/web/src/pages/Download.tsx apps/web/src/components/layout/SiteFooter.tsx
git commit -m "docs: update tool count copy for Redact PDF (ten -> eleven)"
```

---

### Task 6: Integration & cross-engine visual verification

**Depends on:** Task 5.

**Files:** none created or modified — this is a verification-only task, mirroring the manual side-by-side check already done for the Watermark feature.

- [ ] **Step 1: Build a shared source PDF and run both engines**

Using a scratch script (Python for the desktop side calling `pdf_redact.run()` directly, a temporary vitest file for the web side calling `redactEngine` directly, deleted after use — same approach used to verify Watermark), produce four outputs from the *same* 2-page source PDF and the *same* box (roughly centered, covering ~30% of the page):

- desktop, mode `"visual"`
- web, mode `"visual"`
- desktop, mode `"true"`
- web, mode `"true"`

- [ ] **Step 2: Rasterize and compare**

Rasterize each output's first page to PNG (the repo's vendored Ghostscript, or the desktop `pdf.to_img` op) and visually inspect (Read tool) each desktop/web pair side by side. Confirm:

- Visual mode: the black box sits at the same position/size on both, and the original page content is visible around it on both.
- True mode: the redacted page looks the same (box position/size, black fill) on both, and the un-redacted second page is untouched on both.

- [ ] **Step 3: Clean up**

Delete every scratch file created for this check (the shared source PDF, the four outputs, their rasterized PNGs, and the temporary vitest file). Confirm `git status --short` shows nothing new or dirty.

- [ ] **Step 4: Final whole-branch review**

Dispatch the final code-reviewer subagent (per `subagent-driven-development`) against the full `feature/redact-pdf` branch diff before merge.
