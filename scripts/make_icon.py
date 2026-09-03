"""Draw the app icon: a document sheet with a padlock, on the accent blue.

Regenerate the full Windows icon set with:
    .venv/Scripts/python.exe scripts/make_icon.py
    npx tauri icon build/icon.png
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

S = 1024  # master size; every other size is downscaled from this
OUT = Path(__file__).resolve().parents[1] / "build" / "icon.png"

ACCENT_TOP = (86, 122, 246)
ACCENT_BOTTOM = (58, 88, 214)
SHEET = (255, 255, 255)
SHEET_EDGE = (222, 228, 244)
FOLD = (206, 216, 240)
INK = (58, 88, 214)


def vertical_gradient(size: int, top: tuple, bottom: tuple) -> Image.Image:
    """A one-pixel-wide gradient stretched out; cheaper and smoother than
    drawing 1024 individual lines at full width."""
    strip = Image.new("RGB", (1, size))
    px = strip.load()
    for y in range(size):
        t = y / (size - 1)
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    return strip.resize((size, size), Image.BILINEAR)


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius, fill=255)
    return mask


def build() -> Image.Image:
    # Supersample, then downscale once at the end: Pillow has no antialiased
    # drawing, so this is how the curves and the padlock shackle stay smooth.
    scale = 4
    s = S * scale
    icon = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    icon.paste(vertical_gradient(s, ACCENT_TOP, ACCENT_BOTTOM), (0, 0), rounded_mask(s, int(s * 0.22)))

    d = ImageDraw.Draw(icon)

    # --- the sheet, with a folded top-right corner ------------------------
    left, top, right, bottom = int(s * 0.26), int(s * 0.19), int(s * 0.74), int(s * 0.81)
    fold = int(s * 0.15)
    radius = int(s * 0.035)

    d.rounded_rectangle([left, top, right, bottom], radius, fill=SHEET, outline=SHEET_EDGE,
                        width=max(1, int(s * 0.004)))
    # Cut the corner away, then draw the turned-back flap over the gap.
    d.polygon([(right - fold, top - 2), (right + 2, top - 2), (right + 2, top + fold)],
              fill=(0, 0, 0, 0))
    d.polygon([(right - fold, top), (right - fold, top + fold), (right, top + fold)], fill=FOLD)
    d.line([(right - fold, top), (right, top + fold)], fill=SHEET_EDGE,
           width=max(1, int(s * 0.004)))

    # --- text lines, cut short where the padlock sits --------------------
    line_h = int(s * 0.026)
    for i, width_frac in enumerate((0.34, 0.30, 0.34, 0.20)):
        y = top + int(s * 0.20) + i * int(s * 0.075)
        x0 = left + int(s * 0.07)
        d.rounded_rectangle([x0, y, x0 + int(s * width_frac), y + line_h], line_h // 2,
                            fill=(226, 232, 246))

    # --- padlock, overlapping the sheet's bottom edge ---------------------
    cx, cy = int(s * 0.62), int(s * 0.68)
    body_w, body_h = int(s * 0.20), int(s * 0.17)
    body = [cx - body_w // 2, cy - body_h // 2, cx + body_w // 2, cy + body_h // 2]

    shackle_w = int(s * 0.028)
    shackle_r = int(s * 0.062)
    d.arc([cx - shackle_r, cy - body_h // 2 - shackle_r, cx + shackle_r, cy - body_h // 2 + shackle_r],
          start=180, end=360, fill=INK, width=shackle_w)
    d.rectangle([cx - shackle_r - shackle_w // 2, cy - body_h // 2 - int(s * 0.01),
                 cx - shackle_r + shackle_w // 2, cy - body_h // 2], fill=INK)
    d.rectangle([cx + shackle_r - shackle_w // 2, cy - body_h // 2 - int(s * 0.01),
                 cx + shackle_r + shackle_w // 2, cy - body_h // 2], fill=INK)

    d.rounded_rectangle(body, int(s * 0.03), fill=INK)
    keyhole = int(s * 0.018)
    d.ellipse([cx - keyhole, cy - keyhole - int(s * 0.012),
               cx + keyhole, cy + keyhole - int(s * 0.012)], fill=SHEET)
    d.polygon([(cx - keyhole // 2, cy), (cx + keyhole // 2, cy),
               (cx + keyhole, cy + int(s * 0.035)), (cx - keyhole, cy + int(s * 0.035))], fill=SHEET)

    return icon.resize((S, S), Image.LANCZOS)


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    build().save(OUT)
    print(f"wrote {OUT}")
