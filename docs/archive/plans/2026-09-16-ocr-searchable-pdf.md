# OCR → Searchable PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a twelfth tool, `ocr`, that takes a scanned/image-only PDF and returns a new PDF where the pages look identical but now carry an invisible, selectable/searchable text layer, on both the desktop app and the web app.

**Architecture:** Desktop rasterizes each page with the already-vendored Ghostscript at 300 DPI, runs a newly-vendored native Tesseract binary per page (its `pdf` output mode already produces a single-page searchable PDF — image plus invisible text — with zero custom text-placement code needed), then reassembles the per-page PDFs with pikepdf. Web renders each page via `pdf.js` to a canvas, runs `tesseract.js` (the WASM build of the same engine, with worker/core/language files bundled locally — never CDN-fetched) to get recognized words and bounding boxes, then builds the output with `pdf-lib`: the rasterized page image plus each word drawn with PDF text-rendering-mode 3 (`TextRenderingMode.Invisible`, confirmed present in the installed pdf-lib 1.17.1 and publicly exported).

**Tech Stack:** Desktop: pikepdf, reportlab, the vendored Ghostscript binary (all already in use), plus a newly vendored Tesseract binary + `eng.traineddata`. Web: pdf-lib, pdfjs-dist (already in use), plus the new `tesseract.js` / `tesseract.js-core` npm packages with `eng.traineddata` bundled as a static asset.

## Global Constraints

