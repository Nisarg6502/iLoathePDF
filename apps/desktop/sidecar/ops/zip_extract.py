"""zip.extract -- unpack a ZIP next to itself, safely. See PROTOCOL.md.

Why here and not in Rust: Python's zipfile is already in the engine (zip.to_pdf
uses it), so this adds no dependency and nothing for `cargo audit` to flag,
and extraction gets the same progress, cancel and error path as every other
job the right-click menu runs.

Safety, in the order it is checked:

* Every entry name is checked before anything is written. A name that would
  land outside the destination (``..``, an absolute path, a drive letter, a
  UNC path) refuses the whole archive with UNSAFE_ARCHIVE: a ZIP that tries
  this is hostile or broken, and half-extracting it helps nobody.
* A password-protected or AES-encrypted archive is ENCRYPTED_ARCHIVE, and a
  compression method zipfile cannot read is UNSUPPORTED_FORMAT, both before
  writing anything.
* The declared size is checked against the free disk space. zipfile never
  returns more bytes than an entry declares, so a "zip bomb" cannot write
  more than that check allowed.
* Everything is written into a hidden staging folder inside the destination
  (same drive, so the final move is a rename), then moved into place under a
  name that is free. Nothing that already exists is ever overwritten: a taken
  name gets " (2)", " (3)" ... A failure, a CRC error or a cancel removes the
  staging folder, so nothing half-extracted is left behind.
* Names are made valid for Windows (``<>:"|?*``, control characters, trailing
  dots and spaces, CON/NUL/...), which also rules out writing to an NTFS
  alternate data stream through a ``name:stream`` entry. Symbolic links are
  skipped and counted.
* Names without the ZIP's UTF-8 flag are read as UTF-8 when they are valid
  UTF-8 (macOS, 7-Zip and most tools write that), else in the Windows OEM code
  page that Explorer's own "Compressed folder" uses, else as CP437.
"""
from __future__ import annotations

import os
import re
import shutil
import stat
import tempfile
import time
import zipfile
import zlib
from pathlib import Path

from ._common import OpError, ProgressFn, ensure_dir, existing_file, one_of, require

CHUNK = 1024 * 1024
# Room left on the disk beyond the archive's own size.
SPACE_MARGIN = 16 * 1024 * 1024

_SUPPORTED_METHODS = {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED, zipfile.ZIP_BZIP2, zipfile.ZIP_LZMA}
_METHOD_NAMES = {9: "Deflate64", 98: "PPMd", 93: "Zstandard", 95: "XZ", 97: "WavPack", 96: "JPEG"}
_AES = 99

_INVALID = re.compile(r'[<>:"|?*\x00-\x1f]')
_RESERVED = re.compile(r"^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$", re.IGNORECASE)
_DRIVE = re.compile(r"^[A-Za-z]:")


def decoded_name(info: zipfile.ZipInfo) -> str:
    """The entry's name as its creator meant it. See the module docstring."""
    name = info.filename
    if info.flag_bits & 0x800:
        return name
    try:
        raw = name.encode("cp437")
    except UnicodeEncodeError:
        return name
    for codec in ("utf-8", "oem"):
        try:
            return raw.decode(codec)
        except (UnicodeDecodeError, LookupError):
            continue
    return name


def is_unsafe(name: str) -> bool:
    """True when `name` would escape the folder it is extracted into."""
    normal = name.replace("\\", "/")
    if normal.startswith("/") or _DRIVE.match(normal):
        return True
    return any(part == ".." for part in normal.split("/"))


def safe_component(part: str) -> str:
    """One path component, made into a name Windows accepts."""
    cleaned = _INVALID.sub("_", part).rstrip(" .")
    if not cleaned:
        return "_"
    if _RESERVED.match(cleaned.split(".")[0]):
        cleaned = "_" + cleaned
    return cleaned


def entry_parts(name: str) -> list[str]:
    """'a/./b\\c.txt' -> ['a', 'b', 'c.txt'], each made safe."""
    parts = [p for p in name.replace("\\", "/").split("/") if p not in ("", ".")]
    return [safe_component(p) for p in parts]


