import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { layoutDocument, mmToPt } from "@/lib/docLayout";
import { textToBlocks } from "@/lib/docParse";
import { imagesToPdfEngine } from "./imagesToPdf";
import type { Engine } from "./types";

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  bmp: "image/bmp",
  gif: "image/gif",
};
const MAX_ENTRIES = 1000;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function extOf(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function isSupported(name: string): boolean {
  if (name.endsWith("/")) return false;
  const parts = name.split("/");
  if (parts[0] === "__MACOSX" || parts[parts.length - 1].startsWith(".")) return false;
  const ext = extOf(name);
  return ext === "pdf" || ext === "txt" || ext in IMAGE_TYPES;
}

export const zipToPdfEngine: Engine = async ({ files, options, onProgress }) => {
  const file = files[0];
  if (!file) throw new Error("Add a ZIP file.");

  // Nothing is written anywhere by archive path, and the filter keeps unsupported
  // entries from being inflated at all, so a zip bomb has to hide among the entries we use.
  let seen = 0;
  let skipped = 0;
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (info) => {
        if (info.name.endsWith("/")) return false;
        seen += 1;
        if (!isSupported(info.name)) {
          skipped += 1;
          return false;
        }
        total += info.originalSize;
        if (total > MAX_TOTAL_BYTES) throw new Error("That ZIP expands to more than 500 MB.");
        if (seen > MAX_ENTRIES) throw new Error(`That ZIP holds more than ${MAX_ENTRIES} files.`);
        return true;
      },
    });
  } catch (err) {
    if (err instanceof Error && /500 MB|more than/.test(err.message)) throw err;
    throw new Error(`${file.name} isn't a readable ZIP file (it may be damaged or password-protected).`);
  }

  const names = Object.keys(entries).sort((a, b) => collator.compare(a, b));
  if (names.length === 0) throw new Error("No images, PDFs or text files were found in that ZIP.");

  const pageSize = ["fit", "a4", "letter"].includes(String(options.page_size)) ? String(options.page_size) : "fit";
  const orientation = ["auto", "portrait", "landscape"].includes(String(options.orientation)) ? String(options.orientation) : "auto";

  const merged = await PDFDocument.create();
  let converted = 0;
  for (const [index, name] of names.entries()) {
    onProgress?.(index / names.length);
    const bytes = entries[name];
    const ext = extOf(name);
    let part: Uint8Array;
    if (ext === "pdf") {
      part = bytes;
    } else if (ext === "txt") {
      const text = new TextDecoder("utf-8").decode(bytes);
      part = (
        await layoutDocument(textToBlocks(text), {
          pageSize: pageSize === "letter" ? "letter" : "a4",
          landscape: orientation === "landscape",
          marginPt: mmToPt(20),
          fontSize: 11,
        })
      ).bytes;
    } else {
      const image = new File([bytes as BlobPart], name.split("/").pop() ?? name, { type: IMAGE_TYPES[ext] });
      const result = await imagesToPdfEngine({
        files: [image],
        options: { page_size: pageSize, orientation, margin_mm: 0 },
      });
      part = new Uint8Array(await result.files[0].blob.arrayBuffer());
    }

    let source: PDFDocument;
    try {
      source = await PDFDocument.load(part);
    } catch {
      throw new Error(`${name} couldn't be read (it may be damaged or password-protected).`);
    }
    const copied = await merged.copyPages(source, source.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
    converted += 1;
  }

  onProgress?.(1);
  const bytes = await merged.save();
  const pages = merged.getPageCount();
  return {
    files: [
      {
        name: file.name.replace(/\.zip$/i, "") + ".pdf",
        blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        detail: `${pages} page${pages === 1 ? "" : "s"}`,
      },
    ],
    summary: `${converted} file${converted === 1 ? "" : "s"} joined into ${pages} page${pages === 1 ? "" : "s"}${skipped ? ` · ${skipped} unsupported skipped` : ""}`,
    isPreview: false,
  };
};
