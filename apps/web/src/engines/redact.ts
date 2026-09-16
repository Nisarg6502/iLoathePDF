import { PDFDocument, rgb, type PDFName, type PDFPage } from "pdf-lib";
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

// True Redact strips every dictionary entry it doesn't explicitly know is
// safe from EVERY source page -- not just boxed pages -- before
// copyPages() ever runs. This is a deliberate, bounded product decision,
// not an oversight, and it's the only implementation of this feature we
// can be confident is actually safe. Here's why:
//
// copyPages() (pdf-lib's PDFObjectCopier) doesn't just copy a page's own
// content -- it recursively follows every object reference reachable from
// that page's dictionary, through ANY key, not just the obvious ones. An
// UNTOUCHED page's dictionary can reference a BOXED page through more
// spots than just /Annots: a Link annotation's /Dest or a widget's /P
// (round 3's fix), but ALSO /AA (page open/close actions, whose action
// dict can carry a /D destination into another page), /B (article thread
// beads, which carry /P back-references to their page), /PresSteps
// (presentation navigation steps), /SeparationInfo (page group separation
// info, which can reference the pages it applies to), or any other
// spec-legal or non-standard key nobody has thought of yet. When the
// object copier walks an untouched page's dictionary and hits a reference
// into a boxed page through ANY of these, it copies that boxed page's
// ENTIRE original content -- including whatever was supposed to be
// redacted -- into outDoc as a reachable object, which then gets
// serialized by outDoc.save(). The boxed page itself is never added to
// outDoc's page tree, but its original content leaks out anyway, reachable
// through another page's dictionary. pdf-lib has no object garbage
// collection, so nothing later prunes it back out -- the exact same fact
// that made the original removePage/insertPage content leak possible (see
// the big comment below), just reached through a different path.
//
// A denylist (deleting /Annots, or /Annots plus a handful of other named
// keys) can never fully close this: every round so far has found another
// spec-legal key carrying a reference to another page, and there's no way
// to be sure the list is exhaustive without re-implementing the object
// copier's own reachability analysis. So instead this is an ALLOWLIST:
// delete every entry that ISN'T one of a small set of keys known to be
// both necessary for a page to render/behave correctly and incapable of
// referencing another page. Nothing in copyPages()'s input has anything
// left on it except that safe set, so no future or overlooked key can
// reopen this bug class. This means True Redact drops all annotations
// (and page actions, article beads, etc.) from the output, including on
// pages that were never boxed: no links, no form fields, no comments,
// anywhere in the document. Visual Cover-up (which mutates the original
// document in place) is unaffected and keeps everything intact.
//
// The allowlist:
//   - Type, Parent: page-tree bookkeeping. `Parent` looks dangerous (it
//     points at the Pages tree node, whose /Kids reaches every sibling
//     page, boxed ones included) but pdf-lib's own copyPDFPage() needs it
//     present on the SOURCE page to resolve inherited attributes
//     (Resources/MediaBox/CropBox/Rotate that live on an ancestor Pages
//     node rather than directly on the page) -- it reads that chain with
//     plain local dict lookups (Dict.get), never through the object
//     copier's copy(), and deletes /Parent from its own clone before the
//     copier ever walks the clone's entries. So the /Kids array itself is
//     never reachable through this path; dropping /Parent here would only
//     break inheritance for real documents that rely on it. (The value an
//     inherited attribute resolves to IS still passed through copy() --
//     see the Resources/Contents caveat below; a legitimate Pages node
//     never puts a page reference there, so this is theoretical, not a
//     live gap in practice.)
//   - Contents, Resources: the page's actual drawable content and the
//     fonts/images/graphics state it draws with. These can legitimately
//     contain indirect references (embedded fonts, images, nested forms),
//     so in principle a hand-crafted PDF could smuggle a boxed-page
//     reference in here. No allowlist can rule that out without
//     reimplementing the object copier's own reachability analysis --
//     this is a known, accepted residual limitation, not something this
//     list closes.
//   - MediaBox, CropBox, BleedBox, TrimBox, ArtBox: page geometry.
//   - Rotate, UserUnit, LastModified, StructParents, Tabs: orientation,
//     unit scale, a timestamp, a plain integer index into the structure
//     tree, and click-order -- plain values, not references.
//   - Group: transparency-group info. This IS commonly an indirect
//     reference (and its own /CS entry can be indirect too), but a
//     transparency group dictionary can never legally resolve to a page
//     object, so it cannot itself become a path to another page's
//     content -- unlike Contents/Resources, which routinely point at
//     the kind of embedded objects a page's own content stream needs.
const SAFE_PAGE_KEYS = new Set([
  "Type",
  "Parent",
  "Contents",
  "Resources",
  "MediaBox",
  "CropBox",
  "BleedBox",
  "TrimBox",
  "ArtBox",
  "Rotate",
  "Group",
  "UserUnit",
  "LastModified",
  "StructParents",
  "Tabs",
]);

