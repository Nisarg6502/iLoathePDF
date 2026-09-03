"""`pdf.info` -- cheap metadata probe used to populate the UI before any edit.

Page sizes are reported the way the reader will see them: a page carrying
/Rotate 90 or 270 has its MediaBox width/height swapped, so the numbers match
the on-screen aspect ratio rather than the raw box.
"""
from __future__ import annotations

from ._common import ProgressFn, existing_file, open_pdf, require, size_of


def _visual_size(page) -> list[float]:
    box = [float(v) for v in page.mediabox]
    width = abs(box[2] - box[0])
    height = abs(box[3] - box[1])
    # Page.rotation resolves /Rotate including values inherited from parents.
    rotate = int(page.rotation) % 360
    if rotate in (90, 270):
        width, height = height, width
    return [round(width, 2), round(height, 2)]


def run(params: dict, progress: ProgressFn) -> dict:
    path = existing_file(require(params, "input"))
    progress(5, f"Reading {path.name}")

    with open_pdf(path) as pdf:
        # open_pdf already raised ENCRYPTED_PDF for anything needing a password,
        # so this flag only ever reports PDFs encrypted with an empty user
        # password -- still worth surfacing, because saving them may drop it.
        encrypted = bool(pdf.is_encrypted)
        total = len(pdf.pages)
        sizes: list[list[float]] = []
        for index, page in enumerate(pdf.pages):
            sizes.append(_visual_size(page))
            if total and index % 25 == 0:
                progress(5 + int(90 * index / total), f"page {index + 1} of {total}")

    progress(100, "Done")
    return {
        "pages": total,
        "encrypted": encrypted,
        "bytes": size_of(path),
        "page_sizes": sizes,
    }
