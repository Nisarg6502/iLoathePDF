import { PDFDocument, type PDFImage } from "pdf-lib";
import type { Engine } from "./types";
import { renderRotatedCropped, isNoopEdit, type ImageEdit, type ImageEdits } from "@/tools/imageEdit";

const A4 = [595.28, 841.89] as const; // points

async function embedImage(doc: PDFDocument, file: File, edit: ImageEdit | undefined): Promise<PDFImage> {
  if (isNoopEdit(edit)) {
    const bytes = await file.arrayBuffer();
    const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
    return isPng ? doc.embedPng(bytes) : doc.embedJpg(bytes);
  }

  const bitmap = await createImageBitmap(file);
  const canvas = renderRotatedCropped(bitmap, edit!);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), "image/png");
  });
  const bytes = await blob.arrayBuffer();
  return doc.embedPng(bytes);
}

export const imagesToPdfEngine: Engine = async ({ files, options }) => {
  if (files.length === 0) throw new Error("Add at least one image.");

  const margin = Number(options.margin ?? 24);
  if (margin < 0) throw new Error("Margin cannot be negative.");

  const edits = (options.edits as ImageEdits | undefined) ?? {};
  const doc = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const image = await embedImage(doc, files[i], edits[i]);

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
