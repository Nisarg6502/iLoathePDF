import "@testing-library/jest-dom/vitest";

// pdfjs-dist's message handler uses the ES2024 Promise.try, which the Node
// version running this test suite does not implement natively.
if (typeof (Promise as unknown as { try?: unknown }).try !== "function") {
  (Promise as unknown as { try: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown> }).try =
    (fn, ...args) => new Promise((resolve) => resolve(fn(...args)));
}

// pdfjs-dist also relies on the Uint8Array.prototype.toHex proposal method
// (used when computing document fingerprints), which this Node version does
// not implement natively either.
if (typeof (Uint8Array.prototype as unknown as { toHex?: unknown }).toHex !== "function") {
  (Uint8Array.prototype as unknown as { toHex: () => string }).toHex = function (this: Uint8Array) {
    return Array.from(this, (b) => b.toString(16).padStart(2, "0")).join("");
  };
}

// ...and the Map Upsert proposal's getOrInsert/getOrInsertComputed, used
// throughout pdfjs-dist's internal caches.
if (typeof (Map.prototype as unknown as { getOrInsert?: unknown }).getOrInsert !== "function") {
  (Map.prototype as unknown as { getOrInsert: (key: unknown, value: unknown) => unknown }).getOrInsert = function (
    this: Map<unknown, unknown>,
    key,
    value,
  ) {
    if (!this.has(key)) this.set(key, value);
    return this.get(key);
  };
}
if (typeof (Map.prototype as unknown as { getOrInsertComputed?: unknown }).getOrInsertComputed !== "function") {
  (
    Map.prototype as unknown as { getOrInsertComputed: (key: unknown, fn: (key: unknown) => unknown) => unknown }
  ).getOrInsertComputed = function (this: Map<unknown, unknown>, key, fn) {
    if (!this.has(key)) this.set(key, fn(key));
    return this.get(key);
  };
}

// @ts-expect-error - pdfjs-dist ships no type declarations for this deep import path
import * as pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs";

// pdfjs-dist's fake-worker fallback (used when jsdom lacks a real Worker
// implementation) dynamically imports GlobalWorkerOptions.workerSrc — a
// Vite dev-server asset URL from the `?url` import in pdfToImages.ts. Under
// Vitest on Windows that URL does not resolve via Node's dynamic import.
// Registering the worker module on globalThis short-circuits that dynamic
// import: pdfjs-dist checks globalThis.pdfjsWorker first and uses it
// directly when present. Test-only; production bundles never load this file.
(globalThis as unknown as { pdfjsWorker: typeof pdfjsWorker }).pdfjsWorker = pdfjsWorker;

// jsdom does not implement URL.createObjectURL/revokeObjectURL; ResultCard uses
// createObjectURL to build download links, so stub it for tests.
if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = () => "blob:mock-url";
}
if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = () => {};
}

// jsdom's Blob/File implementation does not implement arrayBuffer() (used
// by engines to read uploaded files and by tests to read engine output).
// Polyfill it via FileReader, which jsdom does implement fully.
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
