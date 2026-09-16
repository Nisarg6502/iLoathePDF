/**
 * Element model for the Redact tool's canvas. Placement is a fraction
 * (0..1) of the page's own box, top-left origin -- the same convention
 * Sign & Fill's `SignElement` and Watermark's positions already use.
 */

export interface RedactBox {
  id: string;
  pageIndex: number; // 0-based
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export type RedactMode = "visual" | "true";
