"""`pdf.organize` -- reorder, drop and rotate pages in one pass.

`order` lists SOURCE page indices (0-based) in output order, so omitting an
index deletes that page and repeating one duplicates it. `rotations` is keyed by
source index as a string (it arrives from JSON) and holds an ABSOLUTE angle, not
a delta -- the UI already knows the final orientation it wants, and absolute
values keep repeated applications idempotent.
"""
from __future__ import annotations

from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    open_pdf,
    require,
    size_of,
)

ANGLES = (0, 90, 180, 270)


def _parse_order(raw, total: int) -> list[int]:
    if not isinstance(raw, list) or not raw:
        raise OpError("BAD_PARAMS", "'order' must be a non-empty list of page indices")
    order: list[int] = []
    for value in raw:
        if not isinstance(value, int) or isinstance(value, bool):
            raise OpError("BAD_PARAMS", f"'order' entries must be integers, got {value!r}")
        if not 0 <= value < total:
            raise OpError("BAD_PARAMS", f"Page index {value} is out of range (0..{total - 1})")
        order.append(value)
    return order


def _parse_rotations(raw, total: int) -> dict[int, int]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise OpError("BAD_PARAMS", "'rotations' must be an object keyed by source page index")
    result: dict[int, int] = {}
    for key, angle in raw.items():
        try:
            index = int(key)
        except (TypeError, ValueError):
            raise OpError("BAD_PARAMS", f"Bad rotation key {key!r}") from None
        if not 0 <= index < total:
            raise OpError("BAD_PARAMS", f"Rotation for page {index} is out of range")
        if isinstance(angle, bool) or not isinstance(angle, int) or angle not in ANGLES:
            raise OpError("BAD_PARAMS", f"Rotation must be one of {list(ANGLES)}, got {angle!r}")
        result[index] = angle
    return result


def run(params: dict, progress: ProgressFn) -> dict:
    path = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))

    import pikepdf

    with open_pdf(path) as src:
        total = len(src.pages)
        order = _parse_order(require(params, "order"), total)
        rotations = _parse_rotations(params.get("rotations"), total)
        progress(5, f"Arranging {len(order)} pages")

        with pikepdf.new() as out:
            for position, source_index in enumerate(order):
                out.pages.append(src.pages[source_index])
                if source_index in rotations:
                    # Rotate the copy, never the source page: a duplicated page
                    # would otherwise be rotated twice.
                    out.pages[position].rotate(rotations[source_index], relative=False)
                progress(5 + int(85 * (position + 1) / len(order)), f"page {position + 1} of {len(order)}")

            progress(92, "Writing output")
            with atomic_output(dest) as tmp:
                try:
                    out.save(str(tmp))
                except OSError as exc:
                    raise OpError("OUTPUT_WRITE_FAILED", f"Cannot write {dest}: {exc}") from exc

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest), "pages": len(order)}
