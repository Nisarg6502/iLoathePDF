/**
 * What an upload field will take, from its `accept` attribute and the format
 * words near it, and what we should turn the user's files into for it.
 */
import type { FormatWord } from "./sizeLimit";

/** The formats the extension can produce. */
export type OutputFormat = "jpeg" | "png" | "webp" | "pdf";

export const IMAGE_OUTPUTS: readonly OutputFormat[] = ["jpeg", "png", "webp"];
/** Preference when several image formats are allowed: JPEG shrinks best and every site takes it. */
const PREFERENCE: readonly OutputFormat[] = ["jpeg", "png", "webp", "pdf"];

export interface AcceptInfo {
  /** No accept attribute, or one that allows anything. */
  any: boolean;
  /** Output formats the attribute allows (all image ones for image/*). */
  formats: Set<OutputFormat>;
  /** Tokens we can't produce (".docx", "image/gif"), kept for display. */
  others: string[];
}

const TOKEN_FORMAT: Record<string, OutputFormat> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".jpe": "jpeg",
  ".jfif": "jpeg",
  "image/png": "png",
  ".png": "png",
  "image/webp": "webp",
  ".webp": "webp",
  "application/pdf": "pdf",
  "application/x-pdf": "pdf",
  ".pdf": "pdf",
};

export function parseAccept(accept: string | null | undefined): AcceptInfo {
  const tokens = (accept ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const formats = new Set<OutputFormat>();
  const others: string[] = [];
  let any = tokens.length === 0;
  for (const token of tokens) {
    if (token === "*" || token === "*/*") any = true;
    else if (token === "image/*") IMAGE_OUTPUTS.forEach((f) => formats.add(f));
    else if (TOKEN_FORMAT[token]) formats.add(TOKEN_FORMAT[token]);
    else others.push(token);
  }
  // accept=".docx" alone allows nothing we make; that's a real constraint,
  // not "anything goes".
  return { any, formats, others };
}

/**
 * The formats to offer for this field, best first. `textFormats` are format
 * words found near the field ("JPG/JPEG only"); they narrow a broad accept
 * (image/*, or none) but never widen a strict one.
 */
export function allowedOutputs(accept: AcceptInfo, textFormats: readonly FormatWord[] = []): OutputFormat[] {
  const fromText = new Set(textFormats.filter((f): f is OutputFormat => (PREFERENCE as readonly string[]).includes(f)));
  let allowed: Set<OutputFormat>;
  if (accept.any) {
    allowed = fromText.size > 0 ? fromText : new Set(PREFERENCE);
  } else {
    allowed = accept.formats;
    const narrowed = new Set([...allowed].filter((f) => fromText.has(f)));
    if (narrowed.size > 0) allowed = narrowed;
  }
  return PREFERENCE.filter((f) => allowed.has(f));
}

export type InputKind = "image" | "pdf" | "other";

export function inputKind(file: { name: string; type: string }): InputKind {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type.startsWith("image/") || /\.(jpe?g|jfif|png|webp|gif|bmp|avif)$/i.test(file.name)) {
    // Browsers can't decode these, so neither can we.
    if (/^image\/(heic|heif|svg\+xml|tiff)$/.test(file.type) || /\.(heic|heif|svg|tiff?)$/i.test(file.name)) return "other";
    return "image";
  }
  return "other";
}

export function formatOf(file: { name: string; type: string }): OutputFormat | null {
  if (inputKind(file) === "pdf") return "pdf";
  if (file.type === "image/jpeg" || /\.(jpe?g|jfif)$/i.test(file.name)) return "jpeg";
  if (file.type === "image/png" || /\.png$/i.test(file.name)) return "png";
  if (file.type === "image/webp" || /\.webp$/i.test(file.name)) return "webp";
  return null;
}

export type Plan =
  /** Each image becomes one image file in `format`. */
  | { kind: "images"; format: OutputFormat; options: OutputFormat[] }
  /** All images become one PDF. */
  | { kind: "images-to-pdf"; format: "pdf"; options: OutputFormat[] }
  /** Each PDF is made smaller. */
  | { kind: "pdf"; format: "pdf"; options: OutputFormat[] }
  /** A PDF's pages become images (only the first page when the field takes one file). */
  | { kind: "pdf-to-images"; format: OutputFormat; options: OutputFormat[]; firstPageOnly: boolean }
  | { kind: "error"; reason: PlanError };

export type PlanError =
  | "nothing-allowed" // the field accepts only formats we can't make
  | "unsupported-input" // e.g. a .docx, HEIC or SVG
  | "mixed-input" // images and PDFs together
  | "one-file-only" // several files for a single-file field that doesn't take PDF
  | "several-pdfs"; // several PDFs for a single-file field

/**
 * Decides what to make from the user's files for a field that allows
 * `allowed` (from allowedOutputs) and may or may not take several files.
 * `choice` is the format the user picked, if they changed it; `sizeLimited`
 * says whether there is a size to fit.
 */
export function planOutput(
  files: readonly { name: string; type: string }[],
  allowed: readonly OutputFormat[],
  multiple: boolean,
  { choice, sizeLimited = false }: { choice?: OutputFormat; sizeLimited?: boolean } = {},
): Plan {
  if (allowed.length === 0) return { kind: "error", reason: "nothing-allowed" };
  const kinds = files.map(inputKind);
  if (kinds.includes("other")) return { kind: "error", reason: "unsupported-input" };
  const images = kinds.filter((k) => k === "image").length;
  const pdfs = kinds.length - images;
  if (images > 0 && pdfs > 0) return { kind: "error", reason: "mixed-input" };

  const imageFormats = allowed.filter((f) => f !== "pdf");
  const pdfAllowed = allowed.includes("pdf");

  if (pdfs > 0) {
    if (pdfs > 1 && !multiple) return { kind: "error", reason: "several-pdfs" };
    const options = [...(pdfAllowed ? (["pdf"] as const) : []), ...imageFormats];
    const picked = choice && options.includes(choice) ? choice : options[0];
    if (picked === "pdf") return { kind: "pdf", format: "pdf", options };
    return { kind: "pdf-to-images", format: picked, options, firstPageOnly: !multiple };
  }

  // Images. Several images for a one-file field only work as one PDF.
  const tooMany = images > 1 && !multiple;
  const options: OutputFormat[] = tooMany ? (pdfAllowed ? ["pdf"] : []) : [...imageFormats, ...(pdfAllowed ? (["pdf"] as const) : [])];
  if (options.length === 0) return { kind: "error", reason: "one-file-only" };

  let picked = choice && options.includes(choice) ? choice : undefined;
  if (!picked) {
    // Keep a single image's own format when the field takes it, except a PNG
    // that has to shrink: PNG is lossless, so only making it smaller in pixels
    // would help, and a JPEG at the same size looks far better.
    const own = files.length === 1 ? formatOf(files[0]) : null;
    const keepOwn = own && own !== "pdf" && options.includes(own) && !(own === "png" && sizeLimited && options.includes("jpeg"));
    picked = keepOwn && own ? own : options[0];
  }
  if (picked === "pdf") return { kind: "images-to-pdf", format: "pdf", options };
  return { kind: "images", format: picked, options };
}
