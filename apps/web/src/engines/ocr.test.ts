import { describe, it, expect } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";
import { ocrEngine } from "./ocr";
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
