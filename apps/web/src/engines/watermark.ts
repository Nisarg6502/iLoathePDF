import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { parseRanges } from "@/lib/ranges";
import type { Engine } from "./types";

type ContentKind = "text" | "image";
type Placement = "single" | "tiled";
type PageNumberFormat = "n" | "page-n" | "n-of-total";

interface WatermarkSpec {
  content: ContentKind; text?: string; imageDataUrl?: string;
  fontSize?: number; color?: string; opacity: number; rotation: number; placement: Placement;
}
interface PageNumbersSpec {
  position: string; format: PageNumberFormat; start: number; fontSize?: number; color?: string;
}
interface StampSpec {
  content: ContentKind; text?: string; imageDataUrl?: string; position: string;
  fontSize?: number; color?: string; maxWidthPct?: number;
}

// name -> [xPct, yPct, hAlign, vAlign], same top-left-origin convention pdf.sign already uses.
const ALL_POSITIONS: Record<string, [number, number, "left" | "center" | "right", "top" | "middle" | "bottom"]> = {
  "top-left": [0.05, 0.05, "left", "top"],
  "top-center": [0.5, 0.05, "center", "top"],
  "top-right": [0.95, 0.05, "right", "top"],
  left: [0.05, 0.5, "left", "middle"],
  center: [0.5, 0.5, "center", "middle"],
  right: [0.95, 0.5, "right", "middle"],
  "bottom-left": [0.05, 0.95, "left", "bottom"],
  "bottom-center": [0.5, 0.95, "center", "bottom"],
  "bottom-right": [0.95, 0.95, "right", "bottom"],
};
const PAGE_NUMBER_POSITIONS = Object.keys(ALL_POSITIONS).filter((p) => !["left", "center", "right"].includes(p));
const STAMP_POSITIONS = Object.keys(ALL_POSITIONS);
const TILE_COLS = 3;
const TILE_ROWS = 4;

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((hex || "#000000").trim());
  if (!m) return rgb(0, 0, 0);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function resolvePages(spec: string, pageCount: number): number[] {
  if (spec === "all") return Array.from({ length: pageCount }, (_, i) => i);
  if (spec === "first" || !spec.trim()) return [0];
  return parseRanges(spec, pageCount);
}

async function embedImageFromDataUrl(doc: PDFDocument, dataUrl: string) {
  const bytes = dataUrlToBytes(dataUrl);
  const isJpeg = dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg");
  return isJpeg ? doc.embedJpg(bytes) : doc.embedPng(bytes);
}

/** x/y of the content's own drawing anchor (bottom-left before rotation), aligned per h/vAlign. */
function alignedXY(
  xPct: number, yPct: number, pageW: number, pageH: number,
  hAlign: "left" | "center" | "right", vAlign: "top" | "middle" | "bottom",
  contentW: number, contentH: number,
): { x: number; y: number } {
  const anchorX = xPct * pageW;
  const anchorY = pageH - yPct * pageH;
  const x = hAlign === "left" ? anchorX : hAlign === "right" ? anchorX - contentW : anchorX - contentW / 2;
  const y = vAlign === "bottom" ? anchorY : vAlign === "top" ? anchorY - contentH : anchorY - contentH / 2;
  return { x, y };
}

