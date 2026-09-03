"""`img.to_pdf` -- wrap images into a PDF, one page per image.

img2pdf does the work because it embeds a JPEG's compressed bytes verbatim: a
photo album turned into a PDF stays the size of the photos instead of being
re-encoded (and degraded) by a rasteriser. Anything img2pdf refuses -- HEIC,
webp, alpha, a JPEG whose EXIF says "rotate me" -- is transcoded to JPEG in a
temp dir first, which is the narrowest fallback that keeps the fast path fast.
"""
from __future__ import annotations

from pathlib import Path

import img2pdf
import pillow_heif
from PIL import Image, ImageOps, UnidentifiedImageError

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    one_of,
    require,
    size_of,
    temp_dir,
)

pillow_heif.register_heif_opener()

_EXIF_ORIENTATION = 0x0112

# Points, via img2pdf's own converter so the numbers match its layout maths.
_PAGE_SIZES = {
    "a4": (img2pdf.mm_to_pt(210), img2pdf.mm_to_pt(297)),
    "letter": (img2pdf.in_to_pt(8.5), img2pdf.in_to_pt(11)),
}

# Formats img2pdf can embed without re-encoding. Everything else is transcoded.
_EMBEDDABLE = {"JPEG", "PNG"}


def _needs_transcode(img: Image.Image) -> bool:
    if (img.format or "").upper() not in _EMBEDDABLE:
        return True
    if img.mode in ("RGBA", "LA", "PA") or "transparency" in img.info:
        return True  # img2pdf raises AlphaChannelError rather than flattening
    if img.mode in ("P", "CMYK", "I", "I;16", "F"):
        return True
    # img2pdf refuses rotated JPEGs outright instead of honouring the tag.
    return int(img.getexif().get(_EXIF_ORIENTATION, 1) or 1) != 1


def _transcode(src: Path, dest_dir: Path, index: int) -> Path:
    """Flatten to a plain RGB JPEG that img2pdf will accept."""
    with Image.open(src) as opened:
        opened.load()
        upright = ImageOps.exif_transpose(opened) or opened.copy()
    with upright:
        if upright.mode in ("RGBA", "LA", "PA") or "transparency" in upright.info:
            rgba = upright.convert("RGBA")
            flat = Image.new("RGB", rgba.size, (255, 255, 255))
            flat.paste(rgba, mask=rgba.getchannel("A"))
            rgba.close()
        else:
            flat = upright.convert("RGB")
        dest = dest_dir / f"{index:04d}-{src.stem}.jpg"
        with flat:
            flat.save(dest, "JPEG", quality=92, optimize=True)
    return dest


def _layout_fun(page_size: str, orientation: str, margin_mm: float):
    border = None
    if margin_mm > 0:
        margin_pt = img2pdf.mm_to_pt(margin_mm)
        border = (margin_pt, margin_pt)

    if page_size == "fit":
        # pagesize=None means "page is the image"; a border still applies, so a
        # nonzero margin grows the page rather than being silently dropped.
        return img2pdf.get_layout_fun(pagesize=None, border=border)

    width, height = _PAGE_SIZES[page_size]
    if orientation == "landscape":
        width, height = height, width
    # auto_orient flips the page per image, so a landscape photo does not get
    # letterboxed onto a portrait sheet.
    return img2pdf.get_layout_fun(
        pagesize=(width, height),
        border=border,
        auto_orient=(orientation == "auto"),
    )


def run(params: dict, progress: ProgressFn) -> dict:
    inputs = require(params, "inputs")
    if not isinstance(inputs, list) or not inputs:
        raise OpError("BAD_PARAMS", "'inputs' must be a non-empty list of paths")
    output = Path(require(params, "output"))
    page_size = one_of(params, "page_size", ("fit", "a4", "letter"), "fit")
    orientation = one_of(params, "orientation", ("auto", "portrait", "landscape"), "auto")
    try:
        margin_mm = float(params.get("margin_mm") or 0)
    except (TypeError, ValueError):
        raise OpError("BAD_PARAMS", "'margin_mm' must be a number") from None
    if margin_mm < 0:
        raise OpError("BAD_PARAMS", "'margin_mm' must not be negative")

    sources = [existing_file(raw) for raw in inputs]
    total = len(sources)

    with temp_dir() as scratch:
        prepared: list[str] = []
        for index, src in enumerate(sources):
            progress(int(80 * index / total), f"{src.name} ({index + 1} of {total})")
            try:
                with Image.open(src) as probe:
                    probe.load()
                    transcode = _needs_transcode(probe)
            except (UnidentifiedImageError, OSError, ValueError) as exc:
                raise OpError("UNSUPPORTED_FORMAT", f"Cannot read {src.name}: {exc}") from exc
            if transcode:
                try:
                    src = _transcode(src, scratch, index)
                except (OSError, ValueError) as exc:
                    raise OpError(
                        "UNSUPPORTED_FORMAT", f"Cannot convert {src.name}: {exc}"
                    ) from exc
            prepared.append(str(src))

        progress(85, "Building PDF")
        layout = _layout_fun(page_size, orientation, margin_mm)
        try:
            with atomic_output(output) as tmp:
                with open(tmp, "wb") as handle:
                    img2pdf.convert(*prepared, outputstream=handle, layout_fun=layout)
        except img2pdf.ImageOpenError as exc:
            raise OpError("UNSUPPORTED_FORMAT", str(exc)) from exc
        except OSError as exc:
            raise OpError("OUTPUT_WRITE_FAILED", f"Cannot write {output.name}: {exc}") from exc

    progress(100, "Done")
    return {"output": str(output), "bytes": size_of(output), "pages": total}
