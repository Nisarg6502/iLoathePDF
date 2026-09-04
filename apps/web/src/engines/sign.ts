import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Engine } from "./types";
import type { SignElement } from "@/tools/sign/types";
import { isImageElement } from "@/tools/sign/types";

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
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

export const signEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to sign.");

  const elements = (options.elements as SignElement[] | undefined) ?? [];
  if (elements.length === 0) throw new Error("Add at least one signature, text, date or initials before exporting.");

  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Embedding is async and keyed by the exact data URL, so do it once per
  // distinct image rather than once per element (the same signature is
  // often placed more than once).
  const imageCache = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();

  for (const el of elements) {
    if (el.pageIndex < 0 || el.pageIndex >= pages.length) {
      throw new Error(`Element targets page ${el.pageIndex + 1}, but the PDF only has ${pages.length} pages.`);
    }
    const page = pages[el.pageIndex];
    const { width: pageWidthPt, height: pageHeightPt } = page.getSize();

    const xPt = el.xPct * pageWidthPt;
    const boxTopPt = pageHeightPt - el.yPct * pageHeightPt;
    const boxHeightPt = el.hPct * pageHeightPt;
    const yPt = boxTopPt - boxHeightPt; // bottom edge, PDF's y-up origin
    const wPt = el.wPct * pageWidthPt;

    if (isImageElement(el)) {
      let image = imageCache.get(el.imageDataUrl);
      if (!image) {
        image = await doc.embedPng(dataUrlToBytes(el.imageDataUrl));
        imageCache.set(el.imageDataUrl, image);
      }
      page.drawImage(image, { x: xPt, y: yPt, width: wPt, height: boxHeightPt });
    } else {
      const size = Math.max(4, el.fontSize);
      const baselineY = yPt + Math.max(0, (boxHeightPt - size) / 2) + size * 0.18;
      page.drawText(el.text, {
        x: xPt,
        y: baselineY,
        size,
        font,
        color: hexToRgb(el.color),
      });
    }
  }

  const outBytes = await doc.save();
  return {
    files: [
      {
        name: file.name.replace(/\.pdf$/i, "-signed.pdf"),
        blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }),
      },
    ],
    summary: `${elements.length} element${elements.length === 1 ? "" : "s"} added across ${pages.length} page${pages.length === 1 ? "" : "s"}`,
    isPreview: false,
  };
};
