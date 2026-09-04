"""`pdf.to_img` -- rasterise PDF pages with Ghostscript.

Ghostscript is the only renderer this app ships, so there is no fallback: a
missing binary is reported as GHOSTSCRIPT_MISSING rather than silently degraded
to a lower-fidelity path that would make the output look broken.

One Ghostscript invocation per page. Slightly more process churn than
-sPageList, but it gives an exact output filename per page, honest per-page
progress, and a child that can be killed the moment the user cancels.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    ensure_dir,
    existing_file,
    file_result,
    find_ghostscript,
    one_of,
    open_pdf,
    parse_pages,
    require,
    unique_path,
)

_DEVICE = {"png": "png16m", "jpg": "jpeg"}
_POLL_SECONDS = 0.2


def _no_window_flags() -> int:
    # Without this every page would flash a console window on Windows.
    return getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _run_gs(argv: list[str], progress: ProgressFn, pct: int, note: str) -> None:
    proc = subprocess.Popen(
        argv,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=_no_window_flags(),
    )
    try:
        while True:
            try:
                # communicate() rather than wait(): it drains the pipes, so a
                # chatty Ghostscript cannot deadlock on a full stderr buffer.
                _, stderr = proc.communicate(timeout=_POLL_SECONDS)
                break
            except subprocess.TimeoutExpired:
                # The only cancellation signal we get is progress() raising, so
                # the poll loop has to keep calling it.
                progress(pct, note)
    except BaseException:
        proc.kill()
        proc.wait()
        raise
    if proc.returncode != 0:
        tail = (stderr or b"").decode("utf-8", "replace").strip().splitlines()[-3:]
        raise OpError("INTERNAL", "Ghostscript failed: " + " ".join(tail))


def run(params: dict, progress: ProgressFn) -> dict:
    src = existing_file(require(params, "input"))
    output_dir = ensure_dir(require(params, "output_dir"))
    fmt = one_of(params, "format", ("png", "jpg"), "png")
    try:
        dpi = int(params.get("dpi", 150))
    except (TypeError, ValueError):
        raise OpError("BAD_PARAMS", "'dpi' must be a number") from None
    if not 1 <= dpi <= 1200:
        raise OpError("BAD_PARAMS", "'dpi' must be between 1 and 1200")
    base_name = str(params.get("base_name") or src.stem)

    # Resolved before any rendering so a missing binary fails fast and loudly.
    gs = find_ghostscript()

    with open_pdf(src) as pdf:
        total_pages = len(pdf.pages)
    pages = parse_pages(params.get("pages"), total_pages)

    outputs: list[dict] = []
    count = len(pages)
    for index, page_index in enumerate(pages):
        page_no = page_index + 1
        note = f"page {page_no} of {total_pages}"
        progress(int(100 * index / count), note)
        dest = unique_path(output_dir / f"{base_name}-{page_no:03d}.{fmt}")
        with atomic_output(dest) as tmp:
            _run_gs(
                [
                    gs,
                    "-q",
                    "-dSAFER",
                    "-dBATCH",
                    "-dNOPAUSE",
                    f"-sDEVICE={_DEVICE[fmt]}",
                    f"-r{dpi}",
                    "-dTextAlphaBits=4",
                    "-dGraphicsAlphaBits=4",
                    f"-dFirstPage={page_no}",
                    f"-dLastPage={page_no}",
                    f"-sOutputFile={tmp}",
                    str(src),
                ],
                progress,
                int(100 * index / count),
                note,
            )
        outputs.append(file_result(dest))

    progress(100, "Done")
    return {"outputs": outputs, "count": len(outputs)}
