"""pdf.pdfa -- convert a PDF to PDF/A-2b with Ghostscript. See PROTOCOL.md.

Ghostscript does the conversion: fonts are embedded, colours are converted to
sRGB and the PDF/A XMP identification is written. It is a best-effort
conversion that has not been run through a validator such as veraPDF -- a PDF
using features PDF/A forbids (some transparency or JavaScript, for example) is
produced with those features dropped, not rejected.
"""
from __future__ import annotations

import glob
import re
from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    find_ghostscript,
    open_pdf,
    require,
    size_of,
    temp_dir,
)
from .pdf_compress import run_gs


def _pdfa_resources(gs: str) -> tuple[Path, Path]:
    """Locate Ghostscript's PDFA_def.ps template and its sRGB ICC profile."""
    root = Path(gs).resolve().parent.parent
    defs = [root / "lib" / "PDFA_def.ps", *map(Path, glob.glob("/usr/share/ghostscript/*/lib/PDFA_def.ps"))]
    icc = [
        root / "iccprofiles" / "default_rgb.icc",
        *map(Path, glob.glob("/usr/share/ghostscript/*/iccprofiles/default_rgb.icc")),
        Path("/usr/share/color/icc/ghostscript/default_rgb.icc"),
    ]
    found_def = next((p for p in defs if p.is_file()), None)
    found_icc = next((p for p in icc if p.is_file()), None)
    if not found_def or not found_icc:
        raise OpError(
            "GHOSTSCRIPT_MISSING",
            "Ghostscript's PDF/A resources (PDFA_def.ps and the sRGB profile) were not found.",
        )
    return found_def, found_icc


def _ps_string(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def has_pdfa_resources() -> bool:
    try:
        _pdfa_resources(find_ghostscript())
        return True
    except OpError:
        return False


def run(params: dict, progress: ProgressFn) -> dict:
    src = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))
    progress(2, f"Reading {src.name}")

    with open_pdf(src) as pdf:
        pages = len(pdf.pages)
    # pikepdf's handle is closed before Ghostscript opens the file (Windows locks it).

    gs = find_ghostscript()
    template, icc = _pdfa_resources(gs)

    with temp_dir() as scratch:
        definition = template.read_text(encoding="latin-1")
        definition = re.sub(r"/ICCProfile \([^)]*\)", lambda _m: f"/ICCProfile ({_ps_string(icc.as_posix())})", definition, count=1)
        definition = re.sub(r"/Title \([^)]*\)", lambda _m: f"/Title ({_ps_string(src.stem)})", definition, count=1)
        def_path = scratch / "PDFA_def.ps"
        def_path.write_text(definition, encoding="latin-1")

        with atomic_output(dest) as tmp:
            argv = [
                gs,
                "-dBATCH",
                "-dNOPAUSE",
                "-dQUIET",
                "-dNOOUTERSAVE",
                "-dPDFA=2",
                "-dPDFACompatibilityPolicy=1",
                "-sColorConversionStrategy=RGB",
                "-sDEVICE=pdfwrite",
                f"--permit-file-read={icc.parent.as_posix()}/",
                f"--permit-file-read={scratch.as_posix()}/",
                f"-sOutputFile={tmp}",
                str(def_path),
                str(src),
            ]
            run_gs(argv, tmp, progress, "Converting to PDF/A")

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest), "pages": pages, "part": 2, "conformance": "B"}
