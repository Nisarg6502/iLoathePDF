import { PDFDocument } from "pdf-lib";
import { parseRanges } from "@/lib/ranges";
import type { Engine } from "./types";

const SIDES = ["top", "right", "bottom", "left"] as const;
type Side = (typeof SIDES)[number];
export type CropMargins = Record<Side, number>;

export function readMargins(options: Record<string, unknown>): CropMargins {
  const out = {} as CropMargins;
  for (const side of SIDES) {
    const value = Number(options[side] ?? 0);
    if (!Number.isFinite(value) || value < 0 || value >= 100) {
      throw new Error(`The ${side} margin must be a percentage from 0 to under 100.`);
    }
    out[side] = value;
  }
  if (out.top + out.bottom >= 100 || out.left + out.right >= 100) {
    throw new Error("Those margins would crop away the whole page.");
  }
  if (SIDES.every((s) => out[s] === 0)) throw new Error("Set at least one margin above 0.");
  return out;
}

/**
 * Applies margins measured on the page as the reader sees it to the page's
 * unrotated box. Mirrors the desktop engine (sidecar/ops/pdf_crop.py).
 */
export function trimmedBox(
  box: { x: number; y: number; width: number; height: number },
  rotation: number,
  margins: CropMargins,
): { x: number; y: number; width: number; height: number } {
  const turns = ((Math.round(rotation / 90) % 4) + 4) % 4;
  const visualW = turns % 2 ? box.height : box.width;
  const visualH = turns % 2 ? box.width : box.height;

  const shave: CropMargins = { top: 0, right: 0, bottom: 0, left: 0 };
  SIDES.forEach((side, visualIndex) => {
    const unrotated = SIDES[(((visualIndex - turns) % 4) + 4) % 4];
    const extent = side === "top" || side === "bottom" ? visualH : visualW;
    shave[unrotated] += (margins[side] / 100) * extent;
  });

  return {
    x: box.x + shave.left,
    y: box.y + shave.bottom,
    width: box.width - shave.left - shave.right,
    height: box.height - shave.top - shave.bottom,
  };
}

export const cropEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to crop.");
  const margins = readMargins(options);

  const doc = await PDFDocument.load(await file.arrayBuffer());
  const pages = doc.getPages();
  let targets: number[];
  try {
    targets = [...new Set(parseRanges(String(options.pages ?? ""), pages.length))];
  } catch (err) {
    throw new Error(err instanceof RangeError ? err.message : "Check the page selection.");
  }

  for (const index of targets) {
    const page = pages[index];
    const box = trimmedBox(page.getCropBox(), page.getRotation().angle, margins);
    page.setMediaBox(box.x, box.y, box.width, box.height);
    page.setCropBox(box.x, box.y, box.width, box.height);
  }

  const bytes = await doc.save();
  return {
    files: [
      {
        name: file.name.replace(/\.pdf$/i, "-cropped.pdf"),
        blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
      },
    ],
    summary: `${targets.length} of ${pages.length} page${pages.length === 1 ? "" : "s"} cropped`,
    isPreview: false,
  };
};
