import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { Engine } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const pdfToImagesEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to render.");

  const dpi = Number(options.dpi ?? 144);
  if (dpi < 72 || dpi > 300) throw new Error("DPI must be between 72 and 300.");
  const format = (options.format as string) === "jpg" ? "jpg" : "png";
  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";

  const bytes = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const baseName = file.name.replace(/\.pdf$/i, "");
  const outputs: { name: string; blob: Blob }[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const scale = dpi / 72;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable.");

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), mimeType, 0.92);
    });

    outputs.push({ name: `${baseName}-page-${pageNum}.${format}`, blob });
  }

  return {
    files: outputs,
    summary: `${doc.numPages} pages rendered at ${dpi} DPI`,
    isPreview: false,
  };
};