- OCR language is fixed to English (`eng.traineddata`) for v1. No per-page language override, no language picker.
- Rasterization DPI is fixed at 300 (not the app's usual 200 DPI elsewhere), not user-configurable.
- Input must be a PDF; standalone images are out of scope (use Images → PDF first).
- A PDF with any pre-existing extractable text is rejected outright with `ALREADY_HAS_TEXT`, not partially processed.
- No deskew/despeckle preprocessing, no OCR-confidence UI, no mixed native+scanned per-page handling.
- Both the Tesseract binary + `eng.traineddata` (desktop) and `tesseract.js` + its worker/core/language files (web) must be fully local — nothing fetched from a CDN at runtime, matching this app's "never leaves your machine" guarantee.
- Tint key `"l"`; `Tint`/`TintKey` types on both platforms extended accordingly, including desktop's own `index.css` (not just web's — a gap the Redact PDF plan hit and had to fix after the fact).
- Tool count copy (README, both apps' Home/Download/ToolsIndex/Footer) moves from eleven to twelve tools — update on both platforms, including the desktop download page on the website.
- No bespoke canvas/workspace UI on either platform — this tool has no positioning step, so it uses the same generic drop-zone → options → run flow as Protect & Unlock / Compress, not the bespoke-workspace pattern Sign/Redact use.

---

## File Structure

**Desktop:**
- `apps/desktop/sidecar/ops/_common.py` — modify: add `find_tesseract()` / `has_tesseract()`, mirroring `find_ghostscript()` / `has_ghostscript()`.
- `apps/desktop/sidecar/ops/pdf_ocr.py` — new: the `pdf.ocr` op.
- `apps/desktop/sidecar/tests/test_pdf_ocr.py` — new.
- `apps/desktop/sidecar/main.py` — modify: register the op in `DISPATCH`.
- `apps/desktop/sidecar/PROTOCOL.md` — modify: document `pdf.ocr`.
- `apps/desktop/src/lib/jobs.ts` — modify: `PdfOcrParams`/`PdfOcrResult` types, `OpMap` entry.
- `apps/desktop/src/lib/tools.ts` — modify: new `TOOLS` entry, `Tint` extended to `"l"`.
- `apps/desktop/src/lib/run.ts` — modify: new `case "pdf.ocr":`.
- `apps/desktop/src/components/OptionsPanel.tsx` — modify: new `case "ocr":`.
- `apps/desktop/src/index.css` — modify: `--tint-l` (light + dark).
- `apps/desktop/HANDOVER.md` — modify: document the vendored Tesseract binary, same as the existing Ghostscript entry.

**Web:**
- `apps/web/package.json` — modify: add `tesseract.js` and `tesseract.js-core`.
- `apps/web/public/tesseract/` — new: locally-hosted worker/core/language files (not committed as generated npm output — copied in by a setup step, see Task 2).
- `apps/web/src/engines/ocr.ts` — new: `ocrEngine`.
- `apps/web/src/engines/ocr.test.ts` — new.
- `apps/web/src/tools/options/OcrOptions.tsx` — new: near-empty placeholder (explanatory copy only, no controls).
- `apps/web/src/tools/icons.tsx` — modify: add `OcrIcon`.
- `apps/web/src/tools/tint.ts` — modify: `TintKey` extended to `"l"`.
- `apps/web/src/tools/registry.tsx` — modify: new `TOOLS` entry.
- `apps/web/src/index.css` — modify: `--tint-l` / `--tint-l-btn` (light + dark).

**Shared copy (Task 3, done directly, not by a subagent):**
- `README.md`, `apps/desktop/src/routes/Home.tsx`, `apps/web/src/pages/{Home,ToolsIndex,Download}.tsx`, `apps/web/src/components/layout/SiteFooter.tsx` — tool count eleven → twelve.

---

## Wave plan

- **Wave 1 (parallel, independent):** Task 1 (desktop: vendoring + op + tests + desktop wiring) and Task 2 (web: dependency + engine + tests + web wiring) touch entirely disjoint files and can run in isolated worktrees simultaneously.
- **Wave 2 (sequential, after both merge):** Task 3 (shared website copy sync — small, done directly) then Task 4 (final whole-branch review + cross-engine visual verification).

---

## Task 1: Desktop — vendor Tesseract, `pdf.ocr` op, desktop wiring

**Files:**
- Modify: `apps/desktop/sidecar/ops/_common.py`
- Create: `apps/desktop/sidecar/ops/pdf_ocr.py`
- Create: `apps/desktop/sidecar/tests/test_pdf_ocr.py`
- Modify: `apps/desktop/sidecar/main.py`
- Modify: `apps/desktop/sidecar/PROTOCOL.md`
- Modify: `apps/desktop/src/lib/jobs.ts`
- Modify: `apps/desktop/src/lib/tools.ts`
- Modify: `apps/desktop/src/lib/run.ts`
- Modify: `apps/desktop/src/components/OptionsPanel.tsx`
- Modify: `apps/desktop/src/index.css`
- Modify: `apps/desktop/HANDOVER.md`

**Interfaces:**
- Produces (Python): `find_tesseract() -> str` and `has_tesseract() -> bool` in `ops/_common.py`, structurally identical to the existing `find_ghostscript()`/`has_ghostscript()`. Raises `OpError("TESSERACT_MISSING", ...)`.
- Produces (Python): `ops.pdf_ocr.run(params: dict, progress: ProgressFn) -> dict` where `params = {"input": str, "output": str}` and the result is `{"output": str, "bytes": int, "pages": int}`.
- Produces (TS): `OpName` gains `"pdf.ocr"`; `PdfOcrParams { input: string; output: string }`; `PdfOcrResult { output: string; bytes: number; pages: number }`.
- Consumes: `existing_file`, `require`, `atomic_output`, `open_pdf`, `size_of`, `temp_dir`, `find_ghostscript` from `_common.py` (all already used by `pdf_redact.py`); the codebase's existing `Tool`/`OpMap`/`OptionsPanel` shapes.

### Step 1: Vendor the Tesseract binary locally, for use by every later step in this task

Tesseract is a new third-party binary this app has never shipped before — every later step needs a real, working `vendor/tesseract/tesseract.exe` on disk to run against, so this happens first, not last.

- [ ] **Download and install the Windows build.** Get the latest 64-bit installer from the UB Mannheim Tesseract project (`https://github.com/UB-Mannheim/tesseract/wiki`, which links to the actual `.exe` hosted at `https://digi.bib.uni-mannheim.de/tesseract/`). This is the same project this app's Ghostscript binary's install pattern is modeled on (an NSIS installer supporting silent install), and is the de facto standard source for a Windows Tesseract build.

- [ ] **Silent-install it to a temp location, then copy what's needed into `vendor/`.** From the repo root:

```powershell
# Adjust the filename to whatever version you actually downloaded.
$installer = "$env:TEMP\tesseract-ocr-w64-setup.exe"
$installDir = "$env:TEMP\tesseract-install"
& $installer /S "/D=$installDir"
# NSIS installers exit before the copy is done in some environments; wait for
# tesseract.exe to actually appear rather than a fixed sleep.
while (-not (Test-Path "$installDir\tesseract.exe")) { Start-Sleep -Milliseconds 500 }

New-Item -ItemType Directory -Force -Path "vendor\tesseract" | Out-Null
Copy-Item "$installDir\tesseract.exe" "vendor\tesseract\" -Force
Copy-Item "$installDir\*.dll" "vendor\tesseract\" -Force
New-Item -ItemType Directory -Force -Path "vendor\tesseract\tessdata" | Out-Null
Copy-Item "$installDir\tessdata\eng.traineddata" "vendor\tesseract\tessdata\" -Force
```

Only `eng.traineddata` is copied — per the design's English-only v1 scope, don't copy the installer's other bundled language files.

- [ ] **Confirm it actually runs**, and record the real installer hash for `HANDOVER.md` (Step 11 below reuses this):

```powershell
& "vendor\tesseract\tesseract.exe" --version
(Get-FileHash $installer -Algorithm SHA256).Hash
```

Expected: version output prints without error (proves the copied DLLs are sufficient — `tesseract.exe` alone is not self-contained). Keep the hash for Step 11.

- [ ] **Confirm `$ILOATHEPDF_TESSERACT` will be usable for tests too** — no action here, just note the path for Step 2's implementation: `<repo root>\vendor\tesseract\tesseract.exe`. `vendor/` is already gitignored (see `vendor/README.txt`), matching how Ghostscript is handled — nothing here gets committed.

### Step 2: `find_tesseract()` / `has_tesseract()` in `_common.py`

- [ ] **Write the failing test** in `apps/desktop/sidecar/tests/test_common.py` (append):

```python
def test_find_tesseract_honors_env_override(tmp_path, monkeypatch):
    from ops._common import OpError, find_tesseract

    fake = tmp_path / "tesseract.exe"
    fake.write_bytes(b"not a real binary, just needs to exist")
    monkeypatch.setenv("ILOATHEPDF_TESSERACT", str(fake))
    assert find_tesseract() == str(fake)


def test_find_tesseract_raises_tesseract_missing_when_nothing_found(monkeypatch):
    from ops._common import OpError, find_tesseract

    monkeypatch.delenv("ILOATHEPDF_TESSERACT", raising=False)
    monkeypatch.setattr("ops._common.shutil.which", lambda name: None)
    monkeypatch.setattr("ops._common.Path.is_file", lambda self: False)

    with pytest.raises(OpError) as exc:
        find_tesseract()
    assert exc.value.code == "TESSERACT_MISSING"
```

- [ ] **Run test to verify it fails**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_common.py -k tesseract -v` (from `apps/desktop/`)
Expected: FAIL with `ImportError: cannot import name 'find_tesseract'`

- [ ] **Implement it**, appended to `apps/desktop/sidecar/ops/_common.py`:

```python
# --------------------------------------------------------------------------
# tesseract discovery (used by pdf_ocr)
# --------------------------------------------------------------------------

def find_tesseract() -> str:
    """Locate the Tesseract executable, or raise TESSERACT_MISSING.

    Search order mirrors find_ghostscript():
      1. $ILOATHEPDF_TESSERACT                (explicit override, used by tests)
      2. <repo or bundle>/vendor/tesseract/tesseract.exe   (shipped copy)
      3. PATH
    """
    override = os.environ.get("ILOATHEPDF_TESSERACT")
    if override and Path(override).is_file():
        return override

    names = ["tesseract.exe"] if os.name == "nt" else ["tesseract"]

    # Dev: sidecar/ops/_common.py -> sidecar/ops -> sidecar -> project root.
    # Bundle: the exe sits in <resources>/sidecar/, vendor/ in <resources>/.
    exe_dir = Path(sys.executable).resolve().parent
    roots = (Path(__file__).resolve().parents[2], exe_dir, exe_dir.parent)
    for root in roots:
        for name in names:
            candidate = root / "vendor" / "tesseract" / name
            if candidate.is_file():
                return str(candidate)

    for name in names:
        found = shutil.which(name)
        if found:
            return found

    raise OpError(
        "TESSERACT_MISSING",
        "Tesseract was not found. OCR needs it to recognise text.",
    )


def has_tesseract() -> bool:
    try:
        find_tesseract()
        return True
    except OpError:
        return False
```

- [ ] **Run test to verify it passes**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_common.py -k tesseract -v`
Expected: PASS (2 passed)

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/ops/_common.py apps/desktop/sidecar/tests/test_common.py
git commit -m "feat(desktop): add find_tesseract/has_tesseract to sidecar _common"
```

### Step 3: `pdf_ocr.py` — reject a PDF that already has text

- [ ] **Write the failing test** in new `apps/desktop/sidecar/tests/test_pdf_ocr.py`:

```python
"""Tests for `pdf.ocr` -- OCR a scanned PDF into a searchable one."""
from __future__ import annotations

from pathlib import Path

import pikepdf
import pytest

from ops import pdf_ocr
from ops._common import OpError, has_ghostscript, has_tesseract, noop_progress

needs_gs = pytest.mark.skipif(not has_ghostscript(), reason="ghostscript not installed")
needs_tesseract = pytest.mark.skipif(not has_tesseract(), reason="tesseract not installed")


def _make_text_pdf(tmp_path: Path) -> Path:
    """A one-page PDF with real, vector, extractable text -- not a scan."""
    from reportlab.pdfgen import canvas as pdfcanvas

    out = tmp_path / "has_text.pdf"
    c = pdfcanvas.Canvas(str(out), pagesize=(595, 842))
    c.drawString(72, 700, "This PDF already has real text.")
    c.save()
    return out


def test_ocr_rejects_a_pdf_that_already_has_text(tmp_path, out_dir):
    src = _make_text_pdf(tmp_path)
    with pytest.raises(OpError) as exc:
        pdf_ocr.run({"input": str(src), "output": str(out_dir / "o.pdf")}, noop_progress)
    assert exc.value.code == "ALREADY_HAS_TEXT"
    assert not (out_dir / "o.pdf").exists()


def test_ocr_accepts_an_image_only_pdf_past_the_text_guard(make_pdf, out_dir, monkeypatch):
    # make_pdf's pages are PIL-rasterised images with no PDF text operators
    # (see conftest.py) -- this only proves the guard doesn't false-positive
    # on them; it doesn't require Ghostscript/Tesseract to actually run, so
    # the rest of the pipeline is stubbed out.
    monkeypatch.setattr("ops.pdf_ocr._ocr_page", lambda *a, **k: None)
    monkeypatch.setattr(
        "ops.pdf_ocr.pikepdf.Pdf.new",
        lambda: pikepdf.open(str(make_pdf("stub", pages=1))),
    )
    src = make_pdf("a", pages=1)
    # This will still fail past the guard (no real OCR happened), which is
    # fine -- this test only asserts ALREADY_HAS_TEXT was NOT raised.
    try:
        pdf_ocr.run({"input": str(src), "output": str(out_dir / "o.pdf")}, noop_progress)
    except OpError as exc:
        assert exc.code != "ALREADY_HAS_TEXT"
```

The second test's heavy stubbing is awkward — it exists only to prove the guard doesn't misfire before Steps 4-6 give us a real end-to-end path to test against instead. Delete it once `test_ocr_round_trip_produces_selectable_text` (Step 6) exists, since that test exercises the same guard for real.

- [ ] **Run test to verify it fails**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_ocr.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ops.pdf_ocr'`

- [ ] **Implement the guard**, new `apps/desktop/sidecar/ops/pdf_ocr.py`:

```python
"""`pdf.ocr` -- add an invisible, searchable text layer to a scanned PDF.

Every page is rasterised with Ghostscript at 300 DPI (higher than this app's
usual 200 DPI -- OCR accuracy is materially sensitive to input resolution)
and fed to Tesseract, whose own `pdf` output mode already produces a
single-page PDF with the source image plus an invisible OCR text layer --
no custom text-placement code needed here. The per-page PDFs are then
reassembled into one document with pikepdf, in order.

A PDF that already has extractable text is rejected outright rather than
partially processed, the same "refuse a mismatched input" discipline
`pdf.redact`'s rotation/crop guard uses -- OCR-ing a page that never needed
it risks two overlapping, possibly conflicting text layers.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    find_ghostscript,
    find_tesseract,
    open_pdf,
    require,
    size_of,
    temp_dir,
)

_OCR_DPI = 300
_TEXT_OPS = {"Tj", "TJ", "'", '"'}


def _page_has_text(page) -> bool:
    """True if the page's content stream draws any text."""
    import pikepdf

    instructions = pikepdf.parse_content_stream(page)
    return any(str(instr.operator) in _TEXT_OPS for instr in instructions)


def run(params: dict, progress: ProgressFn) -> dict:
    import pikepdf

    path = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))

    with open_pdf(path) as src:
        total = len(src.pages)
        for page in src.pages:
            if _page_has_text(page):
                raise OpError(
                    "ALREADY_HAS_TEXT",
                    "This PDF already has selectable text -- OCR is for scanned/image-only PDFs.",
                )

    raise NotImplementedError("rasterize + OCR + reassemble: Steps 4-6")
```

- [ ] **Run test to verify it passes**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_ocr.py -v`
Expected: `test_ocr_rejects_a_pdf_that_already_has_text` PASSES. `test_ocr_accepts_an_image_only_pdf_past_the_text_guard` currently fails with `NotImplementedError` wrapped as an unhandled exception (not `OpError`), which is expected and will be fixed by Step 4-6 — don't chase it yet.

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/ops/pdf_ocr.py apps/desktop/sidecar/tests/test_pdf_ocr.py
git commit -m "feat(desktop): pdf.ocr rejects PDFs that already have text"
```

### Step 4: Rasterize + run Tesseract per page

- [ ] **Add to `pdf_ocr.py`** (before `run`, replacing the `raise NotImplementedError`):

```python
def _no_window_flags() -> int:
    return getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _rasterize_page(src: Path, page_no: int, dest: Path, progress: ProgressFn, pct: int, note: str) -> None:
    """Render one 1-based page of `src` to a PNG at `dest` with Ghostscript."""
    gs = find_ghostscript()
    proc = subprocess.Popen(
        [
            gs, "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE",
            "-sDEVICE=png16m", f"-r{_OCR_DPI}",
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


def _tessdata_dir_for(tesseract_exe: str) -> Path | None:
    """The tessdata/ folder shipped beside a vendored Tesseract, if any.

    When Tesseract was found via PATH (a real system install) rather than
    our vendor/ folder, there is no co-located tessdata to point at -- leave
    Tesseract to find its own via its compiled-in default / TESSDATA_PREFIX,
    rather than guessing at a system layout we don't control.
    """
    candidate = Path(tesseract_exe).resolve().parent / "tessdata"
    return candidate if candidate.is_dir() else None


def _ocr_page(image_path: Path, output_base: Path, progress: ProgressFn, pct: int, note: str) -> None:
    """Run Tesseract on `image_path`, producing `<output_base>.pdf` -- a
    single-page PDF with the source image plus an invisible text layer."""
    exe = find_tesseract()
    argv = [exe, str(image_path), str(output_base)]
    tessdata_dir = _tessdata_dir_for(exe)
    if tessdata_dir is not None:
        argv += ["--tessdata-dir", str(tessdata_dir)]
    argv += ["-l", "eng", "pdf"]

    proc = subprocess.Popen(
        argv,
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
        raise OpError("INTERNAL", "Tesseract failed: " + " ".join(tail))
```

- [ ] **Write the failing test** appended to `test_pdf_ocr.py`:

```python
@needs_gs
@needs_tesseract
def test_ocr_page_produces_a_searchable_single_page_pdf(make_pdf, tmp_path):
    src = make_pdf("a", pages=1)
    png = tmp_path / "page-1.png"
    pdf_ocr._rasterize_page(src, 1, png, noop_progress, 0, "page 1")
    assert png.exists() and png.stat().st_size > 0

    output_base = tmp_path / "page-1"
    pdf_ocr._ocr_page(png, output_base, noop_progress, 0, "page 1")
    out_pdf = output_base.with_suffix(".pdf")
    assert out_pdf.exists()
    with pikepdf.open(str(out_pdf)) as ocred:
        assert len(ocred.pages) == 1
        assert pdf_ocr._page_has_text(ocred.pages[0])
```

- [ ] **Run test to verify it fails**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_ocr.py -k produces_a_searchable -v`
Expected: FAIL (marks skip if Ghostscript/Tesseract aren't on this machine yet -- once both are vendored per Step 1, it should run and initially fail only if the helpers above aren't wired in yet; if Step 4's code above is already in place, this should already PASS -- if so, treat this as the "write the test that pins the new behavior down" step and move straight to verifying it passes)

- [ ] **Run test to verify it passes**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_ocr.py -k produces_a_searchable -v`
Expected: PASS (or SKIPPED if this machine has no vendored Tesseract yet -- acceptable during development, but must PASS on the machine that vendors it in Step 1, and on CI once Step 12 wires Tesseract into the CI job the same way Ghostscript already is)

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/ops/pdf_ocr.py apps/desktop/sidecar/tests/test_pdf_ocr.py
git commit -m "feat(desktop): pdf.ocr rasterizes pages and runs Tesseract per page"
```

### Step 5: Reassemble per-page PDFs into one document; finish `run()`

- [ ] **Replace the `raise NotImplementedError("rasterize + OCR + reassemble: Steps 4-6")` line in `run()`** with:

```python
        pages_total = total

    progress(5, f"OCR-ing {pages_total} page(s)")

    with temp_dir() as tmp:
        page_pdfs: list[Path] = []
        for page_no in range(1, pages_total + 1):
            note = f"page {page_no} of {pages_total}"
            pct = 5 + int(70 * (page_no - 1) / pages_total)
            png_path = tmp / f"page-{page_no}.png"
            _rasterize_page(path, page_no, png_path, progress, pct, note)

            output_base = tmp / f"page-{page_no}"
            _ocr_page(png_path, output_base, progress, pct, note)
            page_pdfs.append(output_base.with_suffix(".pdf"))
            progress(5 + int(70 * page_no / pages_total), note)

        progress(80, "Assembling pages")
        with pikepdf.Pdf.new() as dst:
            for page_pdf_path in page_pdfs:
                with pikepdf.open(page_pdf_path) as page_pdf:
                    dst.pages.append(page_pdf.pages[0])

            progress(92, "Writing output")
            with atomic_output(dest) as tmp_out:
                try:
                    dst.save(str(tmp_out))
                except OSError as exc:
                    raise OpError("OUTPUT_WRITE_FAILED", f"Cannot write {dest}: {exc}") from exc

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest), "pages": pages_total}
```

Note the `with open_pdf(path) as src:` block from Step 3 now needs `total` captured before its `with` block closes -- adjust the guard code so `total = len(src.pages)` is assigned inside that block (already is, from Step 3) and the block exits cleanly into `pages_total = total` above. Also move the two missing-binary checks (`find_ghostscript()`, `find_tesseract()`) to right after the guard, before the `temp_dir()` block, so a missing binary fails fast -- add this right after the `with open_pdf(path) as src:` block closes and before `progress(5, ...)`:

```python
    # Resolved before any processing so a missing binary fails fast and
    # loudly, the same discipline pdf.redact's True Redact mode uses.
    find_ghostscript()
    find_tesseract()
