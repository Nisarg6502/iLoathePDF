import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PDFDocument } from "pdf-lib";
import type { Engine } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const compressEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to compress.");

  const dpi = Number(options.dpi ?? 96);
  if (dpi < 72 || dpi > 300) throw new Error("DPI must be between 72 and 300.");

  const originalBytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: originalBytes });
  const srcDoc = await loadingTask.promise;
  const out = await PDFDocument.create();

  try {
    for (let pageNum = 1; pageNum <= srcDoc.numPages; pageNum++) {
      const page = await srcDoc.getPage(pageNum);
      const scale = dpi / 72;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D context unavailable.");
      await page.render({ canvasContext: context, viewport, canvas }).promise;

      const jpegBlob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), "image/jpeg", 0.7);
      });
      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
      const image = await out.embedJpg(jpegBytes);

      const outPage = out.addPage([viewport.width, viewport.height]);
      outPage.drawImage(image, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    }
  } finally {
    await loadingTask.destroy();
  }

  const outBytes = await out.save();
  const originalSize = originalBytes.byteLength;
  const newSize = outBytes.byteLength;
  const pct = originalSize > 0 ? Math.round((1 - newSize / originalSize) * 100) : 0;

  return {
    files: [
      {
        name: file.name.replace(/\.pdf$/i, "-compressed.pdf"),
        blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }),
      },
    ],
    summary: `Preview engine: ${pct >= 0 ? "−" : "+"}${Math.abs(pct)}% size, text is not preserved as selectable yet`,
    isPreview: true,
  };
};
