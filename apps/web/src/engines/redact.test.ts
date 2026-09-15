import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { redactEngine } from "./redact";
import { makeTestPdf } from "./testHelpers";
import type { RedactBox } from "@/tools/redact/types";

async function toFile(bytes: Uint8Array, name = "in.pdf") {
  return new File([bytes as BlobPart], name, { type: "application/pdf" });
}

function box(pageIndex: number, overrides: Partial<RedactBox> = {}): RedactBox {
  return { id: "b1", pageIndex, xPct: 0.05, yPct: 0.05, wPct: 0.9, hPct: 0.9, ...overrides };
}

async function pageText(bytes: ArrayBuffer, pageNumber: number): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    return content.items.map((item) => ("str" in item ? item.str : "")).join("");
  } finally {
    await loadingTask.destroy();
  }
}

describe("redactEngine", () => {
  it("visual: preserves page count and leaves the original text extractable underneath the box", async () => {
    const file = await toFile(await makeTestPdf(1));
    const result = await redactEngine({ files: [file], options: { mode: "visual", boxes: [box(0)] } });

    expect(result.files).toHaveLength(1);
    expect(result.isPreview).toBe(false);
    const outBytes = await result.files[0].blob.arrayBuffer();
    const out = await PDFDocument.load(outBytes);
    expect(out.getPageCount()).toBe(1);
    expect(await pageText(outBytes, 1)).toContain("Page 1");
  });

  it("true: removes the original text from a page that received a box", async () => {
    const file = await toFile(await makeTestPdf(1));
    const result = await redactEngine({ files: [file], options: { mode: "true", boxes: [box(0)] } });
    const outBytes = await result.files[0].blob.arrayBuffer();
    expect(await pageText(outBytes, 1)).not.toContain("Page 1");
  });

  it("true: leaves a page with no box exactly as searchable as before", async () => {
    const file = await toFile(await makeTestPdf(3));
    const result = await redactEngine({ files: [file], options: { mode: "true", boxes: [box(0)] } });
    const outBytes = await result.files[0].blob.arrayBuffer();
    const out = await PDFDocument.load(outBytes);
    expect(out.getPageCount()).toBe(3);
    expect(await pageText(outBytes, 3)).toContain("Page 3");
  });

  it("rejects when no boxes are given", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      redactEngine({ files: [file], options: { mode: "visual", boxes: [] } }),
    ).rejects.toThrow(/at least one box/);
  });

  it("rejects a box targeting a page that doesn't exist", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      redactEngine({ files: [file], options: { mode: "visual", boxes: [box(5)] } }),
    ).rejects.toThrow(/only has 1 pages/);
  });

  it("summary reports box and page counts for both modes", async () => {
    const file = await toFile(await makeTestPdf(2));
    const result = await redactEngine({
      files: [file],
      options: { mode: "true", boxes: [box(0), box(0, { id: "b2", yPct: 0.02 })] },
    });
    expect(result.summary).toMatch(/2 boxes redacted across 1 page/);
    expect(result.summary).toMatch(/true redact/);
  });
});
