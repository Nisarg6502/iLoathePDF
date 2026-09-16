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
