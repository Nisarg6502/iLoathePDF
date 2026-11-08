"""pdf.flatten -- bake form fields and annotations into the page content, so
the PDF can no longer be edited as a form. See PROTOCOL.md.

Text stays text: this is not a rasterise. Form fields are given fresh
appearance streams first, so fields a viewer had not yet drawn still show their
value, then every annotation is merged into its page and the form is removed.
"""
from __future__ import annotations

from pathlib import Path

from ._common import (
    ProgressFn,
    atomic_output,
    existing_file,
    open_pdf,
    require,
    size_of,
)


def run(params: dict, progress: ProgressFn) -> dict:
    src = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))
    progress(5, f"Reading {src.name}")

    with open_pdf(src) as pdf:
        total = len(pdf.pages)
        before = sum(len(page.get("/Annots", [])) for page in pdf.pages)
        has_form = "/AcroForm" in pdf.Root

        progress(30, "Drawing form fields")
        if has_form:
            pdf.generate_appearance_streams()
        progress(60, "Flattening")
        pdf.flatten_annotations("screen")
        # Newer qpdf drops the form itself while flattening; older versions leave it.
        if "/AcroForm" in pdf.Root:
            del pdf.Root["/AcroForm"]

        after = sum(len(page.get("/Annots", [])) for page in pdf.pages)
        progress(90, "Writing output")
        with atomic_output(dest) as tmp:
            pdf.save(str(tmp))

    progress(100, "Done")
    return {
        "output": str(dest),
        "bytes": size_of(dest),
        "pages": total,
        "flattened": max(0, before - after),
        "had_form": has_form,
    }
