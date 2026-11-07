import type { Engine, EngineOutputFile } from "./types";
import { renderRotatedCropped, DEFAULT_IMAGE_EDIT, type ImageEdit, type ImageEdits } from "@/tools/imageEdit";
import { formatBytes, percentSmaller } from "@/lib/formatBytes";

export type CompressFormat = "keep" | "jpg" | "webp";
type OutFormat = "png" | "jpg" | "webp";

export interface CompressImageSettings {
  /** 1-100. Ignored for PNG output (lossless). */
  quality: number;
  /** Long-edge cap in px; null = keep original dimensions. */
  maxDimension: number | null;
  format: CompressFormat;
}

const MIME: Record<OutFormat, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const SUPPORTED = /\.(png|jpe?g|webp)$/i;

function isSupportedImage(file: File): boolean {
  return /^image\/(png|jpeg|webp)$/.test(file.type) || SUPPORTED.test(file.name);
}

function inputFormat(file: File): OutFormat {
  if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) return "jpg";
  if (file.type === "image/webp" || /\.webp$/i.test(file.name)) return "webp";
  return "png";
}

export function readSettings(options: Record<string, unknown>): CompressImageSettings {
  const quality = Number(options.quality ?? 75);
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new Error("Quality must be between 1 and 100.");
  }
  const rawMax = options.maxDimension;
  let maxDimension: number | null = null;
  if (rawMax !== undefined && rawMax !== null && rawMax !== "" && Number(rawMax) !== 0) {
    const n = Number(rawMax);
    if (!Number.isFinite(n) || n < 16) {
      throw new Error("Max dimension must be at least 16 px (or left empty to keep the original size).");
    }
    maxDimension = Math.round(n);
  }
  const format = (options.format as CompressFormat | undefined) ?? "keep";
  if (!["keep", "jpg", "webp"].includes(format)) throw new Error(`Unsupported output format: ${format}`);
  return { quality, maxDimension, format };
}

/** JPEG has no alpha: an unfilled canvas exports transparent pixels as black. */
function flattenOnWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return flat;
}

function resizeTo(canvas: HTMLCanvasElement, maxDimension: number | null): HTMLCanvasElement {
  if (!maxDimension) return canvas;
  const longEdge = Math.max(canvas.width, canvas.height);
  if (longEdge <= maxDimension) return canvas;
  const scale = maxDimension / longEdge;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

export interface CompressedImage {
  blob: Blob;
  format: OutFormat;
  /** True when re-encoding did not help and the original bytes were kept. */
  keptOriginal: boolean;
}

function isNoopEdit(edit: ImageEdit): boolean {
  return edit.rotate === 0 && edit.crop === null;
}

/** Shrinks one image. Never returns something larger than the input when nothing else changed. */
export async function compressImage(
  file: File,
  settings: CompressImageSettings,
  edit: ImageEdit = DEFAULT_IMAGE_EDIT,
): Promise<CompressedImage> {
  if (!isSupportedImage(file)) {
    throw new Error(`"${file.name}" is not a supported image. Use PNG, JPG or WebP.`);
  }
  const srcFormat = inputFormat(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`"${file.name}" could not be read as an image — it may be corrupt or not really a ${srcFormat.toUpperCase()}.`);
  }
  const format: OutFormat = settings.format === "keep" ? srcFormat : settings.format;

  let canvas: HTMLCanvasElement;
  try {
    canvas = renderRotatedCropped(bitmap, edit);
  } finally {
    bitmap.close();
  }
  const originalLong = Math.max(canvas.width, canvas.height);
  canvas = resizeTo(canvas, settings.maxDimension);
  const resized = Math.max(canvas.width, canvas.height) !== originalLong;
  if (format === "jpg") canvas = flattenOnWhite(canvas);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))),
      MIME[format],
      settings.quality / 100,
    );
  });

  const untouched = !resized && format === srcFormat && isNoopEdit(edit);
  if (untouched && blob.size >= file.size) {
    return { blob: file, format, keptOriginal: true };
  }
  return { blob, format, keptOriginal: false };
}

export interface SizeEstimate {
  /** Estimated total output bytes across all files (extrapolated from the sample). */
  estimatedBytes: number;
  originalBytes: number;
  sampledName: string;
}

/**
 * Encodes the first file at the given settings and scales its ratio to the
 * whole batch. Only an estimate: every image compresses differently.
 */
export async function estimateCompressedSize(
  files: File[],
  settings: CompressImageSettings,
  edits: ImageEdits = {},
): Promise<SizeEstimate> {
  if (files.length === 0) throw new Error("Add at least one image.");
  const sample = files[0];
  const result = await compressImage(sample, settings, edits[0] ?? DEFAULT_IMAGE_EDIT);
  const originalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const ratio = sample.size > 0 ? result.blob.size / sample.size : 1;
  return { estimatedBytes: Math.round(originalBytes * ratio), originalBytes, sampledName: sample.name };
}

function outputName(file: File, format: OutFormat, taken: Set<string>): string {
  const dot = file.name.lastIndexOf(".");
  const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
  let candidate = `${stem}-compressed.${format}`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}-compressed (${n}).${format}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

export const compressImagesEngine: Engine = async ({ files, options, onProgress }) => {
  if (files.length === 0) throw new Error("Add at least one image.");
  const settings = readSettings(options);
  const edits = (options.edits as ImageEdits | undefined) ?? {};

  const taken = new Set<string>();
  const out: EngineOutputFile[] = [];
  let before = 0;
  let after = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = await compressImage(file, settings, edits[i] ?? DEFAULT_IMAGE_EDIT);
    before += file.size;
    after += result.blob.size;
    const filePct = percentSmaller(file.size, result.blob.size);
    out.push({
      name: outputName(file, result.format, taken),
      blob: result.blob,
      detail: `${formatBytes(file.size)} → ${formatBytes(result.blob.size)}${filePct > 0 ? ` · ${filePct}% smaller` : result.keptOriginal ? " · already optimal, kept as is" : ""}`,
    });
    onProgress?.((i + 1) / files.length);
  }

  const noun = `${out.length} image${out.length === 1 ? "" : "s"}`;
  const pct = percentSmaller(before, after);
  const summary =
    pct > 0
      ? `${formatBytes(before)} → ${formatBytes(after)} · ${pct}% smaller (${noun})`
      : `${formatBytes(before)} → ${formatBytes(after)} · no savings at these settings (${noun})`;
  return { files: out, summary, isPreview: false };
};
