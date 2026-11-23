"""Draw the app icon: the iLoathePDF mark, a page with one line redacted, on
an amber tile. It is the same mark as the website's favicon
(apps/web/public/favicon.svg); keep the coordinates in step with it.

Regenerate the full Windows icon set with:
    .venv/Scripts/python.exe scripts/make_icon.py
    npx tauri icon build/icon.png
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

S = 1024  # master size; every other size is downscaled from this
OUT = Path(__file__).resolve().parents[1] / "build" / "icon.png"

AMBER = (232, 152, 0, 255)
PAPER = (255, 253, 248, 255)
FOLD = (243, 201, 120, 255)
FOG = (201, 191, 178, 255)
INK = (30, 24, 19, 255)

UNIT = 64  # the coordinates below are on the SVG's 64x64 grid


def build() -> Image.Image:
    # Supersample, then downscale once at the end: Pillow has no antialiased
    # drawing, so this is how the rounded corners stay smooth.
    scale = S * 4 / UNIT
    big = S * 4
    icon = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(icon)

    def s(v: float) -> int:
        return round(v * scale)

    def box(x: float, y: float, w: float, h: float) -> list[int]:
        return [s(x), s(y), s(x + w) - 1, s(y + h) - 1]

    d.rounded_rectangle([0, 0, big - 1, big - 1], s(14), fill=AMBER)

    # The page: a rounded rectangle with its top-right corner cut away...
    d.rounded_rectangle(box(16, 9, 32, 46), s(3), fill=PAPER)
    d.polygon([(s(37), s(9) - 2), (s(48) + 2, s(9) - 2), (s(48) + 2, s(20))], fill=AMBER)
    # ...and folded over.
    d.polygon([(s(37), s(9)), (s(37), s(17)), (s(37.4), s(18.5)), (s(38.5), s(19.6)),
               (s(40), s(20)), (s(48), s(20))], fill=FOLD)

    # Two lines of text and, between them, the redaction bar running past the page.
    d.rounded_rectangle(box(21.5, 24, 15, 3.4), s(1.7), fill=FOG)
    d.rounded_rectangle(box(9, 30.5, 46, 10), s(1.2), fill=INK)
    d.rounded_rectangle(box(21.5, 45, 18, 3.4), s(1.7), fill=FOG)

    return icon.resize((S, S), Image.LANCZOS)


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    build().save(OUT)
    print(f"wrote {OUT}")
