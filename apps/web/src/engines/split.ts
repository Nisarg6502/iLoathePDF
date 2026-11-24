import { PDFDocument } from "pdf-lib";
import { parseRanges } from "@/lib/ranges";
import type { Engine } from "./types";
import { tr } from "@iloathepdf/i18n";

type SplitMode = "ranges" | "everyN" | "extract" | "delete";

async function buildPdf(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

/**
 * An empty page spec means "every page" to parseRanges, which is right for
 * Merge and Watermark but wrong here: splitting, extracting or deleting
 * "nothing" must be an error, not a copy of the whole document.
 */
function requireSpec(raw: unknown, what: string): string {
  const spec = String(raw ?? "").trim();
  if (!spec.split(",").some((s) => s.trim() !== "")) throw new Error(tr("Enter {{what}}.", { what }));
  return spec;
}

export const splitEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error(tr("Add a PDF to split."));

  const mode = options.mode as SplitMode;
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const pageCount = src.getPageCount();
  const baseName = file.name.replace(/\.pdf$/i, "");

  if (mode === "ranges") {
    const specs = requireSpec(options.ranges, "at least one page range, like 1-3,5")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== ""); // "1-3,,5" and a trailing comma are not extra empty files
    const outputs = await Promise.all(
      specs.map(async (spec, i) => {
        const indices = parseRanges(spec, pageCount);
        const pdfBytes = await buildPdf(src, indices);
        return { name: `${baseName}-part${i + 1}.pdf`, blob: new Blob([pdfBytes as BlobPart], { type: "application/pdf" }) };
      }),
    );
    return { files: outputs, summary: tr("{{pages}} → {{files}}", { pages: tr("{{count}} pages", { count: pageCount }), files: tr("{{count}} files", { count: outputs.length }) }), isPreview: false };
  }

  if (mode === "everyN") {
    const n = Number(options.n);
    if (!Number.isInteger(n) || n < 1) throw new Error(tr("Pages per file must be at least 1."));
    const outputs: { name: string; blob: Blob }[] = [];
    for (let start = 0; start < pageCount; start += n) {
      const indices = Array.from(
        { length: Math.min(n, pageCount - start) },
        (_, i) => start + i,
      );
      const pdfBytes = await buildPdf(src, indices);
      outputs.push({ name: `${baseName}-part${outputs.length + 1}.pdf`, blob: new Blob([pdfBytes as BlobPart], { type: "application/pdf" }) });
    }
    return { files: outputs, summary: tr("{{pages}} → {{files}} of up to {{max}}", { pages: tr("{{count}} pages", { count: pageCount }), files: tr("{{count}} files", { count: outputs.length }), max: tr("{{count}} pages", { count: n }) }), isPreview: false };
  }

  if (mode === "extract") {
    const indices = parseRanges(requireSpec(options.ranges, tr("the pages to keep, like 1-3,5")), pageCount);
    const pdfBytes = await buildPdf(src, indices);
    return {
      files: [{ name: `${baseName}-extracted.pdf`, blob: new Blob([pdfBytes as BlobPart], { type: "application/pdf" }) }],
      summary: tr("{{done}} of {{pages}} extracted", { done: indices.length, pages: tr("{{count}} pages", { count: pageCount }) }),
      isPreview: false,
    };
  }

  if (mode === "delete") {
    const toRemove = new Set(parseRanges(requireSpec(options.ranges, tr("the pages to remove, like 2,4")), pageCount));
    const indices = Array.from({ length: pageCount }, (_, i) => i).filter((i) => !toRemove.has(i));
    if (indices.length === 0) throw new Error(tr("That would remove every page. Keep at least one."));
    const pdfBytes = await buildPdf(src, indices);
    return {
      files: [{ name: `${baseName}-deleted.pdf`, blob: new Blob([pdfBytes as BlobPart], { type: "application/pdf" }) }],
      summary: tr("{{removed}} removed, {{count}} remain", { removed: tr("{{count}} pages", { count: toRemove.size }), count: indices.length }),
      isPreview: false,
    };
  }

  throw new Error(`Unknown split mode: ${String(mode)}`);
};