```

The full `run()` function should now read:

```python
def run(params: dict, progress: ProgressFn) -> dict:
    import pikepdf

    path = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))

    with open_pdf(path) as src:
        total = len(src.pages)
        for page in src.pages:
            if _page_has_text(page):
                raise OpError(
                    "ALREADY_HAS_TEXT",
                    "This PDF already has selectable text -- OCR is for scanned/image-only PDFs.",
                )

    # Resolved before any processing so a missing binary fails fast and
    # loudly, the same discipline pdf.redact's True Redact mode uses.
    find_ghostscript()
    find_tesseract()

    pages_total = total
    progress(5, f"OCR-ing {pages_total} page(s)")

    with temp_dir() as tmp:
        page_pdfs: list[Path] = []
        for page_no in range(1, pages_total + 1):
            note = f"page {page_no} of {pages_total}"
            pct = 5 + int(70 * (page_no - 1) / pages_total)
            png_path = tmp / f"page-{page_no}.png"
            _rasterize_page(path, page_no, png_path, progress, pct, note)

            output_base = tmp / f"page-{page_no}"
            _ocr_page(png_path, output_base, progress, pct, note)
            page_pdfs.append(output_base.with_suffix(".pdf"))
            progress(5 + int(70 * page_no / pages_total), note)

        progress(80, "Assembling pages")
        with pikepdf.Pdf.new() as dst:
            for page_pdf_path in page_pdfs:
                with pikepdf.open(page_pdf_path) as page_pdf:
                    dst.pages.append(page_pdf.pages[0])

            progress(92, "Writing output")
            with atomic_output(dest) as tmp_out:
                try:
                    dst.save(str(tmp_out))
                except OSError as exc:
                    raise OpError("OUTPUT_WRITE_FAILED", f"Cannot write {dest}: {exc}") from exc

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest), "pages": pages_total}
```

- [ ] **Delete the awkward stubbed test** from Step 3 (`test_ocr_accepts_an_image_only_pdf_past_the_text_guard`) and **write its real replacement**, appended to `test_pdf_ocr.py`:

```python
@needs_gs
@needs_tesseract
def test_ocr_round_trip_produces_selectable_text(make_pdf, out_dir):
    src = make_pdf("scan", pages=1)  # image-only page, no text guard trip
    dest = out_dir / "searchable.pdf"

    result = pdf_ocr.run({"input": str(src), "output": str(dest)}, noop_progress)

    assert result["pages"] == 1
    assert result["output"] == str(dest)
    assert result["bytes"] > 0
    with pikepdf.open(str(dest)) as after:
        assert len(after.pages) == 1
        assert pdf_ocr._page_has_text(after.pages[0])


