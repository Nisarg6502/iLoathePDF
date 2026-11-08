import { layoutDocument, mmToPt, type Block } from "@/lib/docLayout";
import { csvToBlocks, htmlToBlocks, parseCsv, readText, textToBlocks } from "@/lib/docParse";
import type { Engine, EngineOutputFile } from "./types";

const PAGE_SIZES = ["a4", "letter"] as const;
type Kind = "txt" | "csv" | "html";

export function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

function number(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const n = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return n;
}

function makeEngine(kind: Kind): Engine {
  return async ({ files, options, onProgress }) => {
    if (files.length === 0) throw new Error("Add a file to convert.");
    const pageSize = PAGE_SIZES.includes(options.page_size as "a4") ? (options.page_size as "a4" | "letter") : "a4";
    const orientation = String(options.orientation ?? (kind === "csv" ? "auto" : "portrait"));
    const margin = number(options.margin_mm, kind === "csv" ? 15 : 20, 0, 60, "The margin");
    const fontSize = number(options.font_size, 11, 6, 36, "The text size");
    const mono = kind === "txt" && options.font === "mono";

    const used = new Set<string>();
    const out: EngineOutputFile[] = [];
    let replaced = 0;
    let pages = 0;

    for (const [index, file] of files.entries()) {
      onProgress?.(index / files.length);
      const text = await readText(file);
      let blocks: Block[];
      let landscape = orientation === "landscape";
      let size = fontSize;
      if (kind === "txt") {
        blocks = textToBlocks(text);
      } else if (kind === "html") {
        blocks = htmlToBlocks(text);
      } else {
        if (text.trim() === "") throw new Error(`${file.name} is empty.`);
        const rows = parseCsv(text);
        if (rows.length === 0) throw new Error(`${file.name} has no rows.`);
        blocks = csvToBlocks(rows);
        const columns = rows[0]?.length ?? 0;
        landscape = orientation === "landscape" || (orientation === "auto" && columns > 6);
        // Same scale as the desktop engine: more columns, smaller type.
        size = columns > 12 ? 7.2 : columns > 6 ? 8.8 : 10;
      }

      const stem = file.name.replace(/\.[^.]+$/, "") || "document";
      const result = await layoutDocument(blocks, {
        pageSize,
        landscape,
        marginPt: mmToPt(margin),
        fontSize: size,
        mono,
        title: stem,
      });
      replaced += result.replaced;
      pages += result.pages;
      out.push({
        name: uniqueName(`${stem}.pdf`, used),
        blob: new Blob([result.bytes as BlobPart], { type: "application/pdf" }),
        detail: `${result.pages} page${result.pages === 1 ? "" : "s"}`,
      });
    }

    onProgress?.(1);
    const note = replaced > 0 ? ` · ${replaced} character${replaced === 1 ? "" : "s"} the PDF fonts can't draw became "?"` : "";
    return {
      files: out,
      summary: `${out.length} PDF${out.length === 1 ? "" : "s"}, ${pages} page${pages === 1 ? "" : "s"}${note}`,
      isPreview: false,
    };
  };
}

export const txtToPdfEngine = makeEngine("txt");
export const csvToPdfEngine = makeEngine("csv");
export const htmlToPdfEngine = makeEngine("html");
