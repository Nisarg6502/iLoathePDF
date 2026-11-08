"""zip.to_pdf -- turn the images, PDFs and text files inside a ZIP into one PDF.
See PROTOCOL.md.

Entries are taken in natural filename order (page2 before page10) across the
whole archive. Nothing is extracted by its archive path: each supported entry
is copied to a scratch folder under a generated name, so a hostile archive
cannot write outside it ("zip slip"), and reads are capped so a zip bomb
cannot fill the disk.
"""
from __future__ import annotations

import re
import zipfile
from pathlib import Path, PurePosixPath

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    one_of,
    open_pdf,
    require,
    size_of,
    temp_dir,
)

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp", ".tif", ".tiff", ".gif"}
TEXT_EXTS = {".txt"}
MAX_ENTRIES = 1000
MAX_TOTAL_BYTES = 500 * 1024 * 1024


def _natural_key(name: str) -> list:
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", name.lower())]


def _supported(info: zipfile.ZipInfo) -> bool:
    if info.is_dir():
        return False
    parts = PurePosixPath(info.filename.replace("\\", "/")).parts
    if not parts or parts[0] == "__MACOSX" or parts[-1].startswith("."):
        return False
    return PurePosixPath(parts[-1]).suffix.lower() in IMAGE_EXTS | TEXT_EXTS | {".pdf"}


def run(params: dict, progress: ProgressFn) -> dict:
    import pikepdf

    from . import doc_to_pdf, img_to_pdf

    src = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))
    page_size = one_of(params, "page_size", ("fit", "a4", "letter"), "fit")
    orientation = one_of(params, "orientation", ("auto", "portrait", "landscape"), "auto")

    try:
        archive = zipfile.ZipFile(src)
    except (zipfile.BadZipFile, OSError) as exc:
        raise OpError("UNSUPPORTED_FORMAT", f"{src.name} is not a readable ZIP file: {exc}") from exc

    with archive, temp_dir() as scratch:
        infos = [i for i in archive.infolist() if _supported(i)]
        if len(infos) > MAX_ENTRIES:
            raise OpError("UNSUPPORTED_FORMAT", f"{src.name} holds more than {MAX_ENTRIES} files")
        skipped = len([i for i in archive.infolist() if not i.is_dir()]) - len(infos)
        if not infos:
            raise OpError("UNSUPPORTED_FORMAT", "No images, PDFs or text files were found in that ZIP")
        if any(i.flag_bits & 0x1 for i in infos):
            raise OpError("ENCRYPTED_PDF", f"{src.name} is password protected")
        infos.sort(key=lambda i: _natural_key(i.filename))

        parts: list[Path] = []
        copied = 0
        for index, info in enumerate(infos):
            progress(int(70 * index / len(infos)), PurePosixPath(info.filename).name)
            ext = PurePosixPath(info.filename).suffix.lower()
            raw = scratch / f"{index:04d}{ext}"
            try:
                with archive.open(info) as reader, open(raw, "wb") as writer:
                    while chunk := reader.read(1024 * 1024):
                        copied += len(chunk)
                        if copied > MAX_TOTAL_BYTES:
                            raise OpError("UNSUPPORTED_FORMAT", "That ZIP expands to more than 500 MB")
                        writer.write(chunk)
            except (zipfile.BadZipFile, RuntimeError, OSError) as exc:
                raise OpError("UNSUPPORTED_FORMAT", f"Cannot read {info.filename} from the ZIP: {exc}") from exc

            if ext == ".pdf":
                parts.append(raw)
            elif ext in TEXT_EXTS:
                out = doc_to_pdf.run_txt(
                    {"inputs": [str(raw)], "output_dir": str(scratch / "txt"), "page_size": "a4" if page_size == "fit" else page_size},
                    lambda *_: None,
                )
                parts.append(Path(out["outputs"][0]["path"]))
            else:
                piece = scratch / f"{index:04d}.pdf"
                img_to_pdf.run(
                    {"inputs": [str(raw)], "output": str(piece), "page_size": page_size, "orientation": orientation},
                    lambda *_: None,
                )
                parts.append(piece)

        progress(80, "Joining pages")
        merged = pikepdf.Pdf.new()
        for part in parts:
            with open_pdf(part) as pdf:
                merged.pages.extend(pdf.pages)
        pages = len(merged.pages)
        with atomic_output(dest) as tmp:
            merged.save(str(tmp))
        merged.close()

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest), "pages": pages, "files": len(infos), "skipped": skipped}