@needs_gs
@needs_tesseract
def test_ocr_preserves_page_count_on_multi_page_input(make_pdf, out_dir):
    src = make_pdf("scan", pages=3)
    dest = out_dir / "searchable.pdf"

    result = pdf_ocr.run({"input": str(src), "output": str(dest)}, noop_progress)

    assert result["pages"] == 3
    with pikepdf.open(str(dest)) as after:
        assert len(after.pages) == 3
        for page in after.pages:
            assert pdf_ocr._page_has_text(page)


@needs_gs
@needs_tesseract
def test_ocr_progress_reaches_100(make_pdf, out_dir):
    src = make_pdf("scan", pages=1)
    dest = out_dir / "searchable.pdf"
    calls: list[int] = []

    pdf_ocr.run({"input": str(src), "output": str(dest)}, lambda pct, note="": calls.append(pct))
    assert calls[-1] == 100
```

- [ ] **Run test to verify it fails, then implement is already done above -- run to verify it passes**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_ocr.py -v`
Expected: all PASS (or SKIPPED if Ghostscript/Tesseract aren't on this machine -- must PASS on the vendoring machine and CI)

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/ops/pdf_ocr.py apps/desktop/sidecar/tests/test_pdf_ocr.py
git commit -m "feat(desktop): pdf.ocr reassembles per-page PDFs into one searchable document"
```

### Step 6: Missing-binary and error-propagation tests

- [ ] **Write the failing tests** appended to `test_pdf_ocr.py`:

```python
def test_ocr_without_ghostscript_fails_fast(make_pdf, out_dir, monkeypatch):
    def _raise():
        raise OpError("GHOSTSCRIPT_MISSING", "Ghostscript was not found.")

    monkeypatch.setattr("ops.pdf_ocr.find_ghostscript", _raise)
    src = make_pdf("a", pages=1)
    dest = out_dir / "o.pdf"

    with pytest.raises(OpError) as exc:
        pdf_ocr.run({"input": str(src), "output": str(dest)}, noop_progress)
    assert exc.value.code == "GHOSTSCRIPT_MISSING"
    assert not dest.exists()


def test_ocr_without_tesseract_fails_fast(make_pdf, out_dir, monkeypatch):
    def _raise():
        raise OpError("TESSERACT_MISSING", "Tesseract was not found.")

    monkeypatch.setattr("ops.pdf_ocr.find_tesseract", _raise)
    src = make_pdf("a", pages=1)
    dest = out_dir / "o.pdf"

    with pytest.raises(OpError) as exc:
        pdf_ocr.run({"input": str(src), "output": str(dest)}, noop_progress)
    assert exc.value.code == "TESSERACT_MISSING"
    assert not dest.exists()


def test_ocr_propagates_encrypted_and_corrupt(encrypted_pdf, corrupt_pdf, out_dir):
    for src, code in ((encrypted_pdf, "ENCRYPTED_PDF"), (corrupt_pdf, "CORRUPT_PDF")):
        with pytest.raises(OpError) as exc:
            pdf_ocr.run({"input": str(src), "output": str(out_dir / "o.pdf")}, noop_progress)
        assert exc.value.code == code
    assert not (out_dir / "o.pdf").exists()


def test_ocr_missing_input_file(out_dir, tmp_path):
    with pytest.raises(OpError) as exc:
        pdf_ocr.run({"input": str(tmp_path / "ghost.pdf"), "output": str(out_dir / "o.pdf")}, noop_progress)
    assert exc.value.code == "FILE_NOT_FOUND"
```

- [ ] **Run test to verify it fails**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_ocr.py -k "without_ghostscript or without_tesseract or propagates or missing_input" -v`
Expected: these should already PASS given Step 5's implementation (the missing-binary checks and `existing_file`/`open_pdf` calls are already in place) -- this step is about locking the behavior down with explicit tests, not new implementation. If any fail, fix `run()` to match.

- [ ] **Run full file to confirm nothing regressed**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/tests/test_pdf_ocr.py -v`
Expected: all PASS/SKIPPED, no FAIL

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/tests/test_pdf_ocr.py
git commit -m "test(desktop): pdf.ocr missing-binary and error-propagation coverage"
```

### Step 7: Register the op in `main.py` and `PROTOCOL.md`

- [ ] **Add to `DISPATCH` in `apps/desktop/sidecar/main.py`**, alongside the existing entries (find the line registering `"pdf.watermark"` or `"pdf.redact"` and add immediately after):

```python
    "pdf.ocr": "ops.pdf_ocr:run",
```

- [ ] **Add a `### pdf.ocr` section to `apps/desktop/sidecar/PROTOCOL.md`**, following the format of the existing per-op sections (e.g. the `### pdf.redact` section added for the prior feature) — document:

```markdown
### pdf.ocr

Add an invisible, searchable text layer to a scanned/image-only PDF.

**Params:**
- `input` (string, required) — absolute path to the source PDF.
- `output` (string, required) — absolute path to write the result to.

**Result:**
- `output` (string) — the path written.
- `bytes` (number) — output file size.
- `pages` (number) — page count (unchanged from input).

**Errors:**
- `ALREADY_HAS_TEXT` — the input has extractable text on at least one page; OCR only accepts image-only/scanned PDFs.
- `GHOSTSCRIPT_MISSING` / `TESSERACT_MISSING` — the vendored binary couldn't be located.
- `ENCRYPTED_PDF`, `CORRUPT_PDF`, `FILE_NOT_FOUND` — same as every other PDF-reading op.
```

- [ ] **Run the full sidecar test suite to confirm the dispatch wiring didn't break anything else**

Run: `apps/desktop/.venv/Scripts/python.exe -m pytest sidecar/ -v`
Expected: same pass/skip counts as before this task, plus the new `test_pdf_ocr.py` tests

- [ ] **Commit**

```bash
git add apps/desktop/sidecar/main.py apps/desktop/sidecar/PROTOCOL.md
git commit -m "feat(desktop): register pdf.ocr in the sidecar dispatch table"
```

### Step 8: `jobs.ts` types + `OpMap` entry

- [ ] **Add to `apps/desktop/src/lib/jobs.ts`**, near the other single-PDF-in/single-PDF-out param/result types (e.g. right after `PdfRedactResult`):

```typescript
export interface PdfOcrParams { input: string; output: string }
export interface PdfOcrResult { output: string; bytes: number; pages: number }
```

- [ ] **Add to the `OpMap` interface**, alongside the existing entries:

```typescript
  "pdf.ocr": [PdfOcrParams, PdfOcrResult];
```

- [ ] **Typecheck**

Run: `cd apps/desktop && npm run typecheck` (or the project's equivalent `tsc --noEmit` script — check `package.json` if the exact script name differs)
Expected: clean (no errors) — `"pdf.ocr"` isn't referenced by `tools.ts`/`run.ts` yet, so this only proves the new types themselves are well-formed.

- [ ] **Commit**

```bash
git add apps/desktop/src/lib/jobs.ts
git commit -m "feat(desktop): add PdfOcrParams/PdfOcrResult and pdf.ocr to OpMap"
```

### Step 9: `tools.ts`, `run.ts`, `OptionsPanel.tsx`, `index.css` wiring

- [ ] **Extend `Tint` in `apps/desktop/src/lib/tools.ts`**:

```typescript
export type Tint = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l";
```

- [ ] **Import a new icon** — add `ScanText` to the existing `lucide-react` import block in `tools.ts`:

```typescript
import {
  Combine,
  EyeOff,
  FileImage,
  FileOutput,
  Images,
  Lock,
  Minimize2,
  Replace,
  ScanText,
  Scissors,
  Signature,
  Stamp,
} from "lucide-react";
```

- [ ] **Add a new `TOOLS` entry**, after the `redact` entry:

```typescript
  {
    id: "ocr",
    path: "/t/ocr",
    title: "OCR → Searchable PDF",
    description: "Add an invisible text layer to a scanned PDF so it's searchable and selectable.",
    icon: ScanText,
    group: "pdf",
    tint: "l",
    op: "pdf.ocr",
    accepts: ["pdf"],
    acceptsLabel: "a PDF file",
    multiple: false,
    ordered: false,
    action: "Save PDF",
    defaults: {},
  },
```

- [ ] **Add a `case "pdf.ocr":` to `execute()` in `apps/desktop/src/lib/run.ts`**, after the `case "pdf.protect":` block:

```typescript
    case "pdf.ocr": {
      const r = await runJob(
        "pdf.ocr",
        {
          input: first.path,
          output: join(`${base}-searchable.pdf`),
        },
        opts,
      );
      return {
        outputs: [{ path: r.output, bytes: r.bytes }],
        summary: `${r.pages} page(s) made searchable.`,
      };
    }
```

- [ ] **Add a `case "ocr":` to the switch in `apps/desktop/src/components/OptionsPanel.tsx`**, after the `case "redact":`/`case "protect":` blocks (wherever the switch is — insert alphabetically-adjacent to keep the existing ordering convention if there is one, otherwise right after `"organize"`):

```typescript
    case "ocr":
      return (
        <OptionsPanel
          className={className}
          description="Scans your PDF and adds an invisible, searchable text layer over the original pages. English only for now — no options to configure."
        >
          {null}
        </OptionsPanel>
      );
```

- [ ] **Add `--tint-l` to `apps/desktop/src/index.css`**, in both the light `:root` block (immediately after the existing `--tint-k` line) and the dark `:root[data-theme="dark"]` block (same position) — pick a hue distinct from `k`'s warm red (10) so OCR doesn't read as another "caution" tint; use hue 140 (a cool green, reading as "processing/complete", distinct from every existing hue 265/310/…/10):

```css
  --tint-l: oklch(0.575 0.145 140);
```

(light block) and

```css
  --tint-l: oklch(0.8 0.125 140);
```

(dark block). Confirm the exact surrounding syntax against the existing `--tint-k` lines before editing — copy their oklch lightness/chroma values exactly, only the hue (last number) changes.

- [ ] **Typecheck and build**

Run: `cd apps/desktop && npm run typecheck && npm run build` (adjust script names to match `package.json` if different)
Expected: clean typecheck, successful build

- [ ] **Commit**

```bash
git add apps/desktop/src/lib/tools.ts apps/desktop/src/lib/run.ts apps/desktop/src/components/OptionsPanel.tsx apps/desktop/src/index.css
git commit -m "feat(desktop): wire up the OCR tool in the UI"
```

### Step 10: Manual smoke test in the running desktop app

- [ ] **Launch the desktop app in dev mode** (per this repo's existing dev workflow — see `apps/desktop/README.md`), open the OCR tool, drop in a scanned-looking PDF (e.g. run Images → PDF on a photo of printed text, or reuse one of the sidecar test fixtures), run it, and confirm: the tool appears on Home with the new tint/icon, the job completes without error, the output PDF opens and its text is selectable in a real PDF viewer (Edge/Acrobat/etc — not just the test suite).
- [ ] **Confirm the "already has text" guard surfaces a sane error in the UI** — feed it any existing native PDF (e.g. one of this app's own docs) and confirm the error message from `ALREADY_HAS_TEXT` renders legibly rather than as a raw error code.

### Step 11: Document the vendored Tesseract binary in `HANDOVER.md`

- [ ] **Add a paragraph to the "Third-party binaries" section of `apps/desktop/HANDOVER.md`**, matching the existing Ghostscript entry's format, using the real version/hash recorded in Step 1:

```markdown
**Tesseract <version> (Apache-2.0)** is installed at `vendor/tesseract/`, from
the UB Mannheim Windows build
([tesseract-ocr-w64-setup, see the releases at
digi.bib.uni-mannheim.de/tesseract/](https://github.com/UB-Mannheim/tesseract/wiki)),
sha256 `<hash recorded in Step 1>`, silent-installed with `/S /D=`.
`find_tesseract()` looks there first; only `tesseract.exe`, its DLLs, and
`tessdata/eng.traineddata` are copied in (v1 is English-only, so the
installer's other bundled languages are not vendored). `ILOATHEPDF_TESSERACT`
overrides the path for ad-hoc testing.
```

- [ ] **Commit**

```bash
git add apps/desktop/HANDOVER.md
git commit -m "docs(desktop): document the vendored Tesseract binary"
```

### Step 12: Wire Tesseract into CI, mirroring how Ghostscript is already installed there

- [ ] **Read `.github/workflows/ci.yml`'s "Document engine" job** to see exactly how Ghostscript is installed for the Linux pytest run (per `HANDOVER.md`: "Document engine (pytest on Linux **with Ghostscript installed**, so the compression and rasterising tests run rather than skip)"). Find the actual install step (likely an `apt-get install ghostscript` or similar).
- [ ] **Add the equivalent for Tesseract** — on Ubuntu runners this is normally `sudo apt-get install -y tesseract-ocr tesseract-ocr-eng` (the `tesseract-ocr-eng` package specifically, since some distributions split language data out of the base package) — added as its own step, immediately alongside the existing Ghostscript install step, not replacing it.
- [ ] **Confirm `has_tesseract()`/`find_tesseract()`'s PATH fallback actually finds the apt-installed binary** — on Linux, `find_tesseract()`'s vendor-folder lookup will miss (no `vendor/tesseract/` on CI), so this exercises the plain `shutil.which("tesseract")` fallback path specifically. If this doesn't resolve cleanly, the CI job may need `TESSDATA_PREFIX` set explicitly (apt's tesseract-ocr package usually sets this up correctly on its own, but confirm by checking the CI log rather than assuming).
- [ ] **Push and confirm the "Document engine" CI job goes green** with the new OCR tests running for real (not skipped) — this is the first time this repo's CI exercises a genuinely new native dependency end to end, so treat a green run here as the real proof this task is done, not just local test output.
- [ ] **Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: install Tesseract for the Document engine job"
```

---

## Task 2: Web — `tesseract.js` integration, `ocr.ts` engine, web wiring

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/public/tesseract/` (worker/core/lang files, copied in by a setup script — not hand-written)
- Create: `apps/web/src/engines/ocr.ts`
- Create: `apps/web/src/engines/ocr.test.ts`
- Create: `apps/web/src/tools/options/OcrOptions.tsx`
- Modify: `apps/web/src/tools/icons.tsx`
- Modify: `apps/web/src/tools/tint.ts`
- Modify: `apps/web/src/tools/registry.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Produces: `ocrEngine: Engine` (the same `(input: EngineInput) => Promise<EngineResult>` shape every other engine uses, from `apps/web/src/engines/types.ts`).
- Consumes: `pdfjsLib` (`getDocument`, `page.getViewport`, `page.getTextContent`, `page.render` — same imports `pdfToImages.ts` already uses), `pdf-lib`'s `PDFDocument`, `TextRenderingMode`, `setTextRenderingMode`, `pushGraphicsState`, `popGraphicsState` (confirmed present and publicly exported from the installed `pdf-lib` 1.17.1 — `TextRenderingMode.Invisible = 3`).

### Step 1: Install `tesseract.js`, confirm it actually runs under this project's vitest+jsdom setup before building anything on top of it

This is the riskiest unknown in this task — do it first, cheaply, before writing the real engine.

- [ ] **Install the dependencies**

```bash
cd apps/web
npm install tesseract.js@^7.0.0 tesseract.js-core@^6.1.0
```

- [ ] **Write a throwaway smoke test** at `apps/web/src/engines/__ocr_smoke.test.ts` (deleted at the end of this step — it exists only to de-risk the integration before the real test suite depends on it):

```typescript
import { describe, it, expect } from "vitest";
import { createWorker } from "tesseract.js";

describe("tesseract.js smoke test", () => {
  it("recognizes text on a synthetic canvas", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 100;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 300, 100);
    ctx.fillStyle = "black";
    ctx.font = "48px sans-serif";
    ctx.fillText("HELLO", 20, 60);

    const worker = await createWorker("eng");
    try {
      const { data } = await worker.recognize(canvas);
      expect(data.text.toUpperCase()).toContain("HELLO");
    } finally {
      await worker.terminate();
    }
  }, 30000);
});
```

- [ ] **Run it**

Run: `cd apps/web && npx vitest run src/engines/__ocr_smoke.test.ts`
Expected: PASS. If it fails on worker/module resolution (not on OCR accuracy), that's the real risk this step exists to catch — resolve it here (likely needs `tesseract.js`'s default CDN-fetch behavior to succeed in this one throwaway test, since local bundling isn't wired up yet; that's fine, this step is only proving the WASM engine runs at all inside vitest+jsdom+node-canvas, not proving offline bundling works — Step 3 covers that separately) before proceeding to Step 2.
- [ ] **Delete the smoke test** — `rm apps/web/src/engines/__ocr_smoke.test.ts` — its job is done; it must not linger alongside the real test suite as an unexplained near-duplicate of `ocr.test.ts`.
- [ ] **Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json
git commit -m "chore(web): add tesseract.js dependency"
```

### Step 2: Reject a PDF that already has text (same guard as desktop, via `pdf.js`)

- [ ] **Write the failing test**, new `apps/web/src/engines/ocr.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";
import { ocrEngine } from "./ocr";
import { makeTestPdf } from "./testHelpers";

async function makeImageOnlyPdf(width = 300, height = 100): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "black";
  ctx.font = "48px sans-serif";
  ctx.fillText("HELLO", 20, 60);
  const dataUrl = canvas.toDataURL("image/png");
  const pngBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));

  const doc = await PDFDocument.create();
  const png = await doc.embedPng(pngBytes);
  const page = doc.addPage([width, height]);
  page.drawImage(png, { x: 0, y: 0, width, height });
  return doc.save();
}

describe("ocrEngine", () => {
  it("rejects a PDF that already has selectable text", async () => {
    const bytes = await makeTestPdf(1); // makeTestPdf uses drawText -> real text
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });

    await expect(ocrEngine({ files: [file], options: {} })).rejects.toThrow(/already has selectable text/i);
  });
});
```

- [ ] **Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/engines/ocr.test.ts`
Expected: FAIL — `ocr.ts` doesn't exist yet

- [ ] **Implement the guard**, new `apps/web/src/engines/ocr.ts`:

```typescript
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { Engine } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

async function pageHasText(page: pdfjsLib.PDFPageProxy): Promise<boolean> {
  const content = await page.getTextContent();
  return content.items.some((item) => "str" in item && item.str.trim().length > 0);
}

export const ocrEngine: Engine = async ({ files }) => {
  const file = files[0];
  if (!file) throw new Error("Add a scanned PDF to OCR.");

  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;

  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      if (await pageHasText(page)) {
        throw new Error("This PDF already has selectable text — OCR is for scanned/image-only PDFs.");
      }
    }

    throw new Error("not yet implemented past the text guard");
  } finally {
    await loadingTask.destroy();
  }
};
```

- [ ] **Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/engines/ocr.test.ts`
Expected: PASS

