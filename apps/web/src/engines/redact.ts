import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { Engine } from "./types";
import type { RedactBox } from "@/tools/redact/types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const REDACT_DPI = 200;

// Small tolerance for floating point rounding coming out of the UI layer,
// mirroring the desktop sidecar's `_pct` (0 <= value <= 1.0001).
const PCT_TOLERANCE = 1.0001;

const ROTATED_OR_CROPPED_MESSAGE =
  "This page is rotated/cropped — True Redact isn't supported for it yet. Try Visual Cover-up, or rotate the PDF to its default orientation first.";

function boxRectPt(box: RedactBox, widthPt: number, heightPt: number) {
  const x = box.xPct * widthPt;
  const boxTop = heightPt - box.yPct * heightPt;
  const h = box.hPct * heightPt;
  const y = boxTop - h;
  const w = box.wPct * widthPt;
  return { x, y, w, h };
}

function assertValidPct(box: RedactBox, field: "xPct" | "yPct" | "wPct" | "hPct") {
  const value = box[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Box field '${field}' must be a number, got ${JSON.stringify(value)}`);
  }
  if (value < 0 || value > PCT_TOLERANCE) {
    throw new Error(`Box field '${field}' must be between 0 and 1, got ${value}`);
  }
}

function validateMode(raw: unknown): "visual" | "true" {
  if (raw === undefined) return "visual";
  if (raw === "visual" || raw === "true") return raw;
  throw new Error(`'mode' must be one of ["visual", "true"], got ${JSON.stringify(raw)}`);
}

// Detects the case the reviewer flagged: the box-drawing UI previews pages
// via pdf.js, which honors /Rotate and CropBox, but the bake logic below
// doesn't reconcile against either — so a rotated or cropped page would get
// its box placed wrong and/or its raster stretched into the wrong aspect
// ratio. Rather than attempting a full rotation/crop-aware coordinate
// rewrite, True Redact refuses to touch such a page.
function assertNoRotationOrCropMismatch(page: PDFPage) {
  const rotation = page.getRotation().angle;
  if (((rotation % 360) + 360) % 360 !== 0) {
    throw new Error(ROTATED_OR_CROPPED_MESSAGE);
  }
  const mediaBox = page.getMediaBox();
  const cropBox = page.getCropBox();
  const EPS = 0.01;
  if (
    Math.abs(cropBox.x - mediaBox.x) > EPS ||
    Math.abs(cropBox.y - mediaBox.y) > EPS ||
    Math.abs(cropBox.width - mediaBox.width) > EPS ||
    Math.abs(cropBox.height - mediaBox.height) > EPS
  ) {
    throw new Error(ROTATED_OR_CROPPED_MESSAGE);
  }
}

export const redactEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to redact.");

  const boxes = (options.boxes as RedactBox[] | undefined) ?? [];
  if (boxes.length === 0) throw new Error("Add at least one box before exporting.");
  const mode = validateMode(options.mode);

  for (const box of boxes) {
    assertValidPct(box, "xPct");
    assertValidPct(box, "yPct");
    assertValidPct(box, "wPct");
    assertValidPct(box, "hPct");
  }

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

  let outBytes: Uint8Array;

  if (mode === "visual") {
    // Visual cover-up draws directly on top of the original page's own
    // content -- nothing is removed, so mutating `doc` in place is fine and
    // keeps every untouched page byte-for-byte identical.
    for (const [pageIndex, pageBoxes] of byPage) {
      const page = doc.getPage(pageIndex);
      const { width, height } = page.getSize();
      for (const box of pageBoxes) {
        const { x, y, w, h } = boxRectPt(box, width, height);
        page.drawRectangle({ x, y, width: w, height: h, color: rgb(0, 0, 0) });
      }
    }
    outBytes = await doc.save();
  } else {
    // True redact must guarantee that a boxed page's original content never
    // reaches the saved output. pdf-lib has no object garbage collection --
    // `removePage` only unlinks a page from the page tree, the orphaned
    // PDFPageLeaf (and its un-redacted content stream) stays resident in the
    // PDFContext and still gets written out by `doc.save()`. So instead of
    // mutating `doc`, build a brand-new output document: boxed pages get a
    // fresh page with only the redacted raster drawn on it (nothing from the
    // source page is ever added to the output document), and untouched
    // pages are deep-copied forward via `copyPages`, which only pulls in
    // objects reachable from that specific page.
    for (const pageIndex of byPage.keys()) {
      assertNoRotationOrCropMismatch(doc.getPage(pageIndex));
    }

    const outDoc = await PDFDocument.create();
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
    const pdfjsDoc = await loadingTask.promise;
    try {
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const pageBoxes = byPage.get(pageIndex);
        if (!pageBoxes) {
          const [copiedPage] = await outDoc.copyPages(doc, [pageIndex]);
          outDoc.addPage(copiedPage);
          continue;
        }

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

        const { width: widthPt, height: heightPt } = doc.getPage(pageIndex).getSize();
        const png = await outDoc.embedPng(pngBytes);

        const newPage = outDoc.addPage([widthPt, heightPt]);
        newPage.drawImage(png, { x: 0, y: 0, width: widthPt, height: heightPt });
      }
    } finally {
      await loadingTask.destroy();
    }
    outBytes = await outDoc.save();
  }

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

export { boxRectPt };
