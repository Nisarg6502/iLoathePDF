import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PDFDocument } from "pdf-lib";
import type { Engine } from "./types";
import { DomCanvasFactory } from "./ocr";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const JPEG_QUALITY = 0.7;
/** Rough per-page container cost (page object, image XObject dict, content stream). */
const PAGE_OVERHEAD_BYTES = 300;

type PdfPage = Awaited<ReturnType<pdfjsLib.PDFDocumentProxy["getPage"]>>;

async function renderPageJpeg(page: PdfPage, dpi: number): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const viewport = page.getViewport({ scale: dpi / 72 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable.");
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  const jpegBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), "image/jpeg", JPEG_QUALITY);
  });
  return { bytes: new Uint8Array(await jpegBlob.arrayBuffer()), width: viewport.width, height: viewport.height };
}

export interface PdfSizeEstimate {
  estimatedBytes: number;
  originalBytes: number;
  pageCount: number;
  sampledPages: number;
}

/**
 * Estimates the compressed size at `dpi` by really rasterizing and JPEG-encoding
 * up to `maxSamplePages` evenly spaced pages, then scaling the average to the
 * whole document. Only an estimate: page content varies.
 */
export async function estimateCompressedPdfSize(file: File, dpi: number, maxSamplePages = 3): Promise<PdfSizeEstimate> {
  if (dpi < 72 || dpi > 300) throw new Error("DPI must be between 72 and 300.");
  const data = await file.arrayBuffer();
  const originalBytes = data.byteLength; // pdf.js detaches the buffer it is given
  const loadingTask = pdfjsLib.getDocument({ data, CanvasFactory: DomCanvasFactory });
  const doc = await loadingTask.promise;
  try {
    const pageCount = doc.numPages;
    const n = Math.min(maxSamplePages, pageCount);
    const picks = Array.from({ length: n }, (_, i) => (n === 1 ? 1 : 1 + Math.round((i * (pageCount - 1)) / (n - 1))));
    let total = 0;
    for (const pageNum of picks) {
      const jpeg = await renderPageJpeg(await doc.getPage(pageNum), dpi);
      total += jpeg.bytes.byteLength + PAGE_OVERHEAD_BYTES;
    }
    return {
      estimatedBytes: Math.round((total / n) * pageCount),
      originalBytes,
      pageCount,
      sampledPages: n,
    };
  } finally {
    await loadingTask.destroy();
  }
}

export const compressEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to compress.");

  const dpi = Number(options.dpi ?? 96);
  if (dpi < 72 || dpi > 300) throw new Error("DPI must be between 72 and 300.");

  const originalBytes = await file.arrayBuffer();
  // Same DomCanvasFactory workaround ocr.ts already established: pdf.js
  // picks its own Node-specific canvas factory whenever it detects a real
  // Node process, which is true under Vitest even though jsdom provides a
  // perfectly good `document`. That factory's canvases fail jsdom's own
  // drawImage() type checks for a page with an embedded raster image (e.g.
  // a page built by the Images to PDF tool). Passing this factory opts
  // back into the DOM path pdf.js already takes by default in a real
  // browser, so it's a no-op there -- this only matters under jsdom.
  const loadingTask = pdfjsLib.getDocument({ data: originalBytes, CanvasFactory: DomCanvasFactory });
  const srcDoc = await loadingTask.promise;
  const out = await PDFDocument.create();

  try {
    for (let pageNum = 1; pageNum <= srcDoc.numPages; pageNum++) {
      const page = await srcDoc.getPage(pageNum);
      const jpeg = await renderPageJpeg(page, dpi);
      const image = await out.embedJpg(jpeg.bytes);

      const outPage = out.addPage([jpeg.width, jpeg.height]);
      outPage.drawImage(image, { x: 0, y: 0, width: jpeg.width, height: jpeg.height });
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
