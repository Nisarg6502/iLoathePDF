"""`pdf.merge` -- concatenate a list of PDFs, optionally page-filtered.

Each input may carry its own 1-based `pages` spec, and the same path may appear
more than once (a cover sheet reused at the end, say). Every source therefore
gets its own handle and all of them stay open until the merged file is saved,
because pikepdf resolves copied pages lazily.
"""
from __future__ import annotations

from contextlib import ExitStack
from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    open_pdf,
    parse_pages,
    require,
    size_of,
)


def _normalise(item, index: int) -> tuple[Path, str | None]:
    """Accept the documented {"path", "pages"} object; a bare string is treated
    as an unfiltered path so callers can pass simple lists."""
    if isinstance(item, str):
        return existing_file(item), None
    if not isinstance(item, dict):
        raise OpError("BAD_PARAMS", f"inputs[{index}] must be an object with a 'path'")
    path = item.get("path")
    if not path:
        raise OpError("BAD_PARAMS", f"inputs[{index}] is missing 'path'")
    pages = item.get("pages")
    return existing_file(path), pages


def run(params: dict, progress: ProgressFn) -> dict:
    inputs = require(params, "inputs")
    if not isinstance(inputs, list) or not inputs:
        raise OpError("BAD_PARAMS", "'inputs' must be a non-empty list")
    dest = Path(require(params, "output"))

    import pikepdf

    entries = [_normalise(item, i) for i, item in enumerate(inputs)]
    progress(2, f"Merging {len(entries)} files")

    with ExitStack() as stack:
        merged = stack.enter_context(pikepdf.new())
        for i, (path, spec) in enumerate(entries):
            src = stack.enter_context(open_pdf(path))
            for page_index in parse_pages(spec, len(src.pages)):
                merged.pages.append(src.pages[page_index])
            progress(2 + int(88 * (i + 1) / len(entries)), f"file {i + 1} of {len(entries)}")

        total = len(merged.pages)
        if total == 0:
            raise OpError("BAD_PARAMS", "The merge selected no pages")
        progress(92, "Writing output")
        with atomic_output(dest) as tmp:
            try:
                merged.save(str(tmp))
            except OSError as exc:
                raise OpError("OUTPUT_WRITE_FAILED", f"Cannot write {dest}: {exc}") from exc

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest), "pages": total}
