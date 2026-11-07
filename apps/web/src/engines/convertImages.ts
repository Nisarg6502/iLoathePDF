import type { Engine, EngineOutputFile } from "./types";
import { renderRotatedCropped, DEFAULT_IMAGE_EDIT, type ImageEdit, type ImageEdits } from "@/tools/imageEdit";

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

function isHeic(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || /\.heic$|\.heif$/i.test(file.name);
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

/** "a.png" taken twice -> "a.png", "a (2).png", so two inputs never overwrite each other. */
function uniqueName(name: string, taken: Set<string>): string {
  let candidate = name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

async function convertOne(file: File, to: string, edit: ImageEdit, quality: number): Promise<EngineOutputFile> {
  const bitmap = await createImageBitmap(file);
  let canvas = renderRotatedCropped(bitmap, edit);
  bitmap.close();
  if (to === "jpg") canvas = flattenOnWhite(canvas);

  const mimeType = MIME_BY_FORMAT[to];
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), mimeType, quality);
  });

  const newName = file.name.replace(/\.[^.]+$/, "") + "." + to;
  return { name: newName, blob };
}

export const convertImagesEngine: Engine = async ({ files, options }) => {
  if (files.length === 0) throw new Error("Add at least one image.");

  const to = (options.to as string) ?? "png";
  if (!Object.hasOwn(MIME_BY_FORMAT, to)) throw new Error(`Unsupported target format: ${to}`);

  // 40-100, the same scale as desktop. PNG is lossless and ignores it.
  const qualityPct = Number(options.quality ?? 92);
  if (!Number.isFinite(qualityPct) || qualityPct < 1 || qualityPct > 100) {
    throw new Error("Quality must be between 1 and 100.");
  }
  const quality = qualityPct / 100;

  const edits = (options.edits as ImageEdits | undefined) ?? {};
  const entries = files.map((file, index) => ({ file, index }));
  const heicEntries = entries.filter((e) => isHeic(e.file));
  const liveEntries = entries.filter((e) => !isHeic(e.file));

  const convertedRaw = await Promise.all(
    liveEntries.map((e) => convertOne(e.file, to, edits[e.index] ?? DEFAULT_IMAGE_EDIT, quality)),
  );
  const taken = new Set<string>();
  const converted = convertedRaw.map((f) => ({ ...f, name: uniqueName(f.name, taken) }));

  if (heicEntries.length > 0) {
    return {
      files: converted,
      summary:
        converted.length > 0
          ? `${converted.length} converted · ${heicEntries.length} HEIC file(s) need the full engine (preview) and were skipped`
          : `HEIC decoding is a preview feature — 0 of ${heicEntries.length} file(s) converted yet`,
      isPreview: true,
    };
  }

  return {
    files: converted,
    summary: `${converted.length} image(s) converted to ${to.toUpperCase()}`,
    isPreview: false,
  };
};
