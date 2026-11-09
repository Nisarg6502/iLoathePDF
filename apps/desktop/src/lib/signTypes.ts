/**
 * Element model for the Sign & Fill tool's canvas. Mirrors
 * apps/web/src/tools/sign/types.ts -- placement is a fraction (0..1) of the
 * page's own box, top-left origin, so the same numbers work against the
 * CSS-pixel preview and the sidecar's PDF-point export.
 */

export interface BaseSignElement {
  id: string;
  pageIndex: number; // 0-based
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export interface ImageSignElement extends BaseSignElement {
  kind: "signature" | "initials";
  /** PNG data URL. */
  imageDataUrl: string;
}

export interface TextSignElement extends BaseSignElement {
  kind: "text" | "date";
  text: string;
  fontSize: number; // absolute PDF points
  color: string; // hex
}

export interface ShapeSignElement extends BaseSignElement {
  /** A translucent marker over existing content, or an outlined rectangle. */
  kind: "highlight" | "box";
  color: string; // hex
}

export type SignElement = ImageSignElement | TextSignElement | ShapeSignElement;

export const SIGN_TEXT_COLORS = ["#000000", "#1d4ed8", "#b91c1c"] as const;
export const SIGN_HIGHLIGHT_COLORS = ["#ffe14d", "#7cf29a", "#ff8fcf"] as const;
export const SIGN_BOX_COLORS = ["#b91c1c", "#1d4ed8", "#000000"] as const;

export function isShapeSignElement(el: SignElement): el is ShapeSignElement {
  return el.kind === "highlight" || el.kind === "box";
}

export function isImageSignElement(el: SignElement): el is ImageSignElement {
  return el.kind === "signature" || el.kind === "initials";
}
