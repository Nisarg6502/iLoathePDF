"""Rasterise the logo mark (public/favicon.svg) into favicon.ico and
apple-touch-icon.png, for browsers and devices that don't use the SVG.

Pillow has no SVG renderer, so this redraws the same shapes on the same
64-unit grid, supersampled and then downscaled once so the edges stay smooth.
Keep the coordinates in step with public/favicon.svg.

Run from the repo root with the desktop app's venv (it has Pillow):
    apps/desktop/.venv/Scripts/python.exe apps/web/scripts/make_favicons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parents[1] / "public"

AMBER = (232, 152, 0, 255)
PAPER = (255, 253, 248, 255)
FOLD = (243, 201, 120, 255)
FOG = (201, 191, 178, 255)
INK = (30, 24, 19, 255)

UNIT = 64  # coordinates below are on the SVG's 64x64 grid


def draw_mark(size: int, rounded: bool) -> Image.Image:
    scale = size * 4 / UNIT  # supersample 4x
    big = round(UNIT * scale)
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def s(v: float) -> int:
        return round(v * scale)

    def box(x: float, y: float, w: float, h: float) -> list[int]:
        return [s(x), s(y), s(x + w) - 1, s(y + h) - 1]

    # Tile. The apple-touch icon is full-bleed: iOS rounds the corners itself.
    d.rounded_rectangle([0, 0, big - 1, big - 1], s(14) if rounded else 0, fill=AMBER)

    # The page: a rounded rectangle with its top-right corner cut away.
    d.rounded_rectangle(box(16, 9, 32, 46), s(3), fill=PAPER)
    d.polygon([(s(37), s(9) - 2), (s(48) + 2, s(9) - 2), (s(48) + 2, s(20))], fill=AMBER)
    # The folded-over corner.
    d.polygon([(s(37), s(9)), (s(37), s(17)), (s(37.4), s(18.5)), (s(38.5), s(19.6)),
               (s(40), s(20)), (s(48), s(20))], fill=FOLD)

    # Two lines of text and, between them, the redaction bar running past the page.
    d.rounded_rectangle(box(21.5, 24, 15, 3.4), s(1.7), fill=FOG)
    d.rounded_rectangle(box(9, 30.5, 46, 10), s(1.2), fill=INK)
    d.rounded_rectangle(box(21.5, 45, 18, 3.4), s(1.7), fill=FOG)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    ico_sizes = [16, 32, 48]
    frames = [draw_mark(n, rounded=True) for n in ico_sizes]
    frames[-1].save(PUBLIC / "favicon.ico", sizes=[(n, n) for n in ico_sizes],
                    append_images=frames[:-1])
    draw_mark(180, rounded=False).convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)


if __name__ == "__main__":
    main()
