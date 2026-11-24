/**
 * "Fit to target": turns the user's files into what an upload field wants, at
 * a size inside its limit. All encoding is done by the website's engines
 * (apps/web/src/engines); this file only decides which settings to try.
 *
 * Runs in an extension page (the fitter or the popup), never in a web page.
 */
import { compressImage, type CompressImageSettings } from "@/engines/compressImages";
import { convertImagesEngine } from "@/engines/convertImages";
import { imagesToPdfEngine } from "@/engines/imagesToPdf";
import { compressEngine, estimateCompressedPdfSize } from "@/engines/compress";
import { pdfToImagesEngine } from "@/engines/pdfToImages";
import { formatOf, type OutputFormat, type Plan } from "./accept";

export interface Target {
  maxBytes?: number;
  minBytes?: number;
}

export interface Fitted {
  file: File;
  /** True when the file is inside the target. */
  met: boolean;
  /** Why not, when it isn't. */
  miss?: "too-big" | "too-small";
  /** True when the user's own file already fit and was passed through untouched. */
  untouched?: boolean;
  /** What it took: JPEG/WebP quality, long edge in px, PDF render DPI. */
  quality?: number;
  longEdge?: number;
  dpi?: number;
}

export type FitErrorCode = "password" | "unreadable" | "no-pages";

export class FitError extends Error {
  constructor(
    readonly code: FitErrorCode,
    readonly fileName: string,
  ) {
    super(`${code}: ${fileName}`);
    this.name = "FitError";
  }
}

export type PageSize = "a4" | "letter" | "fit";

export interface FitOptions {
  /** Page size for a PDF made from images. */
  pageSize?: PageSize;
  /** Called before each encode, so the UI can show it's still working. */
  onStep?: () => void;
}

const MIME: Record<OutputFormat, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
const EXT: Record<OutputFormat, string> = { jpeg: "jpg", png: "png", webp: "webp", pdf: "pdf" };

/** Highest quality we try first, the lowest we accept before shrinking pixels, and the last resort. */
const Q_TOP = 92;
const Q_FLOOR = 60;
const Q_LAST = 35;
const MIN_EDGE = 64;
const MAX_UPSCALE_EDGE = 4000;

export function fitsTarget(size: number, target: Target): boolean {
  return (target.maxBytes === undefined || size <= target.maxBytes) && (target.minBytes === undefined || size >= target.minBytes);
}

/** How far outside the target a size is (0 inside it). */
function miss(size: number, target: Target): number {
  if (target.maxBytes !== undefined && size > target.maxBytes) return size - target.maxBytes;
  if (target.minBytes !== undefined && size < target.minBytes) return target.minBytes - size;
  return 0;
}

