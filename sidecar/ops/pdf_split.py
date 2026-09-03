"""`pdf.split` -- carve one PDF into one or more new files.

Modes and the filenames they produce (``{base}`` is `base_name`, or the input's
stem when that is omitted; page numbers are 1-based and inclusive):

    ranges  "1-3,5"  -> "{base} pages 1-3.pdf", "{base} page 5.pdf"
    every   2        -> "{base} pages 1-2.pdf", "{base} pages 3-4.pdf", ...
    extract "2,5-7"  -> "{base} extracted.pdf"
    delete  "2"      -> "{base} trimmed.pdf"

A one-page output says "page 4" rather than "pages 4-4" -- these names end up in
the user's file manager, so they read as English. Nothing is ever overwritten:
every name goes through `unique_path`, which appends " (2)" as needed.
"""
from __future__ import annotations

from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    ensure_dir,
    existing_file,
    file_result,
    one_of,
    open_pdf,
    parse_pages,
    parse_range_groups,
    require,
    unique_path,
)

MODES = ("ranges", "every", "extract", "delete")


def _span_label(pages: list[int]) -> str:
    """Human label for a contiguous-ish group, using its first and last page."""
    first, last = pages[0] + 1, pages[-1] + 1
    return f"page {first}" if first == last else f"pages {first}-{last}"


def _every_chunks(params: dict, total: int) -> list[list[int]]:
    size = params.get("every")
    if not isinstance(size, int) or isinstance(size, bool) or size < 1:
        raise OpError("BAD_PARAMS", "'every' must be a positive integer")
    return [list(range(i, min(i + size, total))) for i in range(0, total, size)]


def _plan(params: dict, mode: str, total: int) -> list[tuple[str, list[int]]]:
    """(filename suffix, 0-based page indices) for each file to write."""
    if mode == "ranges":
        groups = parse_range_groups(require(params, "ranges"), total)
        return [(_span_label(g), g) for g in groups]
    if mode == "every":
        return [(_span_label(g), g) for g in _every_chunks(params, total)]

    selected = parse_pages(require(params, "pages"), total)
    if mode == "extract":
        return [("extracted", selected)]

    keep = [i for i in range(total) if i not in set(selected)]
    if not keep:
        raise OpError("BAD_PARAMS", "Deleting those pages would leave an empty document")
    return [("trimmed", keep)]


def run(params: dict, progress: ProgressFn) -> dict:
    path = existing_file(require(params, "input"))
    mode = one_of(params, "mode", MODES)
    out_dir = ensure_dir(require(params, "output_dir"))
    base = str(params.get("base_name") or path.stem).strip() or path.stem

    import pikepdf

    outputs: list[dict] = []
    with open_pdf(path) as src:
        total = len(src.pages)
        if total == 0:
            raise OpError("CORRUPT_PDF", f"{path.name} has no pages")

        plan = _plan(params, mode, total)
        progress(5, f"Writing {len(plan)} file(s)")

        for i, (label, indices) in enumerate(plan):
            dest = unique_path(Path(out_dir) / f"{base} {label}.pdf")
            # Written directly rather than through atomic_output: unique_path has
            # already guaranteed a fresh name, and a partial file here would be
            # visible anyway once we report it.
            with pikepdf.new() as chunk:
                for page_index in indices:
                    chunk.pages.append(src.pages[page_index])
                try:
                    chunk.save(str(dest))
                except OSError as exc:
                    raise OpError("OUTPUT_WRITE_FAILED", f"Cannot write {dest}: {exc}") from exc
            outputs.append(file_result(dest, pages=len(indices)))
            progress(5 + int(90 * (i + 1) / len(plan)), f"file {i + 1} of {len(plan)}")

    progress(100, "Done")
    return {"outputs": outputs, "count": len(outputs)}
