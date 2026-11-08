/**
 * Shared element model for the Sign & Fill tool. Placement is stored as
 * percentages of the page box (top-left origin, 0..1) so the same numbers
 * work against the CSS-pixel preview canvas and the PDF-point export --
 * each side just multiplies by its own page width/height.
 */

export interface BaseElement {
  id: string;
  pageIndex: number; // 0-based
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export interface ImageElement extends BaseElement {
  kind: "signature" | "initials";
  /** PNG data URL, ideally trimmed to the ink's own bounding box. */
  imageDataUrl: string;
}

export interface TextElement extends BaseElement {
  kind: "text" | "date";
  text: string;
  /** Absolute PDF points -- text size does not scale with page size. */
  fontSize: number;
  color: string; // hex, e.g. "#000000"
}

export interface ShapeElement extends BaseElement {
  /** A translucent marker over existing content, or an outlined rectangle. */
  kind: "highlight" | "box";
  color: string; // hex
}

export type SignElement = ImageElement | TextElement | ShapeElement;

export const TEXT_COLORS = ["#000000", "#1d4ed8", "#b91c1c"] as const;
export const HIGHLIGHT_COLORS = ["#ffe14d", "#7cf29a", "#ff8fcf"] as const;
export const BOX_COLORS = ["#b91c1c", "#1d4ed8", "#000000"] as const;

export function isShapeElement(el: SignElement): el is ShapeElement {
  return el.kind === "highlight" || el.kind === "box";
}

export function isImageElement(el: SignElement): el is ImageElement {
  return el.kind === "signature" || el.kind === "initials";
}
