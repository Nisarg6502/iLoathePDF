/**
 * Turns text, CSV and HTML into the blocks lib/docLayout.ts lays out. The
 * counterpart of the parsing half of sidecar/ops/doc_to_pdf.py.
 */
import type { Block, Run, TextBlock } from "./docLayout";

/** UTF-8 (BOM tolerated), falling back to Windows-1252 for files that are not valid UTF-8. */
export async function readText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// ---------------------------------------------------------------------------
// plain text
// ---------------------------------------------------------------------------

export function textToBlocks(text: string): Block[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line): Block => (line.trim() === "" ? { type: "gap", height: 14 } : { type: "text", runs: [{ text: line }], preserveSpaces: true, gapAfter: 0 }));
}

// ---------------------------------------------------------------------------
// csv
// ---------------------------------------------------------------------------

export function detectDelimiter(sample: string): string {
  const firstLines = sample.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 5);
  let best = ",";
  let bestScore = 0;
  for (const candidate of [",", ";", "\t", "|"]) {
    const counts = firstLines.map((line) => {
      let n = 0;
      let quoted = false;
      for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === candidate && !quoted) n += 1;
      }
      return n;
    });
    // A good delimiter appears the same, non-zero, number of times on every line.
    const consistent = counts.length > 0 && counts[0] > 0 && counts.every((c) => c === counts[0]);
    const score = consistent ? counts[0] * 10 : Math.min(...counts, 0) + (counts[0] ?? 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter = detectDelimiter(text.slice(0, 4096))): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);

  const filled = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const width = Math.max(0, ...filled.map((r) => r.length));
  return filled.map((r) => [...r, ...Array<string>(width - r.length).fill("")]);
}

export function csvToBlocks(rows: string[][]): Block[] {
  return [{ type: "table", header: true, rows: rows.map((r) => r.map((cell): Run[] => [{ text: cell }])) }];
}

// ---------------------------------------------------------------------------
// html
// ---------------------------------------------------------------------------

const SKIP = new Set(["script", "style", "head", "title", "noscript", "template", "svg", "iframe", "object"]);
const HEADING_SCALE: Record<string, number> = { h1: 2, h2: 1.6, h3: 1.3, h4: 1.15, h5: 1.05, h6: 1 };
const BLOCK_TAGS = new Set(["p", "div", "section", "article", "header", "footer", "main", "nav", "aside", "figure", "figcaption", "dl", "dd", "dt", "form", "fieldset", "address"]);

/** Inline content of an element as runs, honouring bold, italic and line breaks. */
function inlineRuns(node: Node, bold: boolean, italic: boolean, out: Run[]): void {
  if (node.nodeType === 3) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ");
    if (text !== "") out.push({ text, bold, italic });
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP.has(tag)) return;
  if (tag === "br") {
    out.push({ text: "\n" });
    return;
  }
  const nextBold = bold || tag === "b" || tag === "strong" || tag === "th";
  const nextItalic = italic || tag === "i" || tag === "em";
  el.childNodes.forEach((child) => inlineRuns(child, nextBold, nextItalic, out));
}

function trimRuns(runs: Run[]): Run[] {
  const out = runs.map((r) => ({ ...r }));
  while (out.length && out[0].text.trim() === "" && out[0].text !== "\n") out.shift();
  if (out.length) out[0].text = out[0].text.replace(/^ +/, "");
  while (out.length && out[out.length - 1].text.trim() === "" && out[out.length - 1].text !== "\n") out.pop();
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/ +$/, "");
  return out.filter((r) => r.text !== "");
}

const hasText = (runs: Run[]) => runs.some((r) => r.text.trim() !== "");

export function htmlToBlocks(source: string): Block[] {
  const doc = new DOMParser().parseFromString(source, "text/html");
  const blocks: Block[] = [];
  let runs: Run[] = [];
  const lists: { ordered: boolean; n: number }[] = [];
  let quote = 0;

  const flush = (extra: Partial<TextBlock> = {}) => {
    const trimmed = trimRuns(runs);
    runs = [];
    if (!hasText(trimmed)) return;
    const indent = (extra.indent ?? 0) + quote * 18;
    blocks.push({ type: "text", runs: trimmed, ...extra, indent, gray: quote > 0 });
  };

  const walk = (node: Node, bold: boolean, italic: boolean): void => {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ");
      if (text.trim() === "" && runs.length === 0) return;
      runs.push({ text, bold, italic });
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) return;

    if (tag in HEADING_SCALE) {
      flush();
      el.childNodes.forEach((c) => walk(c, true, italic));
      flush({ bold: true, gapBefore: 8, gapAfter: 6, scale: HEADING_SCALE[tag] });
    } else if (BLOCK_TAGS.has(tag)) {
      flush();
      el.childNodes.forEach((c) => walk(c, bold, italic));
      flush();
    } else if (tag === "br") {
      runs.push({ text: "\n" });
    } else if (tag === "ul" || tag === "ol") {
      flush();
      lists.push({ ordered: tag === "ol", n: 0 });
      el.childNodes.forEach((c) => walk(c, bold, italic));
      flush();
      lists.pop();
    } else if (tag === "li") {
      flush();
      const list = lists[lists.length - 1];
      if (list) list.n += 1;
      runs.push({ text: list?.ordered ? `${list.n}. ` : "• " });
      el.childNodes.forEach((c) => walk(c, bold, italic));
      flush({ indent: Math.max(lists.length, 1) * 14, gapAfter: 3 });
    } else if (tag === "pre") {
      flush();
      const lines = (el.textContent ?? "").replace(/^\n+|\n+$/g, "").split(/\r?\n/);
      if (lines.some((l) => l.trim() !== "")) blocks.push({ type: "pre", lines });
    } else if (tag === "blockquote") {
      flush();
      quote += 1;
      el.childNodes.forEach((c) => walk(c, bold, italic));
      flush();
      quote -= 1;
    } else if (tag === "hr") {
      flush();
      blocks.push({ type: "rule" });
    } else if (tag === "table") {
      flush();
      const rows: Run[][][] = [];
      let sawHeader = false;
      for (const tr of Array.from(el.querySelectorAll("tr"))) {
        if (tr.closest("table") !== el) continue; // nested tables flatten into their cell
        const cells = Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName));
        if (cells.length === 0) continue;
        if (rows.length === 0 && cells.every((c) => c.tagName.toLowerCase() === "th")) sawHeader = true;
        rows.push(
          cells.map((cell) => {
            const cellRuns: Run[] = [];
            inlineRuns(cell, false, false, cellRuns);
            return trimRuns(cellRuns);
          }),
        );
      }
      if (rows.length) {
        const width = Math.max(...rows.map((r) => r.length));
        blocks.push({ type: "table", header: sawHeader, rows: rows.map((r) => [...r, ...Array.from({ length: width - r.length }, (): Run[] => [])]) });
      }
    } else {
      const nextBold = bold || tag === "b" || tag === "strong";
      const nextItalic = italic || tag === "i" || tag === "em";
      el.childNodes.forEach((c) => walk(c, nextBold, nextItalic));
    }
  };

  walk(doc.body, false, false);
  flush();
  return blocks;
}
