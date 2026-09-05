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

export type SignElement = ImageElement | TextElement;

export const TEXT_COLORS = ["#000000", "#1d4ed8", "#b91c1c"] as const;

export function isImageElement(el: SignElement): el is ImageElement {
  return el.kind === "signature" || el.kind === "initials";
}
