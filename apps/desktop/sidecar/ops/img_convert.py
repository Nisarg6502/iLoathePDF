"""`img.convert` -- batch image conversion to jpg/png/webp.

Two behaviours here are deliberate and easy to get wrong:

* EXIF orientation is baked into the pixels before saving. Phone cameras store
  the sensor image unrotated plus an orientation tag; a converter that ignores
  the tag produces sideways photos, and formats we may write (png) have nowhere
  to put the tag anyway.
* Metadata is dropped by default. This app is offline for privacy reasons, so a
  conversion must not quietly carry GPS coordinates into a file the user is
  about to share.
"""
from __future__ import annotations

import pillow_heif
from PIL import Image, ImageColor, ImageOps, UnidentifiedImageError

from ._common import (
    OpError,
    ProgressFn,
    ensure_dir,
    existing_file,
    file_result,
    one_of,
    require,
    unique_path,
)

# Registered once at import: pillow-heif patches Pillow globally, and doing it
# per call would re-register the opener on every job.
pillow_heif.register_heif_opener()

_EXIF_ORIENTATION = 0x0112

_SAVE_FORMAT = {"jpg": "JPEG", "png": "PNG", "webp": "WEBP"}
# jpg is the only target with no alpha channel, so it is the only one that
# needs the background composited in.
_HAS_ALPHA = {"jpg": False, "png": True, "webp": True}


def _background_rgb(value) -> tuple[int, int, int]:
    try:
        rgb = ImageColor.getrgb(str(value))
    except ValueError as exc:
        raise OpError("BAD_PARAMS", f"Bad background colour: {value!r}") from exc
    return rgb[:3]


def _resize_spec(params: dict) -> tuple[str, int, float]:
    spec = params.get("resize") or {}
    if not isinstance(spec, dict):
        raise OpError("BAD_PARAMS", "'resize' must be an object")
    mode = one_of(spec, "mode", ("none", "max", "percent"), "none")
    max_px = spec.get("max_px", 2000)
    percent = spec.get("percent", 100)
    if mode == "max":
        try:
            max_px = int(max_px)
        except (TypeError, ValueError):
            max_px = 0
        if max_px <= 0:
            raise OpError("BAD_PARAMS", "resize.max_px must be a positive number")
    if mode == "percent":
        try:
            percent = float(percent)
        except (TypeError, ValueError):
            percent = 0.0
        if percent <= 0:
            raise OpError("BAD_PARAMS", "resize.percent must be a positive number")
    return mode, int(max_px or 0), float(percent or 0.0)


def _resized(img: Image.Image, mode: str, max_px: int, percent: float) -> Image.Image:
    width, height = img.size
    if mode == "max":
        longest = max(width, height)
        # Never upscale: enlarging pixels the user does not have only inflates
        # the file.
        if longest <= max_px:
            return img
        scale = max_px / longest
    elif mode == "percent":
        if percent == 100:
            return img
        scale = percent / 100.0
    else:
        return img
    target = (max(1, round(width * scale)), max(1, round(height * scale)))
    return img.resize(target, Image.LANCZOS)


def _flattened(img: Image.Image, fmt: str, background: tuple[int, int, int]) -> Image.Image:
    """Put the image into a mode the target format can actually store."""
    has_alpha = img.mode in ("RGBA", "LA", "PA") or "transparency" in img.info
    if _HAS_ALPHA[fmt]:
        return img.convert("RGBA" if has_alpha else "RGB")
    if has_alpha:
        # Compositing rather than a bare convert("RGB"): Pillow would otherwise
        # discard alpha and leave fully transparent pixels as black.
        src = img.convert("RGBA")
        canvas = Image.new("RGB", src.size, background)
        canvas.paste(src, mask=src.getchannel("A"))
        return canvas
    return img.convert("RGB")


def _save_kwargs(fmt: str, quality: int) -> dict:
    if fmt == "jpg":
        return {"quality": quality, "optimize": True}
    if fmt == "webp":
        return {"quality": quality}
    return {"optimize": True}


def run(params: dict, progress: ProgressFn) -> dict:
    inputs = require(params, "inputs")
    if not isinstance(inputs, list) or not inputs:
        raise OpError("BAD_PARAMS", "'inputs' must be a non-empty list of paths")
    output_dir = ensure_dir(require(params, "output_dir"))
    fmt = one_of(params, "format", ("jpg", "png", "webp"))
    try:
        quality = int(params.get("quality", 85))
    except (TypeError, ValueError):
        raise OpError("BAD_PARAMS", "'quality' must be a number") from None
    quality = max(1, min(100, quality))
    strip_metadata = bool(params.get("strip_metadata", True))
    background = _background_rgb(params.get("background") or "#FFFFFF")
    mode, max_px, percent = _resize_spec(params)

    outputs: list[dict] = []
    total = len(inputs)
    for index, raw in enumerate(inputs):
        src = existing_file(raw)
        progress(int(100 * index / total), f"{src.name} ({index + 1} of {total})")
        try:
            with Image.open(src) as opened:
                opened.load()
                # exif_transpose applies the orientation tag to the pixels and
                # clears it from the copy it returns, so the result is correct
                # whether or not we go on to keep the metadata.
                img = ImageOps.exif_transpose(opened) or opened.copy()
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise OpError("UNSUPPORTED_FORMAT", f"Cannot read {src.name}: {exc}") from exc

        scaled = _resized(img, mode, max_px, percent)
        out_img = _flattened(scaled, fmt, background)
        save_kwargs = _save_kwargs(fmt, quality)
        if strip_metadata:
            # Belt and braces: Pillow will happily re-emit an EXIF block that
            # travelled in .info even though we never asked it to.
            out_img.info.pop("exif", None)
        else:
            exif = img.getexif()
            exif[_EXIF_ORIENTATION] = 1  # pixels are already upright
            save_kwargs["exif"] = exif.tobytes()

        dest = unique_path(output_dir / f"{src.stem}.{fmt}")
        try:
            out_img.save(dest, _SAVE_FORMAT[fmt], **save_kwargs)
        except OSError as exc:
            raise OpError("OUTPUT_WRITE_FAILED", f"Cannot write {dest.name}: {exc}") from exc
        outputs.append(file_result(dest, width=out_img.width, height=out_img.height))
        for temp in {id(out_img): out_img, id(scaled): scaled, id(img): img}.values():
            temp.close()

    progress(100, "Done")
    return {"outputs": outputs, "count": len(outputs)}