- [ ] **Commit**

```bash
git add apps/web/src/engines/ocr.ts apps/web/src/engines/ocr.test.ts
git commit -m "feat(web): pdf.ocr rejects PDFs that already have text"
```

### Step 3: Bundle `tesseract.js`'s worker/core/language files locally — never CDN-fetched

- [ ] **Locate the files to copy.** After `npm install`, the files this needs live in `node_modules`:
  - `node_modules/tesseract.js/dist/worker.min.js`
  - `node_modules/tesseract.js-core/tesseract-core-simd.wasm.js` (and its `.wasm` — check `node_modules/tesseract.js-core/` for the exact current filenames; the SIMD build is the right default, non-SIMD is a fallback tesseract.js resolves itself)
  - `eng.traineddata.gz` — tesseract.js's `langPath` convention expects `<langPath>/<lang>.traineddata.gz`, i.e. gzip-compressed, not the raw `.traineddata` Tesseract's CLI uses. Either gzip the same `eng.traineddata` file vendored for desktop (`gzip -k eng.traineddata` produces `eng.traineddata.gz`), or download tesseract.js's own published English language file from its `tessdata` releases and vendor that instead — either is a valid, equally "fully local, not CDN-fetched" source; prefer reusing the same traineddata as desktop for consistency if the gzip step is straightforward.

