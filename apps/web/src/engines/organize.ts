import { PDFDocument, degrees } from "pdf-lib";
import type { Engine } from "./types";

export const organizeEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to organize.");

  const order = (options.order as number[] | undefined) ?? [];
  const rotate = (options.rotate as Record<number, number> | undefined) ?? {};
  const remove = new Set((options.remove as number[] | undefined) ?? []);

  for (const deg of Object.values(rotate)) {
    if (deg % 90 !== 0) throw new Error(`Rotation must be a multiple of 90 degrees, got ${deg}.`);
  }

  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const srcPageCount = src.getPageCount();

  for (const i of order) {
    if (i < 0 || i >= srcPageCount) {
      throw new Error(`Page count doesn't match the PDF (${srcPageCount} pages).`);
    }
  }

  const keptOriginalIndices = order.filter((i) => !remove.has(i));
  if (keptOriginalIndices.length === 0) {
    throw new Error("Nothing to organize — no pages selected.");
  }

  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, keptOriginalIndices);
  pages.forEach((page, i) => {
    const originalIndex = keptOriginalIndices[i];
    const deg = rotate[originalIndex];
    if (deg) page.setRotation(degrees((page.getRotation().angle + deg) % 360));
    out.addPage(page);
  });

  const outBytes = await out.save();
  return {
    files: [
      {
        name: file.name.replace(/\.pdf$/i, "-organized.pdf"),
        blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }),
      },
    ],
    summary: `${src.getPageCount()} pages in → ${pages.length} pages out`,
    isPreview: false,
  };
};
