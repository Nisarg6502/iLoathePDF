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
