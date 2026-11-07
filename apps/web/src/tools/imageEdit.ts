export interface Rect {
  x: number; // 0..1, relative to the rotated bounding box
  y: number;
  w: number;
  h: number;
}

export interface ImageEdit {
  rotate: 0 | 90 | 180 | 270;
  crop: Rect | null;
}

export type ImageEdits = Record<number, ImageEdit>;

export const DEFAULT_IMAGE_EDIT: ImageEdit = { rotate: 0, crop: null };

const FULL_FRAME_EPSILON = 0.001;

export function isFullFrameCrop(crop: Rect): boolean {
  return (
    crop.x <= FULL_FRAME_EPSILON &&
    crop.y <= FULL_FRAME_EPSILON &&
    crop.w >= 1 - FULL_FRAME_EPSILON &&
    crop.h >= 1 - FULL_FRAME_EPSILON
  );
}

export function isNoopEdit(edit: ImageEdit | undefined): boolean {
  return !edit || (edit.rotate === 0 && (edit.crop === null || isFullFrameCrop(edit.crop)));
}

type DrawableImage = CanvasImageSource & { width: number; height: number };

/**
 * Rotates `image` by `edit.rotate` (in 90-degree steps), then crops the
 * result to `edit.crop` (normalized against the ROTATED bounding box).
 * Shared by the live editor preview and both image engines so the preview
 * is exactly what gets produced.
 */
export function renderRotatedCropped(image: DrawableImage, edit: ImageEdit): HTMLCanvasElement {
  const sourceW = image.width;
  const sourceH = image.height;
  const swapped = edit.rotate === 90 || edit.rotate === 270;
  const rotatedW = swapped ? sourceH : sourceW;
  const rotatedH = swapped ? sourceW : sourceH;

  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = rotatedW;
  rotatedCanvas.height = rotatedH;
  const rctx = rotatedCanvas.getContext("2d");
  if (!rctx) throw new Error("Canvas 2D context unavailable.");
  rctx.translate(rotatedW / 2, rotatedH / 2);
  rctx.rotate((edit.rotate * Math.PI) / 180);
  rctx.drawImage(image, -sourceW / 2, -sourceH / 2, sourceW, sourceH);

  if (!edit.crop) return rotatedCanvas;

  const sx = edit.crop.x * rotatedW;
  const sy = edit.crop.y * rotatedH;
  const sw = Math.max(1, Math.round(edit.crop.w * rotatedW));
  const sh = Math.max(1, Math.round(edit.crop.h * rotatedH));

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  const cctx = cropCanvas.getContext("2d");
  if (!cctx) throw new Error("Canvas 2D context unavailable.");
  cctx.drawImage(rotatedCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return cropCanvas;
}

/**
 * Edits are keyed by a file's position in the list, so moving or removing a
 * file has to move its edit with it or the rotation lands on the wrong image.
 */
export function reorderEdits(edits: ImageEdits, count: number, from: number, to: number): ImageEdits {
  const order = Array.from({ length: count }, (_, i) => i);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  const next: ImageEdits = {};
  order.forEach((oldIndex, newIndex) => {
    if (edits[oldIndex]) next[newIndex] = edits[oldIndex];
  });
  return next;
}

export function removeEdit(edits: ImageEdits, index: number): ImageEdits {
  const next: ImageEdits = {};
  for (const [key, edit] of Object.entries(edits)) {
    const i = Number(key);
    if (i < index) next[i] = edit;
    else if (i > index) next[i - 1] = edit;
  }
  return next;
}
