import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { ocrEngine, productionOcrWorkerOptions, localTesseractAssetPath } from "./ocr";
import { makeTestPdf } from "./testHelpers";

async function makeImageOnlyPdf(width = 300, height = 100): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "black";
  ctx.font = "48px sans-serif";
  ctx.fillText("HELLO", 20, 60);
  const dataUrl = canvas.toDataURL("image/png");
  const pngBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));

  const doc = await PDFDocument.create();
  const png = await doc.embedPng(pngBytes);
  const page = doc.addPage([width, height]);
  page.drawImage(png, { x: 0, y: 0, width, height });
  return doc.save();
}

describe("ocrEngine", () => {
  it("rejects a PDF that already has selectable text", async () => {
    const bytes = await makeTestPdf(1); // makeTestPdf uses drawText -> real text
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });

    await expect(ocrEngine({ files: [file], options: {} })).rejects.toThrow(/already has selectable text/i);
  });

  it("adds selectable text that pdf.js can extract back out", async () => {
    const bytes = await makeImageOnlyPdf();
    const file = new File([bytes as BlobPart], "scan.pdf", { type: "application/pdf" });

    const result = await ocrEngine({ files: [file], options: {} });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("scan-searchable.pdf");

    const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
    const pdfjsLib = await import("pdfjs-dist");
    const outDoc = await pdfjsLib.getDocument({ data: outBytes }).promise;
    const page = await outDoc.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").toUpperCase();
    expect(text).toContain("HELLO");
  }, 30000);

  it("preserves the visible page image", async () => {
    const bytes = await makeImageOnlyPdf();
    const file = new File([bytes as BlobPart], "scan.pdf", { type: "application/pdf" });

    const result = await ocrEngine({ files: [file], options: {} });

    const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBytes);
    expect(outDoc.getPageCount()).toBe(1);
  }, 30000);
});

describe("productionOcrWorkerOptions", () => {
  // The real browser build never runs through Vitest's MODE==="test" branch
  // (see ocrWorkerOptions() in ocr.ts), so this is the path-construction
  // logic every real user actually hits, tested directly and independent of
  // running tesseract.js's WASM init. A regression here (e.g. someone
  // reverting corePath to a single hardcoded file, or to a directory that
  // doesn't have both WASM variants vendored) would have shipped the exact
  // "NetworkError: Failed to execute 'importScripts'" bug this project hit
  // in a real browser without ever failing this suite.
  it("resolves worker/core/lang under the local /tesseract/ asset path, not a CDN", () => {
    const opts = productionOcrWorkerOptions();
    expect(opts.workerPath).toBe("/tesseract/worker.min.js");
    expect(opts.corePath).toBe("/tesseract/core");
    expect(opts.langPath).toBe("/tesseract/lang");
  });

  it("vendors both WASM core variants a real browser's feature detection might request", () => {
    // tesseract.js's browser core-loader picks between these based on
    // runtime WASM feature detection (relaxed-SIMD vs. plain SIMD); OEM is
    // always LSTM_ONLY in this engine, so only the *-lstm builds matter.
    // This caught a real bug: tesseract.js-core@6.1.2 (this project's old
    // explicit pin) ships no relaxedsimd build at all, so a browser that
    // detects relaxed-SIMD support (e.g. current Chrome) 404'd loading it.
    const coreDir = localTesseractAssetPath("core");
    expect(existsSync(`${coreDir}/tesseract-core-simd-lstm.wasm.js`)).toBe(true);
    expect(existsSync(`${coreDir}/tesseract-core-relaxedsimd-lstm.wasm.js`)).toBe(true);
  });
});
