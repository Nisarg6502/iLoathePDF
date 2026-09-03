"""pdf.compress -- shrink a PDF. See PROTOCOL.md for the frozen contract.

Two engines, chosen by `level`:
  lossless  pikepdf only. Re-packs the file structure (object streams, flate
            recompression, dead objects dropped) and never touches image data,
            so it is the only level that is safe on scans and the only one that
            works without Ghostscript.
  balanced  Ghostscript /ebook  (images downsampled to 150 dpi)
  strong    Ghostscript /screen (images downsampled to 72 dpi)

Ghostscript is never used as a silent fallback: if it is missing the lossy
levels fail with GHOSTSCRIPT_MISSING so the user knows they got what they asked
for and not something quietly worse.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

from ._common import (
    Cancelled,
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    find_ghostscript,
    one_of,
    open_pdf,
    require,
    size_of,
)

LEVELS = ("lossless", "balanced", "strong")

# Ghostscript's own preset names. /ebook and /screen carry the downsample
# settings; we do not spell those out individually so we inherit upstream's
# tuning rather than freezing today's numbers.
_PDFSETTINGS = {"balanced": "/ebook", "strong": "/screen"}

# Big scanned documents legitimately take minutes; anything past this is a hang.
_GS_TIMEOUT_S = 900.0

# How often we surface progress / notice a cancel while Ghostscript runs.
_POLL_S = 0.25


def run(params: dict, progress: ProgressFn) -> dict:
    src = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))
    level = one_of(params, "level", LEVELS)

    original_bytes = size_of(src)
    progress(1, f"Reading {src.name}")

    # Open once up front even on the Ghostscript path: pikepdf gives us the
    # protocol-shaped ENCRYPTED_PDF / CORRUPT_PDF errors, whereas Ghostscript
    # would just fail late with an opaque INTERNAL.
    with open_pdf(src) as pdf:
        pages = len(pdf.pages)
        progress(5, f"{pages} page{'s' if pages != 1 else ''}")
        if level == "lossless":
            engine = "pikepdf"
            with atomic_output(dest) as tmp:
                _compress_lossless(pdf, tmp, progress)
                final_bytes = _keep_smaller(src, tmp, original_bytes)
        else:
            engine = "ghostscript"
            # Release the file handle before handing the path to a child
            # process -- Windows is unforgiving about concurrent opens.
            pdf.close()
            gs = find_ghostscript()
            with atomic_output(dest) as tmp:
                _compress_ghostscript(gs, src, tmp, _PDFSETTINGS[level], progress)
                final_bytes = _keep_smaller(src, tmp, original_bytes)

    progress(100, "Done")
    return {
        "output": str(dest),
        "bytes": final_bytes,
        "original_bytes": original_bytes,
        "ratio": (1 - final_bytes / original_bytes) if original_bytes else 0.0,
        "engine": engine,
    }


def _compress_lossless(pdf, tmp: Path, progress: ProgressFn) -> None:
    import pikepdf

    progress(30, "Rewriting objects")
    pdf.remove_unreferenced_resources()
    progress(60, "Recompressing streams")
    pdf.save(
        str(tmp),
        compress_streams=True,
        recompress_flate=True,  # re-deflate at our level, not the producer's
        object_stream_mode=pikepdf.ObjectStreamMode.generate,
        normalize_content=False,  # rewriting content streams risks fidelity
    )
    progress(90, "Written")


def _compress_ghostscript(
    gs: str, src: Path, tmp: Path, pdfsettings: str, progress: ProgressFn
) -> None:
    argv = [
        gs,
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-dQUIET",
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.7",
        f"-dPDFSETTINGS={pdfsettings}",
        "-dDetectDuplicateImages=true",
        "-dCompressFonts=true",
        "-dSubsetFonts=true",
        f"-sOutputFile={tmp}",
        str(src),
    ]
    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

    # Pipe both streams: besides letting us quote stderr in an error, it keeps
    # Ghostscript's chatter off our inherited stdout, which is the protocol
    # channel and must stay pure JSON.
    proc = subprocess.Popen(
        argv,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=creationflags,
    )

    captured: dict[str, bytes] = {}

    def _drain() -> None:
        out, err = proc.communicate()
        captured["out"], captured["err"] = out, err

    # communicate() in a helper thread rather than a blocking run(): we still
    # get the full output, but the main thread stays free to poll the cancel
    # flag (progress() raises Cancelled) and to kill the child if it trips.
    reader = threading.Thread(target=_drain, daemon=True)
    reader.start()

    started = time.monotonic()
    pct = 10
    try:
        while reader.is_alive():
            reader.join(_POLL_S)
            elapsed = time.monotonic() - started
            if elapsed > _GS_TIMEOUT_S:
                _kill(proc, reader)
                raise OpError(
                    "INTERNAL",
                    f"Ghostscript timed out after {int(elapsed)}s. "
                    + _tail(captured.get("err")),
                )
            # Ghostscript reports no usable percentage, so this is a slow creep
            # that stops short of the end -- a moving bar the user can trust
            # not to sit at 99% is better than a fake precise one.
            pct = min(90, pct + 1)
            progress(pct, "Compressing")
    except Cancelled:
        _kill(proc, reader)
        raise

    if proc.returncode != 0:
        raise OpError(
            "INTERNAL",
            f"Ghostscript failed (exit {proc.returncode}). " + _tail(captured.get("err")),
        )
    if not tmp.exists() or size_of(tmp) == 0:
        raise OpError("INTERNAL", "Ghostscript produced no output. " + _tail(captured.get("err")))


def _kill(proc: subprocess.Popen, reader: threading.Thread) -> None:
    try:
        proc.kill()
    except OSError:
        pass
    reader.join(5)


def _tail(err: bytes | None, limit: int = 800) -> str:
    text = (err or b"").decode("utf-8", "replace").strip()
    if not text:
        return "No stderr output."
    return "Ghostscript said: " + text[-limit:]


def _keep_smaller(src: Path, tmp: Path, original_bytes: int) -> int:
    """A 'compress' that grows the file is a bug the user will notice, so if the
    engine lost the bet we publish the original bytes instead and report a
    ratio of 0."""
    if size_of(tmp) >= original_bytes:
        shutil.copyfile(src, tmp)
        return original_bytes
    return size_of(tmp)
