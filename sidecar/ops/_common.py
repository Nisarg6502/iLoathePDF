"""Shared helpers for every sidecar operation.

Ops must not import anything from `main` -- this module is the only shared
dependency, which keeps each op importable and testable under plain pytest.
"""
from __future__ import annotations

import os
import re
import shutil
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Iterator, Sequence

ProgressFn = Callable[[int, str], None]


class OpError(Exception):
    """An error with a protocol error code. See sidecar/PROTOCOL.md."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class Cancelled(OpError):
    def __init__(self, message: str = "Cancelled by user") -> None:
        super().__init__("CANCELLED", message)


def noop_progress(pct: int, note: str = "") -> None:
    """Progress sink for tests."""


# --------------------------------------------------------------------------
# params
# --------------------------------------------------------------------------

def require(params: dict, key: str):
    if key not in params or params[key] is None:
        raise OpError("BAD_PARAMS", f"Missing required parameter '{key}'")
    return params[key]


def _require_absolute(path_str: str, what: str) -> Path:
    """Every path in the protocol is absolute.

    A relative path would be resolved against the engine's working directory,
    which is wherever the app happened to be launched from -- outputs then land
    somewhere the user will never think to look. Refusing is the only safe
    answer; the caller knows the real location and we do not.
    """
    p = Path(path_str)
    if not p.is_absolute():
        raise OpError("BAD_PARAMS", f"{what} must be an absolute path, got {path_str!r}")
    return p


def existing_file(path_str: str) -> Path:
    p = _require_absolute(path_str, "Input path")
    if not p.is_file():
        raise OpError("FILE_NOT_FOUND", f"No such file: {path_str}")
    return p


def ensure_dir(path_str: str) -> Path:
    p = _require_absolute(path_str, "Output directory")
    try:
        p.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise OpError("OUTPUT_WRITE_FAILED", f"Cannot create {path_str}: {exc}") from exc
    return p


def one_of(params: dict, key: str, allowed: Sequence[str], default: str | None = None) -> str:
    value = params.get(key, default)
    if value is None:
        raise OpError("BAD_PARAMS", f"Missing required parameter '{key}'")
    if value not in allowed:
        raise OpError("BAD_PARAMS", f"'{key}' must be one of {list(allowed)}, got {value!r}")
    return value


# --------------------------------------------------------------------------
# page ranges  (see "Page range spec" in PROTOCOL.md)
# --------------------------------------------------------------------------

_RANGE_ITEM = re.compile(r"^(\d+)(?:\s*-\s*(\d+))?$")


def parse_range_item(item: str, total: int) -> list[int]:
    """Parse one '5' or '2-4' item into 0-based page indices."""
    m = _RANGE_ITEM.match(item.strip())
    if not m:
        raise OpError("BAD_PARAMS", f"Bad page range item: {item!r}")
    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else start
    if start < 1 or end < start:
        raise OpError("BAD_PARAMS", f"Bad page range item: {item!r}")
    if end > total:
        raise OpError("BAD_PARAMS", f"Page {end} is out of range (document has {total} pages)")
    return list(range(start - 1, end))


def parse_pages(spec: str | None, total: int) -> list[int]:
    """'1-3,5' -> [0,1,2,4]. None/'' means every page. Order is preserved,
    duplicates are kept (a page may legitimately be repeated in a merge)."""
    if spec is None or not str(spec).strip():
        return list(range(total))
    pages: list[int] = []
    for item in str(spec).split(","):
        if item.strip():
            pages.extend(parse_range_item(item, total))
    if not pages:
        raise OpError("BAD_PARAMS", "Page selection is empty")
    return pages


def parse_range_groups(spec: str, total: int) -> list[list[int]]:
    """'1-3,4-6' -> [[0,1,2],[3,4,5]]: one group per comma-separated item."""
    groups = [parse_range_item(item, total) for item in str(spec).split(",") if item.strip()]
    if not groups:
        raise OpError("BAD_PARAMS", "No page ranges given")
    return groups


# --------------------------------------------------------------------------
# output paths
# --------------------------------------------------------------------------

def unique_path(path: Path) -> Path:
    """'out.pdf' -> 'out (2).pdf' if it already exists. Never overwrites."""
    if not path.exists():
        return path
    stem, suffix, parent = path.stem, path.suffix, path.parent
    for n in range(2, 10000):
        candidate = parent / f"{stem} ({n}){suffix}"
        if not candidate.exists():
            return candidate
    raise OpError("OUTPUT_WRITE_FAILED", f"Could not find a free filename near {path}")


@contextmanager
def atomic_output(dest: Path) -> Iterator[Path]:
    """Yield a temp path; on clean exit move it onto `dest`. A crashed or
    cancelled op therefore never leaves a half-written file behind."""
    dest = Path(dest)
    ensure_dir(str(dest.parent))
    fd, tmp_name = tempfile.mkstemp(prefix=".iloathepdf-", suffix=dest.suffix, dir=str(dest.parent))
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        yield tmp
        os.replace(tmp, dest)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


@contextmanager
def temp_dir() -> Iterator[Path]:
    d = Path(tempfile.mkdtemp(prefix="iloathepdf-"))
    try:
        yield d
    finally:
        shutil.rmtree(d, ignore_errors=True)


def size_of(path: Path) -> int:
    return Path(path).stat().st_size


def file_result(path: Path, **extra) -> dict:
    return {"path": str(path), "bytes": size_of(path), **extra}


# --------------------------------------------------------------------------
# pdf helpers shared by several ops
# --------------------------------------------------------------------------

def open_pdf(path: Path):
    """pikepdf.open with protocol-shaped errors."""
    import pikepdf

    try:
        return pikepdf.open(str(path))
    except pikepdf.PasswordError as exc:
        raise OpError("ENCRYPTED_PDF", f"{path.name} is password protected") from exc
    except pikepdf.PdfError as exc:
        raise OpError("CORRUPT_PDF", f"{path.name} could not be read: {exc}") from exc


# --------------------------------------------------------------------------
# ghostscript discovery (shared by pdf_compress and pdf_to_img)
# --------------------------------------------------------------------------

def find_ghostscript() -> str:
    """Locate the Ghostscript executable, or raise GHOSTSCRIPT_MISSING.

    Search order:
      1. $ILOATHEPDF_GS                      (explicit override, used by tests)
      2. <repo or bundle>/vendor/ghostscript/bin/gswin64c.exe   (shipped copy)
      3. PATH
    """
    override = os.environ.get("ILOATHEPDF_GS")
    if override and Path(override).is_file():
        return override

    names = ["gswin64c.exe", "gswin32c.exe", "gs"] if os.name == "nt" else ["gs"]

    # Dev: sidecar/ops/_common.py -> sidecar/ops -> sidecar -> project root.
    # Bundle: the exe sits in <resources>/sidecar/, vendor/ in <resources>/.
    exe_dir = Path(sys.executable).resolve().parent
    roots = (Path(__file__).resolve().parents[2], exe_dir, exe_dir.parent)
    for root in roots:
        for name in names:
            candidate = root / "vendor" / "ghostscript" / "bin" / name
            if candidate.is_file():
                return str(candidate)

    for name in names:
        found = shutil.which(name)
        if found:
            return found

    raise OpError(
        "GHOSTSCRIPT_MISSING",
        "Ghostscript was not found. Strong compression and PDF rasterising need it.",
    )


def has_ghostscript() -> bool:
    try:
        find_ghostscript()
        return True
    except OpError:
        return False