function stripUnsafePageEntries(page: PDFPage) {
  // PDFDict#entries() (pdf-lib/cjs/core/objects/PDFDict.js) returns
  // `Array.from(this.dict.keys()/.entries())` -- a snapshot array, not a
  // live view over the underlying Map -- so deleting while iterating this
  // array is safe. Collect first anyway to keep that independent of
  // pdf-lib's internals.
  const keysToDelete: PDFName[] = [];
  for (const [key] of page.node.entries()) {
    // PDFName#asString() (pdf-lib/cjs/core/objects/PDFName.js) returns the
    // encoded name WITH its leading slash (e.g. "/Annots"), hence the
    // slice(1) to compare against the bare names in SAFE_PAGE_KEYS.
    if (!SAFE_PAGE_KEYS.has(key.asString().slice(1))) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    page.node.delete(key);
  }
}

// Because True Redact rebuilds the output as a brand-new PDFDocument (see
// the big comment below), none of the source catalog's Info dictionary
// survives automatically -- title, author, dates, etc. would all silently
// come back as undefined. Carry the standard metadata fields forward
// explicitly; each getter can legitimately return undefined (the source
// simply never set that field), so only call the matching setter when a
// value is actually present.
//
// pdf-lib's getters don't just return undefined for a missing field --
// they can also THROW on a field that's present but malformed, e.g. a
// non-string /Title (type-assertion error) or a /CreationDate string that
// isn't in strict `D:...` PDF date format (date-parse error). That's a
// purely cosmetic field failing to abort an entire redaction job -- one
// that's already paid for all the expensive rasterization work above --
// so the whole copy is wrapped in one try/catch: if ANY field can't be
// read or written, metadata copying is abandoned for the rest of the
// fields too and the job proceeds without it, rather than throwing and
// losing the redacted output entirely.
function copyDocumentMetadata(source: PDFDocument, target: PDFDocument) {
  try {
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
  } catch {
    // Malformed-but-valid metadata field (see comment above) -- skip
    // metadata entirely for this document rather than fail the job.
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

    const unboxedIndices: number[] = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      if (!byPage.has(pageIndex)) unboxedIndices.push(pageIndex);
    }

    const outDoc = await PDFDocument.create();
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
    const pdfjsDoc = await loadingTask.promise;
    try {
      // Strip every unsafe dictionary entry from every untouched SOURCE
      // page before copyPages() runs at all -- see the big comment on
      // stripUnsafePageEntries above for why this has to happen pre-copy
      // (doing it after, on the copied pages, is too late: the object
      // copier has already pulled in whatever those entries referenced).
      // Mutating `doc` here is safe because `doc` is never saved in this
      // branch -- only read from (via copyPages and, for boxed pages,
      // pdf.js rendering below).
      for (const sourceIndex of unboxedIndices) {
        stripUnsafePageEntries(doc.getPage(sourceIndex));
      }

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
        copiedPageByIndex.set(sourceIndex, copiedPages[i]);
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