export const watermarkEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF.");

  const mode = options.mode as string;
  if (!["watermark", "page_numbers", "stamp"].includes(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const targetIndices = resolvePages((options.pages as string) ?? "all", pages.length);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  if (mode === "watermark") {
    const spec = options.watermark as WatermarkSpec;
    if (!spec.placement || !["single", "tiled"].includes(spec.placement)) {
      throw new Error(`Unknown placement: ${spec.placement}`);
    }
    let image: Awaited<ReturnType<typeof doc.embedPng>> | undefined;
    if (spec.content === "image") {
      if (!spec.imageDataUrl) throw new Error("Add an image for the watermark.");
      image = await embedImageFromDataUrl(doc, spec.imageDataUrl);
    } else if (!spec.text) {
      throw new Error("Add watermark text.");
    }

    for (const pageIndex of targetIndices) {
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      const pivots: [number, number][] =
        spec.placement === "tiled"
          ? Array.from({ length: TILE_ROWS }, (_, row) =>
              Array.from({ length: TILE_COLS }, (_, col) => [
                (col + 0.5) * (width / TILE_COLS),
                (row + 0.5) * (height / TILE_ROWS),
              ] as [number, number]),
            ).flat()
          : [[width / 2, height / 2]];

      for (const [x, y] of pivots) {
        if (image) {
          const w = width * 0.3;
          const h = (w * image.height) / image.width;
          page.drawImage(image, { x, y, width: w, height: h, rotate: degrees(spec.rotation), opacity: spec.opacity });
        } else {
          page.drawText(spec.text!, {
            x, y, size: Math.max(4, spec.fontSize ?? 48), font,
            color: hexToRgb(spec.color ?? "#888888"),
            rotate: degrees(spec.rotation), opacity: spec.opacity,
          });
        }
      }
    }
  } else if (mode === "page_numbers") {
    const spec = options.page_numbers as PageNumbersSpec;
    if (!PAGE_NUMBER_POSITIONS.includes(spec.position)) {
      throw new Error(`Unknown position for page numbers: ${spec.position}`);
    }
    if (!["n", "page-n", "n-of-total"].includes(spec.format)) {
      throw new Error(`Unknown page number format: ${spec.format}`);
    }
    const [xPct, yPct, hAlign, vAlign] = ALL_POSITIONS[spec.position];
    const size = Math.max(4, spec.fontSize ?? 11);
    targetIndices.forEach((pageIndex, i) => {
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      const n = (spec.start ?? 1) + i;
      const text =
        spec.format === "n" ? String(n) : spec.format === "page-n" ? `Page ${n}` : `${n} of ${targetIndices.length}`;
      const textWidth = font.widthOfTextAtSize(text, size);
      // 0.7 factor (vs. 1.0 for geometric centering) matches desktop's optical
      // centering for text: alignedXY divides contentH by 2, so this yields
      // the same 0.35*fontSize offset as pdf_watermark.py's _draw_aligned_text.
      const { x, y } = alignedXY(xPct, yPct, width, height, hAlign, vAlign, textWidth, size * 0.7);
      page.drawText(text, { x, y, size, font, color: hexToRgb(spec.color ?? "#000000") });
    });
  } else {
    const spec = options.stamp as StampSpec;
    if (!STAMP_POSITIONS.includes(spec.position)) {
      throw new Error(`Unknown stamp position: ${spec.position}`);
    }
    const [xPct, yPct, hAlign, vAlign] = ALL_POSITIONS[spec.position];
    let image: Awaited<ReturnType<typeof doc.embedPng>> | undefined;
    if (spec.content === "image") {
      if (!spec.imageDataUrl) throw new Error("Add a stamp image.");
      image = await embedImageFromDataUrl(doc, spec.imageDataUrl);
    } else if (!spec.text) {
      throw new Error("Add stamp text.");
    }
    for (const pageIndex of targetIndices) {
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      if (image) {
        const w = width * (spec.maxWidthPct ?? 0.2);
        const h = (w * image.height) / image.width;
        const { x, y } = alignedXY(xPct, yPct, width, height, hAlign, vAlign, w, h);
        page.drawImage(image, { x, y, width: w, height: h });
      } else {
        const size = Math.max(4, spec.fontSize ?? 24);
        const textWidth = font.widthOfTextAtSize(spec.text!, size);
        const { x, y } = alignedXY(xPct, yPct, width, height, hAlign, vAlign, textWidth, size * 0.7);
        page.drawText(spec.text!, { x, y, size, font, color: hexToRgb(spec.color ?? "#000000") });
      }
    }
  }

  const outBytes = await doc.save();
  return {
    files: [
      {
        name: file.name.replace(/\.pdf$/i, `-${mode}.pdf`),
        blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }),
      },
    ],
    summary: `${targetIndices.length} page${targetIndices.length === 1 ? "" : "s"} affected`,
    isPreview: false,
  };
};