export function outputName(original: string, format: OutputFormat): string {
  const dot = original.lastIndexOf(".");
  const stem = (dot > 0 ? original.slice(0, dot) : original) || "file";
  return `${stem}.${EXT[format]}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function asFile(blob: Blob, name: string, type: string): File {
  return blob instanceof File && blob.name === name && blob.type === type ? blob : new File([blob], name, { type });
}

async function longEdgeOf(file: Blob): Promise<number> {
  const bitmap = await createImageBitmap(file);
  try {
    return Math.max(bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** A lossless copy of `file` with its long edge at `edge` px. Only used to grow an image that is below a minimum size. */
async function upscaled(file: Blob, edge: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = edge / Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), "image/png"),
  );
  return new File([blob], "upscaled.png", { type: "image/png" });
}

async function toPng(file: File): Promise<File> {
  const result = await convertImagesEngine({ files: [file], options: { to: "png" } });
  const out = result.files[0];
  if (!out) throw new FitError("unreadable", file.name);
  return new File([out.blob], outputName(file.name, "png"), { type: "image/png" });
}

interface Attempt {
  blob: Blob;
  size: number;
  quality: number;
  edge: number;
}

/**
 * Re-encodes one image as `format` so its size lands inside `target`.
 * Lossy formats: the highest quality that fits at full size; if even quality
 * 60 is too big, fewer pixels at the highest quality that fits. PNG: fewer
 * pixels only. An image below a minimum is re-encoded at top quality and, if
 * that's not enough, enlarged. If nothing fits, the closest attempt comes back
 * with met: false.
 */
export async function fitImage(file: File, format: Exclude<OutputFormat, "pdf">, target: Target, options: FitOptions = {}): Promise<Fitted> {
  const name = outputName(file.name, format);
  if (formatOf(file) === format && fitsTarget(file.size, target)) {
    return { file: asFile(file, file.name, MIME[format]), met: true, untouched: true };
  }

  // compressImage reads PNG, JPEG and WebP; anything else the browser can
  // decode (GIF, BMP, AVIF) goes through a lossless PNG first.
  let source: File = formatOf(file) ? file : await toPng(file);
  if (format === "png" && formatOf(source) !== "png") source = await toPng(source);

  let full: number;
  try {
    full = await longEdgeOf(source);
  } catch {
    throw new FitError("unreadable", file.name);
  }
  const max = target.maxBytes ?? Number.POSITIVE_INFINITY;
  const min = target.minBytes ?? 0;
  const lossless = format === "png";
  const attempts: Attempt[] = [];
  const bigger = new Map<number, File>();

  const tryAt = async (quality: number, edge: number): Promise<Attempt> => {
    options.onStep?.();
    let input = source;
    let maxDimension: number | null = edge < full ? edge : null;
    if (edge > full) {
      let up = bigger.get(edge);
      if (!up) bigger.set(edge, (up = await upscaled(source, edge)));
      input = up;
      maxDimension = null;
    }
    const settings: CompressImageSettings = { quality, maxDimension, format: lossless ? "keep" : format === "jpeg" ? "jpg" : "webp" };
    let blob: Blob;
    try {
      blob = (await compressImage(input, settings)).blob;
    } catch {
      throw new FitError("unreadable", file.name);
    }
    const attempt = { blob, size: blob.size, quality: lossless ? 100 : quality, edge };
    attempts.push(attempt);
    return attempt;
  };

  const finish = (): Fitted => {
    const inside = attempts.filter((a) => fitsTarget(a.size, target));
    // Inside the target, the biggest file is the best-looking one.
    const pick = inside.length > 0
      ? inside.reduce((a, b) => (b.size > a.size ? b : a))
      : attempts.reduce((a, b) => (miss(b.size, target) < miss(a.size, target) ? b : a));
    const met = inside.length > 0;
    return {
      file: new File([pick.blob], name, { type: MIME[format] }),
      met,
      miss: met ? undefined : pick.size > max ? "too-big" : "too-small",
      quality: lossless ? undefined : pick.quality,
      longEdge: pick.edge,
    };
  };

  /** Highest quality in (lo, hi) that fits at `edge`; `lo` is known to fit. */
  const searchQuality = async (edge: number, lo: number, hi: number) => {
    while (hi - lo > 4) {
      const mid = Math.round((lo + hi) / 2);
      if ((await tryAt(mid, edge)).size <= max) lo = mid;
      else hi = mid;
    }
  };

  const grow = async (from: Attempt) => {
    let last = from;
    if (!lossless && last.quality < 100) last = await tryAt(100, full);
    let edge = full;
    while (last.size < min && edge < MAX_UPSCALE_EDGE) {
      edge = Math.min(MAX_UPSCALE_EDGE, Math.ceil(edge * clamp(Math.sqrt(min / Math.max(1, last.size)) * 1.1, 1.2, 3)));
      last = await tryAt(lossless ? 100 : Q_TOP, edge);
      if (last.size > max && !lossless) await searchQuality(edge, Q_FLOOR, Q_TOP);
    }
  };

  const first = await tryAt(lossless ? 100 : Q_TOP, full);
  if (first.size <= max) {
    if (first.size < min) await grow(first);
    return finish();
  }

  if (!lossless) {
    const floor = await tryAt(Q_FLOOR, full);
    if (floor.size <= max) {
      await searchQuality(full, Q_FLOOR, Q_TOP);
      return finish();
    }
    // Too big even at quality 60: fewer pixels. Bytes scale roughly with the
    // pixel count, so aim straight for the edge that should fit.
    let ref = floor;
    let edge = full;
    for (let i = 0; i < 10; i++) {
      edge = Math.floor(edge * clamp(Math.sqrt(max / ref.size) * 0.95, 0.3, 0.9));
      if (edge < MIN_EDGE) break;
      const at = await tryAt(Q_FLOOR, edge);
      if (at.size <= max) {
        await searchQuality(edge, Q_FLOOR, Q_TOP + 1);
        return finish();
      }
      ref = at;
    }
    await tryAt(Q_LAST, MIN_EDGE);
    return finish();
  }

  // PNG: search the long edge.
  let tooBig = full;
  let fits = 0;
  let edge = Math.floor(full * clamp(Math.sqrt(max / first.size) * 0.95, 0.1, 0.95));
  for (let i = 0; i < 10 && edge >= MIN_EDGE; i++) {
    const at = await tryAt(100, edge);
    if (at.size <= max) fits = edge;
    else tooBig = edge;
    if (fits && tooBig - fits <= Math.max(8, full * 0.02)) break;
    edge = fits ? Math.floor((fits + tooBig) / 2) : Math.floor(edge * clamp(Math.sqrt(max / at.size) * 0.95, 0.3, 0.9));
  }
  if (!fits) await tryAt(100, MIN_EDGE);
  return finish();
}

/** One PDF from all the images, under `target` if it can be done by shrinking the images. */
export async function fitImagesToPdf(files: File[], target: Target, options: FitOptions = {}): Promise<Fitted> {
  const name = outputName(files[0]?.name ?? "images", "pdf");
  const stem = name.replace(/\.pdf$/, "");
  const make = async (images: File[]): Promise<Blob> => {
    options.onStep?.();
    const result = await imagesToPdfEngine({ files: images, options: { page_size: options.pageSize ?? "a4", outputName: stem } });
    return result.files[0].blob;
  };
  const done = (blob: Blob, met: boolean): Fitted => ({
    file: new File([blob], name, { type: "application/pdf" }),
    met,
    miss: met ? undefined : blob.size > (target.maxBytes ?? Infinity) ? "too-big" : "too-small",
  });

  let best: Blob;
  try {
    best = await make(files);
  } catch {
    throw new FitError("unreadable", files.map((f) => f.name).join(", "));
  }
  if (fitsTarget(best.size, target) || target.maxBytes === undefined) return done(best, fitsTarget(best.size, target));

  // Give every image an equal share of the budget (less a little for the
  // PDF's own structure) and shrink each one into it as a JPEG.
  const max = target.maxBytes;
  let budget = Math.max(2000, (max - 1500 - 600 * files.length) / files.length);
  for (let i = 0; i < 4; i++) {
    const images: File[] = [];
    for (const f of files) images.push((await fitImage(f, "jpeg", { maxBytes: Math.floor(budget) }, options)).file);
    const pdf = await make(images);
    if (miss(pdf.size, target) < miss(best.size, target)) best = pdf;
    if (fitsTarget(pdf.size, target)) break;
    budget = Math.max(1000, budget * (max / pdf.size) * 0.95);
  }
  return done(best, fitsTarget(best.size, target));
}

function pdfError(e: unknown, file: File): FitError {
  if (e instanceof FitError) return e;
  const name = (e as { name?: string } | null)?.name;
  return new FitError(name === "PasswordException" ? "password" : "unreadable", file.name);
}

/**
 * Makes a PDF smaller by re-rendering its pages as JPEG images (the
 * website's Compress engine) at the highest DPI that fits. Text in the result
 * is no longer selectable; a PDF that already fits is passed through.
 */
export async function fitPdf(file: File, target: Target, options: FitOptions = {}): Promise<Fitted> {
  if (fitsTarget(file.size, target)) return { file, met: true, untouched: true };
  // A PDF can't be made bigger in any useful way.
  if (target.maxBytes === undefined || file.size <= target.maxBytes) return { file, met: false, miss: "too-small", untouched: true };
  const max = target.maxBytes;

  let dpi: number;
  try {
    options.onStep?.();
    const estimate = await estimateCompressedPdfSize(file, 150);
    dpi = Math.round(clamp(150 * Math.sqrt(max / Math.max(1, estimate.estimatedBytes)) * 0.97, 72, 150));
  } catch (e) {
    throw pdfError(e, file);
  }

  let best: { blob: Blob; dpi?: number } = { blob: file };
  for (let i = 0; i < 6; i++) {
    options.onStep?.();
    let blob: Blob;
    try {
      blob = (await compressEngine({ files: [file], options: { dpi } })).files[0].blob;
    } catch (e) {
      throw pdfError(e, file);
    }
    if (blob.size < best.blob.size) best = { blob, dpi };
    if (blob.size <= max || dpi === 72) break;
    dpi = Math.max(72, Math.floor(dpi * Math.min(0.9, Math.sqrt(max / blob.size) * 0.97)));
  }
  const met = best.blob.size <= max;
  return {
    file: new File([best.blob], file.name, { type: "application/pdf" }),
    met,
    miss: met ? undefined : "too-big",
    dpi: best.dpi,
  };
}

/** Renders a PDF's pages (or just the first) and fits each as an image. */
export async function fitPdfToImages(
  file: File,
  format: Exclude<OutputFormat, "pdf">,
  target: Target,
  firstPageOnly: boolean,
  options: FitOptions = {},
): Promise<Fitted[]> {
  let pages: { name: string; blob: Blob }[];
  try {
    options.onStep?.();
    pages = (await pdfToImagesEngine({ files: [file], options: { dpi: 150, format: "png" } })).files;
  } catch (e) {
    throw pdfError(e, file);
  }
  if (pages.length === 0) throw new FitError("no-pages", file.name);
  const picked = firstPageOnly ? pages.slice(0, 1) : pages;
  const out: Fitted[] = [];
  for (const page of picked) {
    const pageName = firstPageOnly ? outputName(file.name, "png") : page.name;
    out.push(await fitImage(new File([page.blob], pageName, { type: "image/png" }), format, target, options));
  }
  return out;
}

/** Runs a plan from planOutput() over the user's files. */
export async function fitToPlan(files: File[], plan: Exclude<Plan, { kind: "error" }>, target: Target, options: FitOptions = {}): Promise<Fitted[]> {
  switch (plan.kind) {
    case "images": {
      const out: Fitted[] = [];
      for (const f of files) out.push(await fitImage(f, plan.format as Exclude<OutputFormat, "pdf">, target, options));
      return out;
    }
    case "images-to-pdf":
      return [await fitImagesToPdf(files, target, options)];
    case "pdf": {
      const out: Fitted[] = [];
      for (const f of files) out.push(await fitPdf(f, target, options));
      return out;
    }
    case "pdf-to-images":
      return fitPdfToImages(files[0], plan.format as Exclude<OutputFormat, "pdf">, target, plan.firstPageOnly, options);
  }
}