- [ ] **Copy them into `apps/web/public/tesseract/`** (Vite serves everything under `public/` at the build's base path automatically, so referencing them at runtime just needs the right relative path — see Step 4):

```bash
mkdir -p apps/web/public/tesseract/core apps/web/public/tesseract/lang
cp apps/web/node_modules/tesseract.js/dist/worker.min.js apps/web/public/tesseract/
cp apps/web/node_modules/tesseract.js-core/tesseract-core-simd*.{js,wasm} apps/web/public/tesseract/core/
gzip -k -c vendor/tesseract/tessdata/eng.traineddata > apps/web/public/tesseract/lang/eng.traineddata.gz
```

(The last line reuses the same `eng.traineddata` Task 1 vendored for desktop — if Task 1 hasn't landed yet in this worktree, either wait for it or source `eng.traineddata` from the same UB Mannheim installer directly for now and reconcile later; the two tasks are independent but this one specific file is naturally shared.)

- [ ] **`public/tesseract/` must NOT be committed as tracked, generated build output** — add it to `apps/web/.gitignore`:

```
public/tesseract/
```

Document the copy step above in a short paragraph in `apps/web/README.md`'s setup section (or wherever this project documents "things a fresh clone must do before `npm run dev` works" — check for an existing such section first and match its format), the same way `vendor/` being gitignored is documented for desktop.

- [ ] **Commit**

```bash
git add apps/web/.gitignore apps/web/README.md
git commit -m "chore(web): bundle tesseract.js assets locally instead of fetching from a CDN"
```

### Step 4: Render pages, run OCR, draw the invisible text layer

- [ ] **Extend `ocr.ts`**, replacing the `throw new Error("not yet implemented past the text guard");` line:

```typescript
import { PDFDocument, TextRenderingMode, setTextRenderingMode, pushGraphicsState, popGraphicsState, rgb } from "pdf-lib";
import { createWorker } from "tesseract.js";

const OCR_SCALE = 300 / 72; // pdf.js viewport scale equivalent to 300 DPI

function assetUrl(path: string): string {
  // import.meta.env.BASE_URL respects Vite's configured base path (this app
  // is served from a /iLoathePDF/ subpath on GitHub Pages, not the origin
  // root) -- a hardcoded "/tesseract/..." would 404 there.
  return `${import.meta.env.BASE_URL}tesseract/${path}`;
}
```

- [ ] **Replace the engine body**, keeping the existing text-guard loop but continuing past it instead of throwing:

```typescript
export const ocrEngine: Engine = async ({ files }) => {
  const file = files[0];
  if (!file) throw new Error("Add a scanned PDF to OCR.");

  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;

  const worker = await createWorker("eng", 1, {
    workerPath: assetUrl("worker.min.js"),
    corePath: assetUrl("core"),
    langPath: assetUrl("lang"),
  });

  try {
    const pages = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      pages.push(await doc.getPage(pageNum));
    }
    for (const page of pages) {
      if (await pageHasText(page)) {
        throw new Error("This PDF already has selectable text — OCR is for scanned/image-only PDFs.");
      }
    }

    const outDoc = await PDFDocument.create();

    for (const page of pages) {
      const viewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable.");
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const { data } = await worker.recognize(canvas);

      const pngDataUrl = canvas.toDataURL("image/png");
      const pngBytes = Uint8Array.from(atob(pngDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
      const embeddedPng = await outDoc.embedPng(pngBytes);

      const pageViewport = page.getViewport({ scale: 1 });
      const outPage = outDoc.addPage([pageViewport.width, pageViewport.height]);
      outPage.drawImage(embeddedPng, { x: 0, y: 0, width: pageViewport.width, height: pageViewport.height });

      const scaleToPdfPoints = pageViewport.width / viewport.width;
      for (const word of data.words) {
        const x = word.bbox.x0 * scaleToPdfPoints;
        // Canvas y is top-down; PDF y is bottom-up.
        const yTop = word.bbox.y0 * scaleToPdfPoints;
        const wordHeightPt = (word.bbox.y1 - word.bbox.y0) * scaleToPdfPoints;
        const y = pageViewport.height - yTop - wordHeightPt;
        if (!word.text.trim()) continue;

        outPage.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
        outPage.drawText(word.text, { x, y, size: Math.max(wordHeightPt, 1), color: rgb(0, 0, 0) });
        outPage.pushOperators(popGraphicsState());
      }
    }

    const outBytes = await outDoc.save();
    return {
      files: [
        {
          name: file.name.replace(/\.pdf$/i, "-searchable.pdf"),
          blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }),
        },
      ],
      summary: `${doc.numPages} page(s) made searchable.`,
      isPreview: false,
    };
  } finally {
    await worker.terminate();
    await loadingTask.destroy();
  }
};
```

Note `pageHasText` needs to move above the guard loop that now runs after page collection — reorder the function so `pageHasText` (already defined from Step 2) sits above `ocrEngine`, unchanged.

- [ ] **Write the round-trip test**, appended to `ocr.test.ts`:

```typescript
it("adds selectable text that pdf.js can extract back out", async () => {
  const bytes = await makeImageOnlyPdf();
  const file = new File([bytes as BlobPart], "scan.pdf", { type: "application/pdf" });

  const result = await ocrEngine({ files: [file], options: {} });

  expect(result.files).toHaveLength(1);
  expect(result.files[0].name).toBe("scan-searchable.pdf");

  const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
  const pdfjsLib = await import("pdfjs-dist");
  const outDoc = await pdfjsLib.getDocument({ data: outBytes }).promise;
  const page = await outDoc.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").toUpperCase();
  expect(text).toContain("HELLO");
}, 30000);

it("preserves the visible page image", async () => {
  const bytes = await makeImageOnlyPdf();
  const file = new File([bytes as BlobPart], "scan.pdf", { type: "application/pdf" });

  const result = await ocrEngine({ files: [file], options: {} });

  const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
  const outDoc = await PDFDocument.load(outBytes);
  expect(outDoc.getPageCount()).toBe(1);
}, 30000);
```

- [ ] **Run test to verify it fails, then passes once the implementation above is in place**

Run: `cd apps/web && npx vitest run src/engines/ocr.test.ts`
Expected: all PASS. If the recognized-text assertion is flaky (OCR misreads the synthetic canvas render), increase the canvas font size / contrast rather than loosening the assertion to a vaguer substring check — a real recognition failure here is exactly the kind of integration risk Step 1's smoke test was meant to catch early; don't paper over it.

- [ ] **Commit**

```bash
git add apps/web/src/engines/ocr.ts apps/web/src/engines/ocr.test.ts
git commit -m "feat(web): pdf.ocr renders pages, runs tesseract.js, draws an invisible text layer"
```

### Step 5: Web UI wiring — registry, tint, icon, options placeholder

- [ ] **Extend `TintKey` in `apps/web/src/tools/tint.ts`**:

```typescript
export type TintKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l";
```

- [ ] **Add `--tint-l` / `--tint-l-btn` to `apps/web/src/index.css`**, in both light and dark blocks, using the *same hue* chosen for desktop's `--tint-l` in Task 1 Step 9 (140) so the two apps' OCR tint actually matches — copy the exact syntax pattern of the existing `--tint-k`/`--tint-k-btn` lines:

Light block, immediately after `--tint-k-btn`:
```css
  --tint-l: oklch(0.575 0.145 140);
```
(placed with the other `--tint-*` lines, not the `-btn` ones — match the existing file's grouping) and
```css
  --tint-l-btn: oklch(0.5 0.145 140);
```

Dark block:
```css
  --tint-l: oklch(0.8 0.125 140);
```
and
```css
  --tint-l-btn: var(--tint-l);
```

- [ ] **Add `OcrIcon` to `apps/web/src/tools/icons.tsx`**, after `RedactIcon` — a simple document-with-magnifier motif to read as "scan/search":

```tsx
export function OcrIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-l)" strokeWidth="1.5" {...props}>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.2" />
      <path d="M5.5 6h4M5.5 9h7" strokeOpacity="0.5" />
      <circle cx="10.5" cy="12.5" r="2" />
      <path d="M12.2 14.2l1.6 1.6" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Add `apps/web/src/tools/options/OcrOptions.tsx`** — a real, rendered (not a placeholder like Redact's, since OCR uses the generic flow, not a bespoke Workspace) options panel with only explanatory copy, modeled on `CompressOptions.tsx`'s info-box pattern:

```tsx
import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function OcrOptions(_props: OptionsPanelProps) {
  return (
    <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">
      Scans your PDF and adds an invisible, searchable text layer over the
      original pages — the file looks identical, but the text can now be
      selected, copied, and searched. English only for now — no options to
      configure.
    </div>
  );
}
```

- [ ] **Register the tool in `apps/web/src/tools/registry.tsx`** — add imports:

```tsx
import { OcrOptions } from "./options/OcrOptions";
import { ocrEngine } from "@/engines/ocr";
```

and add `OcrIcon` to the existing icons import block. Then add a new `TOOLS` entry, after `redact`:

```tsx
  { slug: "ocr", name: "OCR → Searchable PDF", description: "Add an invisible text layer to a scanned PDF so it's searchable and selectable.", category: "pdf", Icon: OcrIcon, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: OcrOptions, engine: ocrEngine, status: "live", tint: "l" },
```

Note: no `Workspace` field — this tool uses the generic `ToolPage` flow, same as `protect`/`compress`.

- [ ] **Typecheck and build**

Run: `cd apps/web && npx tsc --noEmit && npm run build`
Expected: clean typecheck, successful build

- [ ] **Full test suite**

Run: `cd apps/web && npx vitest run`
Expected: all PASS (aside from any pre-existing, already-documented flaky/unrelated failures — re-run any failing file in isolation before treating it as a real regression, per this repo's established practice)

- [ ] **Commit**

```bash
git add apps/web/src/tools/tint.ts apps/web/src/index.css apps/web/src/tools/icons.tsx apps/web/src/tools/options/OcrOptions.tsx apps/web/src/tools/registry.tsx
git commit -m "feat(web): wire up the OCR tool in the UI"
```

### Step 6: Manual smoke test in the browser

- [ ] **Run the dev server**, open the OCR tool, drop in a scanned-looking PDF (the same kind of fixture used in Step 4's test, or an image-only PDF built via the Images → PDF tool from a photo of printed text), run it, and confirm: the tool appears on the tools grid with the new tint/icon, the job completes, the downloaded PDF's text is selectable in a real viewer.
- [ ] **Confirm no network request to any CDN fires during the run** — open DevTools → Network, filter for `tesseract`/`jsdelivr`/`unpkg`, run the tool again, confirm nothing appears there (proves Step 3's local bundling is actually wired up correctly, not silently falling back to `tesseract.js`'s CDN default).
- [ ] **Confirm the "already has text" guard surfaces a sane error in the UI.**

---

## Task 3: Website copy sync (eleven → twelve tools)

Small and mechanical — done directly, not delegated to a subagent, matching how the prior three features' equivalent step was handled.

- [ ] Update `README.md`: bump "eleven" → "twelve" wherever the tool count is mentioned, and add an "OCR → Searchable PDF" row to the tools table.
- [ ] Update `apps/desktop/src/routes/Home.tsx` hero copy: "eleven" → "twelve".
- [ ] Update `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/ToolsIndex.tsx`, `apps/web/src/pages/Download.tsx`: "eleven" → "twelve" wherever present.
- [ ] Update `apps/web/src/components/layout/SiteFooter.tsx`: "Eleven PDF and image tools" → "Twelve PDF and image tools".
- [ ] Grep the whole repo for the literal string "eleven" once more after the above, to catch anything missed (mirrors how this was verified for the Redact PDF release).
- [ ] Commit: `git commit -m "docs: update tool count copy for OCR → Searchable PDF (eleven -> twelve)"`

---

## Task 4: Final whole-branch review + cross-engine visual verification

Sequential, after Tasks 1-3 are merged into the feature branch.

- [ ] **Generate the review package**: `scripts/review-package MERGE_BASE HEAD` (from the `subagent-driven-development` skill's directory; `MERGE_BASE` = `git merge-base main HEAD`).
- [ ] **Dispatch the final whole-branch code reviewer** (most capable available model, per `subagent-driven-development`'s model-selection guidance) using `requesting-code-review`'s `code-reviewer.md` template, pointing it at the review package, this plan, and the design spec (`docs/superpowers/specs/2026-09-16-ocr-searchable-pdf-design.md`). Give it the Global Constraints block verbatim as its attention lens.
- [ ] **Cross-engine visual verification**: build one shared source PDF (pdf-lib-generated with an embedded raster image containing real, recognizable text — matching the fixture pattern in Task 2 Step 4's test, not a PIL-embedded one, since the Redact plan's visual-verification pass already discovered pdf.js chokes on PIL-generated inline-image PDFs), run it through both the real desktop `pdf_ocr.py` op and the real web `ocr.ts` engine, and confirm both outputs: (a) look visually identical to the source when rasterized, (b) yield selectable text extractable via `pdf.js`'s `getTextContent()` (desktop's output can be checked this way too — `pdf.js` doesn't care which engine produced the PDF), (c) recognize the same text, allowing for the two engines potentially returning slightly different word segmentation but not materially different content.
- [ ] **Address Critical/Important findings** with one consolidated fix subagent (not one per finding, per this repo's established practice from the Redact review loop), re-review, repeat until "Ready to merge: Yes".
- [ ] **Use `superpowers:finishing-a-development-branch`** once clean — push, open the PR, wait for required CI, squash-merge, sync local `main`, prune the branch, per the user's standing workflow preference.
