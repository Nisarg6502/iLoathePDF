import { PDFDocument } from "pdf-lib";
import { parseRanges } from "@/lib/ranges";
import type { Engine } from "./types";

type SplitMode = "ranges" | "everyN" | "extract" | "delete";

async function buildPdf(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

export const splitEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to split.");

  const mode = options.mode as SplitMode;
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const pageCount = src.getPageCount();
  const baseName = file.name.replace(/\.pdf$/i, "");

  if (mode === "ranges") {
    const specs = String(options.ranges ?? "").split(",").map((s) => s.trim());
    const outputs = await Promise.all(
      specs.map(async (spec, i) => {
        const indices = parseRanges(spec, pageCount);
        const pdfBytes = await buildPdf(src, indices);
        return { name: `${baseName}-part${i + 1}.pdf`, blob: new Blob([pdfBytes as BlobPart], { type: "application/pdf" }) };
      }),
    );
    return { files: outputs, summary: `${pageCount} pages → ${outputs.length} files`, isPreview: false };
  }

  if (mode === "everyN") {
    const n = Number(options.n);
    if (!Number.isInteger(n) || n < 1) throw new Error("Pages per file must be at least 1.");
    const outputs: { name: string; blob: Blob }[] = [];
    for (let start = 0; start < pageCount; start += n) {
      const indices = Array.from(
        { length: Math.min(n, pageCount - start) },
        (_, i) => start + i,
      );
      const pdfBytes = await buildPdf(src, indices);
      outputs.push({ name: `${baseName}-part${outputs.length + 1}.pdf`, blob: new Blob([pdfBytes as BlobPart], { type: "application/pdf" }) });
    }
    return { files: outputs, summary: `${pageCount} pages → ${outputs.length} files of up to ${n} pages`, isPreview: false };
  }

  if (mode === "extract") {
    const indices = parseRanges(String(options.ranges ?? ""), pageCount);
    const pdfBytes = await buildPdf(src, indices);
    return {
      files: [{ name: `${baseName}-extracted.pdf`, blob: new Blob([pdfBytes as BlobPart], { type: "application/pdf" }) }],
      summary: `${indices.length} of ${pageCount} pages extracted`,
      isPreview: false,
    };
  }

  if (mode === "delete") {
    const toRemove = new Set(parseRanges(String(options.ranges ?? ""), pageCount));
    const indices = Array.from({ length: pageCount }, (_, i) => i).filter((i) => !toRemove.has(i));
    const pdfBytes = await buildPdf(src, indices);
    return {
      files: [{ name: `${baseName}-deleted.pdf`, blob: new Blob([pdfBytes as BlobPart], { type: "application/pdf" }) }],
      summary: `${toRemove.size} pages removed, ${indices.length} remain`,
      isPreview: false,
    };
  }

  throw new Error(`Unknown split mode: ${String(mode)}`);
};
