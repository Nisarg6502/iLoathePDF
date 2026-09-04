import { PDFDocument } from "pdf-lib";
import type { Engine } from "./types";

const A4 = [595.28, 841.89] as const; // points

export const imagesToPdfEngine: Engine = async ({ files, options }) => {
  if (files.length === 0) throw new Error("Add at least one image.");

  const margin = Number(options.margin ?? 24);
  if (margin < 0) throw new Error("Margin cannot be negative.");

  const doc = await PDFDocument.create();

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
    const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);

    const [pageW, pageH] = A4;
    const page = doc.addPage([pageW, pageH]);
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;

    page.drawImage(image, {
      x: (pageW - w) / 2,
      y: (pageH - h) / 2,
      width: w,
      height: h,
    });
  }

  const outBytes = await doc.save();
  return {
    files: [{ name: "images.pdf", blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }) }],
    summary: `${files.length} images → 1 PDF, ${files.length} pages`,
    isPreview: false,
  };
};
