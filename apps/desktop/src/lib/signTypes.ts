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

export type SignElement = ImageSignElement | TextSignElement;

export const SIGN_TEXT_COLORS = ["#000000", "#1d4ed8", "#b91c1c"] as const;

export function isImageSignElement(el: SignElement): el is ImageSignElement {
  return el.kind === "signature" || el.kind === "initials";
}
