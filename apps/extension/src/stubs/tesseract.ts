/**
 * Build-time stand-in for tesseract.js (see the alias in vite.config.ts).
 * The extension doesn't do OCR; this keeps the OCR library and its default
 * CDN URLs out of the bundle.
 */
export function createWorker(): never {
  throw new Error("OCR is not available in the browser extension.");
}
