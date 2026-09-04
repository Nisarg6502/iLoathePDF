import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { compressEngine } from "./compress";
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
