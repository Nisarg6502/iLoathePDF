import { PDFDocument } from "pdf-lib";
import { parseRanges } from "@/lib/ranges";
import type { Engine } from "./types";

export const mergeEngine: Engine = async ({ files, options }) => {
  if (files.length === 0) {
    throw new Error("Add at least one PDF to merge.");
  }

  const ranges = (options.ranges as Record<string, string> | undefined) ?? {};
  const out = await PDFDocument.create();
  let totalPages = 0;

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const src = await PDFDocument.load(bytes);
    const spec = ranges[file.name] ?? "";
    const indices = parseRanges(spec, src.getPageCount());
    const pages = await out.copyPages(src, indices);
    pages.forEach((p) => out.addPage(p));
    totalPages += pages.length;
  }

  const bytes = await out.save();
  return {
    files: [{ name: "merged.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }) }],
    summary: `${files.length} files → 1 file, ${totalPages} pages`,
    isPreview: false,
  };
};
