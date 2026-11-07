import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { compressEngine, estimateCompressedPdfSize } from "./compress";
import { makeTestPdf } from "./testHelpers";

describe("compressEngine", () => {
  it("returns a smaller (or equal) PDF, marked as a preview", async () => {
    const bytes = await makeTestPdf(3);
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });

    const result = await compressEngine({ files: [file], options: { dpi: 96 } });

    expect(result.isPreview).toBe(true);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
    expect(result.summary).toMatch(/preview/i);
  });

  it("rejects a DPI outside 72-300", async () => {
    const bytes = await makeTestPdf(1);
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });
    await expect(
      compressEngine({ files: [file], options: { dpi: 30 } }),
    ).rejects.toThrow();
  });
});

describe("estimateCompressedPdfSize", () => {
  it("returns a plausible estimate close to the real compressed size", async () => {
    const bytes = await makeTestPdf(3);
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });

    const est = await estimateCompressedPdfSize(file, 96);
    const real = await compressEngine({ files: [file], options: { dpi: 96 } });

    expect(est.pageCount).toBe(3);
    expect(est.sampledPages).toBe(3);
    expect(est.originalBytes).toBe(file.size);
    const realBytes = real.files[0].blob.size;
    expect(est.estimatedBytes).toBeGreaterThan(realBytes * 0.5);
    expect(est.estimatedBytes).toBeLessThan(realBytes * 1.5);
  });

  it("estimates a bigger result at a higher DPI", async () => {
    const bytes = await makeTestPdf(2);
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });

    const low = await estimateCompressedPdfSize(file, 72);
    const high = await estimateCompressedPdfSize(file, 300);

    expect(high.estimatedBytes).toBeGreaterThan(low.estimatedBytes);
  });

  it("samples at most the requested number of pages", async () => {
    const bytes = await makeTestPdf(6);
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });

    const est = await estimateCompressedPdfSize(file, 96, 2);

    expect(est.sampledPages).toBe(2);
    expect(est.pageCount).toBe(6);
  });

  it("rejects a DPI outside 72-300", async () => {
    const bytes = await makeTestPdf(1);
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });
    await expect(estimateCompressedPdfSize(file, 10)).rejects.toThrow();
  });
});