def free_name(parent: Path, name: str, is_dir: bool) -> Path:
    """`parent/name`, or the first free 'name (2)', 'name (3)' ... beside it.

    Folders keep their whole name ('v1.2 (2)'); files keep their extension
    ('photo (2).jpg'). Windows compares names without regard to case.
    """
    taken = {p.name.lower() for p in parent.iterdir()} if parent.exists() else set()
    if name.lower() not in taken:
        return parent / name
    stem, ext = (name, "") if is_dir else os.path.splitext(name)
    if not stem:  # ".gitignore"
        stem, ext = name, ""
    for n in range(2, 100_000):
        candidate = f"{stem} ({n}){ext}"
        if candidate.lower() not in taken:
            return parent / candidate
    raise OpError("OUTPUT_WRITE_FAILED", f"Could not find a free name near {parent / name}")


def _long(path: Path) -> Path:
    """Lets Windows handle paths past 260 characters, which deep archives reach."""
    if os.name != "nt":
        return path
    text = str(path)
    if text.startswith("\\\\?\\"):
        return path
    if text.startswith("\\\\"):
        return Path("\\\\?\\UNC\\" + text[2:])
    return Path("\\\\?\\" + text)


def _plain(path: Path) -> str:
    """The path as the user would write it (no \\\\?\\ prefix)."""
    text = str(path)
    if text.startswith("\\\\?\\UNC\\"):
        return "\\\\" + text[8:]
    if text.startswith("\\\\?\\"):
        return text[4:]
    return text


def _is_symlink(info: zipfile.ZipInfo) -> bool:
    return info.create_system == 3 and stat.S_ISLNK(info.external_attr >> 16)


def _stamp(path: Path, info: zipfile.ZipInfo) -> None:
    try:
        when = time.mktime(info.date_time + (0, 0, -1))
        os.utime(path, (when, when))
    except (OverflowError, ValueError, OSError):
        pass  # A bad date in the archive is not worth failing over.


class _Tree:
    """Maps archive folders to the real folders created for them in staging.

    Two entries can collide once names are made safe or compared without case
    ('A.txt' and 'a.txt', or a file 'x' and a folder 'x/'): the later one gets
    a free name instead of overwriting the earlier one.
    """

    def __init__(self, root: Path) -> None:
        self.root = root
        self.dirs: dict[tuple[str, ...], Path] = {(): root}

    def folder(self, parts: list[str]) -> Path:
        key: tuple[str, ...] = ()
        current = self.root
        for part in parts:
            key = key + (part.lower(),)
            known = self.dirs.get(key)
            if known is None:
                target = current / part
                if target.exists() and not target.is_dir():
                    target = free_name(current, part, is_dir=True)
                target.mkdir(exist_ok=True)
                self.dirs[key] = known = target
            current = known
        return current

    def file(self, parts: list[str]) -> Path:
        parent = self.folder(parts[:-1])
        return free_name(parent, parts[-1], is_dir=False)


def run(params: dict, progress: ProgressFn) -> dict:
    src = existing_file(require(params, "input"))
    mode = one_of(params, "mode", ("here", "folder"), "folder")
    out_dir = ensure_dir(params.get("output_dir") or str(src.parent))

    try:
        archive = zipfile.ZipFile(src)
    except zipfile.BadZipFile as exc:
        raise OpError("CORRUPT_ARCHIVE", f"{src.name} is not a ZIP file, or it is damaged: {exc}") from exc
    except OSError as exc:
        raise OpError("FILE_NOT_FOUND", f"Could not read {src.name}: {exc}") from exc

    with archive:
        # Everything is checked before anything is written.
        entries: list[tuple[zipfile.ZipInfo, list[str]]] = []
        skipped = 0
        for info in archive.infolist():
            name = decoded_name(info)
            if is_unsafe(name):
                raise OpError(
                    "UNSAFE_ARCHIVE",
                    f"{src.name} tries to put a file outside the folder it is extracted to ({name}). Nothing was extracted.",
                )
            if _is_symlink(info):
                skipped += 1
                continue
            parts = entry_parts(name)
            if not parts:
                continue
            if info.flag_bits & 0x1 or info.compress_type == _AES:
                raise OpError("ENCRYPTED_ARCHIVE", f"{src.name} is password protected")
            if not info.is_dir() and info.compress_type not in _SUPPORTED_METHODS:
                method = _METHOD_NAMES.get(info.compress_type, f"method {info.compress_type}")
                raise OpError(
                    "UNSUPPORTED_FORMAT",
                    f"{src.name} uses {method} compression, which this app cannot unpack. Try 7-Zip.",
                )
            entries.append((info, parts))

        if not entries:
            raise OpError("EMPTY_ARCHIVE", f"{src.name} has nothing in it to extract")

        total = sum(info.file_size for info, _ in entries if not info.is_dir())
        free = shutil.disk_usage(out_dir).free
        if total + SPACE_MARGIN > free:
            raise OpError(
                "OUTPUT_WRITE_FAILED",
                f"Not enough free space: {src.name} unpacks to {total // (1024 * 1024)} MB "
                f"and the drive has {free // (1024 * 1024)} MB free.",
            )

        staging = Path(tempfile.mkdtemp(prefix=".iloathepdf-extract-", dir=str(out_dir)))
        try:
            files, folders = _extract(archive, entries, _long(staging), total, progress)
            progress(98, "Moving into place")
            placed, renamed = _place(_long(staging), _long(out_dir), mode, src)
        finally:
            shutil.rmtree(_long(staging), ignore_errors=True)

    progress(100, "Done")
    outputs = [{"path": _plain(p), "bytes": _size(p)} for p in placed]
    return {
        "output": outputs[0]["path"] if mode == "folder" else str(out_dir),
        "outputs": outputs,
        "files": files,
        "folders": folders,
        "bytes": total,
        "renamed": renamed,
        "skipped": skipped,
    }


