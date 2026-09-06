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

async function convertOne(file: File, to: string, edit: ImageEdit): Promise<EngineOutputFile> {
  const bitmap = await createImageBitmap(file);
  const canvas = renderRotatedCropped(bitmap, edit);
  bitmap.close();

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
  if (!Object.hasOwn(MIME_BY_FORMAT, to)) throw new Error(`Unsupported target format: ${to}`);

  const edits = (options.edits as ImageEdits | undefined) ?? {};
  const entries = files.map((file, index) => ({ file, index }));
  const heicEntries = entries.filter((e) => isHeic(e.file));
  const liveEntries = entries.filter((e) => !isHeic(e.file));

  const converted = await Promise.all(
    liveEntries.map((e) => convertOne(e.file, to, edits[e.index] ?? DEFAULT_IMAGE_EDIT)),
  );

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
