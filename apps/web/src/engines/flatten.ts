import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFPage,
} from "pdf-lib";
import type { Engine } from "./types";

const FLAG_HIDDEN = 2;
const FLAG_NO_VIEW = 32;

function numbers(array: PDFArray | undefined, fallback: number[]): number[] {
  if (!array) return fallback;
  const out = array.asArray().map((v) => (v instanceof PDFNumber ? v.asNumber() : NaN));
  return out.length === fallback.length && out.every(Number.isFinite) ? out : fallback;
}

/** Normal appearance stream of an annotation, honouring the /AS state of a dictionary of states. */
function normalAppearance(annot: PDFDict): PDFStream | undefined {
  const ap = annot.lookupMaybe(PDFName.of("AP"), PDFDict);
  const normal = ap?.lookup(PDFName.of("N"));
  if (normal instanceof PDFStream) return normal;
  if (normal instanceof PDFDict) {
    const state = annot.lookupMaybe(PDFName.of("AS"), PDFName);
    const chosen = state ? normal.lookup(state) : undefined;
    if (chosen instanceof PDFStream) return chosen;
  }
  return undefined;
}

/**
 * Draws one annotation's appearance into its page (PDF 32000 section 12.5.5:
 * map the transformed appearance box onto the annotation rectangle). Returns
 * true when the annotation was baked in and should be removed.
 */
function bake(page: PDFPage, annot: PDFDict, index: number): boolean {
  const flags = annot.lookupMaybe(PDFName.of("F"), PDFNumber)?.asNumber() ?? 0;
  if (flags & (FLAG_HIDDEN | FLAG_NO_VIEW)) return true;
  const subtype = annot.lookupMaybe(PDFName.of("Subtype"), PDFName)?.decodeText();
  if (subtype === "Link" || subtype === "Popup") return subtype === "Popup";

  const appearance = normalAppearance(annot);
  if (!appearance) return false;

  const rect = numbers(annot.lookupMaybe(PDFName.of("Rect"), PDFArray), [0, 0, 0, 0]);
  const bbox = numbers(appearance.dict.lookupMaybe(PDFName.of("BBox"), PDFArray), [0, 0, 0, 0]);
  const m = numbers(appearance.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray), [1, 0, 0, 1, 0, 0]);

  const corners = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[0], bbox[3]],
    [bbox[2], bbox[3]],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const tx0 = Math.min(...xs), tx1 = Math.max(...xs), ty0 = Math.min(...ys), ty1 = Math.max(...ys);
  const rx0 = Math.min(rect[0], rect[2]), rx1 = Math.max(rect[0], rect[2]);
  const ry0 = Math.min(rect[1], rect[3]), ry1 = Math.max(rect[1], rect[3]);

  const sx = tx1 - tx0 === 0 ? 1 : (rx1 - rx0) / (tx1 - tx0);
  const sy = ty1 - ty0 === 0 ? 1 : (ry1 - ry0) / (ty1 - ty0);
  const key = `Flat${index}`;
  // Re-register the stream under this page's resources; Do applies the stream's own /Matrix.
  const ref = page.node.context.getObjectRef(appearance) ?? page.node.context.register(appearance);
  page.node.setXObject(PDFName.of(key), ref);
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(sx, 0, 0, sy, rx0 - tx0 * sx, ry0 - ty0 * sy),
    drawObject(key),
    popGraphicsState(),
  );
  return true;
}

export const flattenEngine: Engine = async ({ files }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to flatten.");

  const doc = await PDFDocument.load(await file.arrayBuffer());
  const hasForm = doc.catalog.has(PDFName.of("AcroForm"));
  let flattened = 0;

  if (hasForm) {
    const form = doc.getForm();
    flattened += form.getFields().length;
    form.flatten();
  }

  doc.getPages().forEach((page, pageIndex) => {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) return;
    const keep: PDFRef[] = [];
    annots.asArray().forEach((entry, i) => {
      const dict = page.node.context.lookupMaybe(entry, PDFDict);
      if (!dict) return;
      if (bake(page, dict, pageIndex * 1000 + i)) {
        flattened += 1;
      } else if (entry instanceof PDFRef) {
        keep.push(entry);
      }
    });
    if (keep.length === 0) page.node.delete(PDFName.of("Annots"));
    else page.node.set(PDFName.of("Annots"), doc.context.obj(keep));
  });

  const bytes = await doc.save();
  return {
    files: [
      {
        name: file.name.replace(/\.pdf$/i, "-flattened.pdf"),
        blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
      },
    ],
    summary:
      flattened === 0
        ? "Nothing to flatten — no form fields or annotations"
        : `${flattened} form field${flattened === 1 ? "" : "s"} / annotation${flattened === 1 ? "" : "s"} flattened`,
    isPreview: false,
  };
};
