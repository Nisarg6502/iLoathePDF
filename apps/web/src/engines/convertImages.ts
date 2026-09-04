import type { Engine, EngineOutputFile } from "./types";

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

function isHeic(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || /\.heic$|\.heif$/i.test(file.name);
}

async function convertOne(file: File, to: string): Promise<EngineOutputFile> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable.");
  context.drawImage(bitmap, 0, 0);

  const mimeType = MIME_BY_FORMAT[to];
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), mimeType, 0.92);
  });

  const newName = file.name.replace(/\.[^.]+$/, "") + "." + to;
  return { name: newName, blob };
}

export const convertImagesEngine: Engine = async ({ files, options }) => {
  if (files.length === 0) throw new Error("Add at least one image.");

  const to = (options.to as string) ?? "png";
  if (!(to in MIME_BY_FORMAT)) throw new Error(`Unsupported target format: ${to}`);

  const heicFiles = files.filter(isHeic);
  const liveFiles = files.filter((f) => !isHeic(f));

  const converted = await Promise.all(liveFiles.map((f) => convertOne(f, to)));

  if (heicFiles.length > 0) {
    return {
      files: converted,
      summary:
        converted.length > 0
          ? `${converted.length} converted · ${heicFiles.length} HEIC file(s) need the full engine (preview) and were skipped`
          : `HEIC decoding is a preview feature — 0 of ${heicFiles.length} file(s) converted yet`,
      isPreview: true,
    };
  }

  return {
    files: converted,
    summary: `${converted.length} image(s) converted to ${to.toUpperCase()}`,
    isPreview: false,
  };
};
