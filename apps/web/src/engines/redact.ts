import { PDFDocument, PDFDict, PDFName, rgb, type PDFPage } from "pdf-lib";
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

// outDoc is a brand-new PDFDocument, so it never ends up with an AcroForm --
// nothing in this file constructs or carries one over (see
// copyDocumentMetadata below for why). copyPages() still copies each
// untouched page's own /Annots array intact, since annotations belong to
// the page, not the catalog -- so a text-field/checkbox widget on an
// untouched page would otherwise survive as a dangling reference: the
// widget dict itself is copied fine, but the AcroForm dictionary that
// gives it a value, type, and place in the form hierarchy doesn't exist in
// outDoc. Some viewers render that as broken or refuse to interact with
// it. A correct AcroForm carry-over is possible in principle (pdf-lib
// exposes the low-level PDFObjectCopier used internally by copyPages), but
// a field's widget can reference its host page via /P -- and if that
// field's widget lives on a *boxed* page, naively copying the AcroForm's
// /Fields array would pull that original, un-redacted page back into
// outDoc through the /P reference. That's the same class of content-leak
// bug this file exists to prevent (see the big comment below), so rather
// than take on that risk, True Redact deliberately drops Widget
// annotations from copied pages instead. Interactive form fields are not
// preserved by True Redact mode -- this is a deliberate, bounded
// limitation, not an oversight. Visual Cover-up (which mutates the
// original document in place) is unaffected and keeps forms intact.
function stripWidgetAnnotations(page: PDFPage) {
  const annots = page.node.Annots();
  if (!annots) return;
  for (let i = annots.size() - 1; i >= 0; i--) {
    const dict = page.node.context.lookupMaybe(annots.get(i), PDFDict);
    if (dict?.get(PDFName.of("Subtype")) === PDFName.of("Widget")) {
      annots.remove(i);
    }
  }
}

// Because True Redact rebuilds the output as a brand-new PDFDocument (see
// the big comment below), none of the source catalog's Info dictionary
// survives automatically -- title, author, dates, etc. would all silently
// come back as undefined. Carry the standard metadata fields forward
// explicitly; each getter can legitimately return undefined (the source
// simply never set that field), so only call the matching setter when a
// value is actually present.
function copyDocumentMetadata(source: PDFDocument, target: PDFDocument) {
  const title = source.getTitle();
  if (title !== undefined) target.setTitle(title);
  const author = source.getAuthor();
  if (author !== undefined) target.setAuthor(author);
  const subject = source.getSubject();
  if (subject !== undefined) target.setSubject(subject);
  const keywords = source.getKeywords();
  if (keywords !== undefined) target.setKeywords([keywords]);
  const creator = source.getCreator();
  if (creator !== undefined) target.setCreator(creator);
  const producer = source.getProducer();
  if (producer !== undefined) target.setProducer(producer);
  const creationDate = source.getCreationDate();
  if (creationDate !== undefined) target.setCreationDate(creationDate);
  const modificationDate = source.getModificationDate();
  if (modificationDate !== undefined) target.setModificationDate(modificationDate);
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

    const unboxedIndices: number[] = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      if (!byPage.has(pageIndex)) unboxedIndices.push(pageIndex);
    }

    const outDoc = await PDFDocument.create();
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
    const pdfjsDoc = await loadingTask.promise;
    try {
      // Copy every untouched page in a single batched call. pdf-lib builds
      // a fresh internal object copier per `copyPages()` call, and that
      // copier is what dedupes objects shared between the pages copied in
      // that one call (an embedded font subset, a repeated logo/background
      // image, an ICC profile). Calling `copyPages(doc, [pageIndex])` once
      // per page -- the previous approach -- gave each page its own
      // copier, so a resource shared across N untouched pages got copied
      // into outDoc N times instead of once (measured ~9x file bloat on a
      // document sharing one image across pages).
      const copiedPages =
        unboxedIndices.length > 0 ? await outDoc.copyPages(doc, unboxedIndices) : [];
      const copiedPageByIndex = new Map<number, PDFPage>();
      unboxedIndices.forEach((sourceIndex, i) => {
        const copiedPage = copiedPages[i];
        stripWidgetAnnotations(copiedPage);
        copiedPageByIndex.set(sourceIndex, copiedPage);
      });

      // Walk the source page order once, interleaving the pre-copied
      // untouched pages with freshly rasterized boxed pages. `addPage`
      // always appends to the end of outDoc, so processing indices in
      // ascending source order reproduces the exact source page order --
      // this is NOT "all untouched pages first, then all boxed pages".
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const pageBoxes = byPage.get(pageIndex);
        if (!pageBoxes) {
          const copiedPage = copiedPageByIndex.get(pageIndex);
          if (!copiedPage) throw new Error(`Internal error: no copied page for index ${pageIndex}.`);
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
    copyDocumentMetadata(doc, outDoc);
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
