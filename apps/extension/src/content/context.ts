/**
 * Reads what an <input type="file"> wants from the page around it: its
 * accept/multiple attributes, a size attribute some upload widgets carry, and
 * the size and format words in its label and nearby helper text.
 */
import { parseFormats, parseSizeAttribute, parseSizeLimit, type FormatWord } from "../shared/sizeLimit";

export interface FieldConstraints {
  accept: string;
  multiple: boolean;
  maxBytes?: number;
  minBytes?: number;
  /** Format words found near the field ("JPG only"). */
  formats: FormatWord[];
  /** The words the size limit was read from. */
  evidence?: string;
  source: "attribute" | "text" | "none";
  /** A short name for the field, for the fitter's heading. */
  label?: string;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SELECT", "OPTION", "TEXTAREA", "SVG"]);
/** Our own UI on the page, which must never be read as the page's text. */
export const ROOT_TAG = "ILOATHEPDF-ROOT";
const MAX_TEXT = 1500;
const MAX_LEVELS = 6;

/** The text a person would read inside `el`, whitespace collapsed. */
export function readableText(el: Element): string {
  const parts: string[] = [];
  let length = 0;
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let p = node.parentElement; p && p !== el.parentElement; p = p.parentElement) {
        if (SKIP_TAGS.has(p.tagName.toUpperCase()) || p.tagName.toUpperCase() === ROOT_TAG || p.hidden) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node && length < MAX_TEXT * 2; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    if (text.trim()) {
      parts.push(text);
      length += text.length;
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function fileInputsIn(el: Element): number {
  return el.querySelectorAll('input[type="file" i]').length;
}

/** Texts that describe the field, closest first. */
function describingTexts(input: HTMLInputElement): string[] {
  const doc = input.ownerDocument;
  const texts: string[] = [];
  for (const id of (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)) {
    const el = doc.getElementById(id);
    if (el) texts.push(readableText(el));
  }
  for (const label of Array.from(input.labels ?? [])) texts.push(readableText(label));
  for (const attr of ["aria-label", "title"]) {
    const v = input.getAttribute(attr);
    if (v) texts.push(v);
  }
  // Then ever wider boxes around the field, as long as they don't also hold
  // another upload field (whose limits could be different).
  for (let el = input.parentElement, level = 0; el && level < MAX_LEVELS && el !== doc.documentElement; el = el.parentElement, level++) {
    if (fileInputsIn(el) > 1) break;
    const text = readableText(el);
    if (text.length > MAX_TEXT) break;
    if (text) texts.push(text);
    if (el.tagName === "FORM" || el === doc.body) break;
  }
  return texts.filter(Boolean);
}

function sizeFromAttributes(input: HTMLInputElement): { maxBytes?: number; minBytes?: number } {
  const out: { maxBytes?: number; minBytes?: number } = {};
  for (const { name, value } of Array.from(input.attributes)) {
    const n = name.toLowerCase();
    if (out.maxBytes === undefined && /max[-_]?(file[-_]?)?size|size[-_]?limit|max[-_]?bytes/.test(n)) {
      out.maxBytes = parseSizeAttribute(n, value, "max");
    } else if (out.minBytes === undefined && /min[-_]?(file[-_]?)?size|min[-_]?bytes/.test(n)) {
      out.minBytes = parseSizeAttribute(n, value, "min");
    }
  }
  return out;
}

function labelFor(input: HTMLInputElement): string | undefined {
  const fromLabel = Array.from(input.labels ?? [])
    .map((l) => readableText(l))
    .find(Boolean);
  const raw = fromLabel || input.getAttribute("aria-label") || input.getAttribute("title") || "";
  const clean = raw.replace(/[*:]+\s*$/, "").trim();
  return clean ? (clean.length > 60 ? clean.slice(0, 57) + "…" : clean) : undefined;
}

export function readConstraints(input: HTMLInputElement): FieldConstraints {
  const result: FieldConstraints = {
    accept: input.getAttribute("accept") ?? "",
    multiple: input.multiple,
    formats: [],
    source: "none",
    label: labelFor(input),
  };

  const fromAttrs = sizeFromAttributes(input);
  if (fromAttrs.maxBytes !== undefined || fromAttrs.minBytes !== undefined) {
    Object.assign(result, fromAttrs, { source: "attribute" as const });
  }

  for (const text of describingTexts(input)) {
    if (result.source === "none") {
      const limit = parseSizeLimit(text);
      if (limit.maxBytes !== undefined || limit.minBytes !== undefined) {
        Object.assign(result, limit, { source: "text" as const });
      }
    }
    if (result.formats.length === 0) result.formats = parseFormats(text);
    if (result.source !== "none" && result.formats.length > 0) break;
  }
  return result;
}

/** The file input a right-click on `target` most likely meant, if any. */
export function nearestFileInput(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof Element)) return null;
  if (target instanceof HTMLInputElement && target.type === "file") return target;
  const control = target.closest("label")?.control;
  if (control instanceof HTMLInputElement && control.type === "file") return control;
  for (let el: Element | null = target, level = 0; el && level < 4; el = el.parentElement, level++) {
    const inputs = el.querySelectorAll<HTMLInputElement>('input[type="file" i]');
    if (inputs.length === 1) return inputs[0];
    if (inputs.length > 1) return null;
  }
  return null;
}
