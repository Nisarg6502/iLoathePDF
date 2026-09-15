import { PDFDocument, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { Engine } from "./types";
import type { RedactBox } from "@/tools/redact/types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const REDACT_DPI = 200;

function boxRectPt(box: RedactBox, widthPt: number, heightPt: number) {
  const x = box.xPct * widthPt;
  const boxTop = heightPt - box.yPct * heightPt;
  const h = box.hPct * heightPt;
  const y = boxTop - h;
  const w = box.wPct * widthPt;
  return { x, y, w, h };
}

export const redactEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to redact.");

  const boxes = (options.boxes as RedactBox[] | undefined) ?? [];
  if (boxes.length === 0) throw new Error("Add at least one box before exporting.");
  const mode = (options.mode as string) === "true" ? "true" : "visual";

  const byPage = new Map<number, RedactBox[]>();
  for (const box of boxes) {
    const list = byPage.get(box.pageIndex);
    if (list) list.push(box);
    else byPage.set(box.pageIndex, [box]);
  }

  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const pageCount = doc.getPageCount();
  for (const pageIndex of byPage.keys()) {
    if (pageIndex < 0 || pageIndex >= pageCount) {
      throw new Error(`Box targets page ${pageIndex + 1}, but the PDF only has ${pageCount} pages.`);
    }
  }

  if (mode === "visual") {
    for (const [pageIndex, pageBoxes] of byPage) {
      const page = doc.getPage(pageIndex);
      const { width, height } = page.getSize();
      for (const box of pageBoxes) {
        const { x, y, w, h } = boxRectPt(box, width, height);
        page.drawRectangle({ x, y, width: w, height: h, color: rgb(0, 0, 0) });
      }
    }
  } else {
    // True redact: render each affected page from the ORIGINAL bytes (so
    // pdf.js's 1-based page numbers line up with the pageIndex keys above),
    // burn the boxes into that raster, then replace the page in `doc`.
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
    const pdfjsDoc = await loadingTask.promise;
    try {
      for (const [pageIndex, pageBoxes] of byPage) {
        const jsPage = await pdfjsDoc.getPage(pageIndex + 1);
        const viewport = jsPage.getViewport({ scale: REDACT_DPI / 72 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable.");
        await jsPage.render({ canvasContext: ctx, viewport, canvas }).promise;

        ctx.fillStyle = "#000000";
        for (const box of pageBoxes) {
          ctx.fillRect(
            box.xPct * canvas.width,
            box.yPct * canvas.height,
            box.wPct * canvas.width,
            box.hPct * canvas.height,
          );
        }

        const pngBlob: Blob = await new Promise((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), "image/png");
        });
        const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

        const originalPage = doc.getPage(pageIndex);
        const { width: widthPt, height: heightPt } = originalPage.getSize();
        const png = await doc.embedPng(pngBytes);

        doc.removePage(pageIndex);
        const newPage = doc.insertPage(pageIndex, [widthPt, heightPt]);
        newPage.drawImage(png, { x: 0, y: 0, width: widthPt, height: heightPt });
      }
    } finally {
      await loadingTask.destroy();
    }
  }

  const outBytes = await doc.save();
  const pageWord = byPage.size === 1 ? "page" : "pages";
  return {
    files: [
      {
        name: file.name.replace(/\.pdf$/i, "-redacted.pdf"),
        blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }),
      },
    ],
    summary: `${boxes.length} box${boxes.length === 1 ? "" : "es"} redacted across ${byPage.size} ${pageWord} (${mode === "true" ? "true redact" : "visual cover-up"}).`,
    isPreview: false,
  };
};
