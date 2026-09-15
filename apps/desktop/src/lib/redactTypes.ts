/**
 * Element model for the Redact tool's canvas. Mirrors `signTypes.ts`'s
 * `BaseSignElement` -- placement is a fraction (0..1) of the page's own
 * box, top-left origin -- but a redaction box has no content variant, only
 * a position.
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