def _extract(archive, entries, staging: Path, total: int, progress: ProgressFn) -> tuple[int, int]:
    tree = _Tree(staging)
    done = 0
    files = 0
    folders: set[tuple[str, ...]] = set()
    for info, parts in entries:
        if info.is_dir():
            tree.folder(parts)
            folders.add(tuple(p.lower() for p in parts))
            continue
        for depth in range(1, len(parts)):
            folders.add(tuple(p.lower() for p in parts[:depth]))
        dest = tree.file(parts)
        progress(int(95 * done / total) if total else 0, parts[-1])
        try:
            with archive.open(info) as reader, open(dest, "wb") as writer:
                while chunk := reader.read(CHUNK):
                    writer.write(chunk)
                    done += len(chunk)
                    progress(int(95 * done / total) if total else 0, parts[-1])
        except (zipfile.BadZipFile, zlib.error, EOFError, NotImplementedError) as exc:
            raise OpError("CORRUPT_ARCHIVE", f"{'/'.join(parts)} in the ZIP is damaged: {exc}") from exc
        except RuntimeError as exc:  # zipfile's "password required"
            raise OpError("ENCRYPTED_ARCHIVE", f"{'/'.join(parts)} is password protected") from exc
        except OSError as exc:
            raise OpError("OUTPUT_WRITE_FAILED", f"Could not write {'/'.join(parts)}: {exc}") from exc
        _stamp(dest, info)
        files += 1
    for info, parts in entries:
        if info.is_dir():
            _stamp(tree.folder(parts), info)
    return files, len(folders)


def _place(staging: Path, out_dir: Path, mode: str, src: Path) -> tuple[list[Path], int]:
    """Moves the staged items to free names in `out_dir`. Returns where they
    went, and how many got a different name than in the archive."""
    if mode == "folder":
        stem = safe_component(src.stem)
        items = list(staging.iterdir())
        # "report.zip" holding just "report/": one folder, not report/report.
        if len(items) == 1 and items[0].is_dir() and items[0].name.lower() == stem.lower():
            source = items[0]
        else:
            source = staging / stem
            source.mkdir()
            for item in items:
                item.rename(source / item.name)
        target = _move(source, out_dir, stem)
        return [target], int(target.name != stem)

    placed: list[Path] = []
    renamed = 0
    for item in sorted(staging.iterdir(), key=lambda p: p.name.lower()):
        target = _move(item, out_dir, item.name)
        renamed += int(target.name != item.name)
        placed.append(target)
    return placed, renamed


def _move(item: Path, parent: Path, name: str) -> Path:
    for _ in range(20):
        target = free_name(parent, name, is_dir=item.is_dir())
        try:
            # os.rename never replaces an existing entry on Windows. Elsewhere
            # it would, so check first (free_name just did) and accept the
            # tiny window: this is the user's own folder, not a shared one.
            if target.exists():
                continue
            item.rename(target)
        except FileExistsError:
            continue  # Something appeared under that name meanwhile.
        except OSError as exc:
            raise OpError("OUTPUT_WRITE_FAILED", f"Could not move {name} into place: {exc}") from exc
        return target
    raise OpError("OUTPUT_WRITE_FAILED", f"Could not find a free name for {name}")


def _size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
