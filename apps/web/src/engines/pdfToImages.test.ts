import { describe, it, expect } from "vitest";
import { pdfToImagesEngine } from "./pdfToImages";
import { makeTestPdf } from "./testHelpers";

describe("pdfToImagesEngine", () => {
  it("renders one PNG per page at the requested DPI", async () => {
    const bytes = await makeTestPdf(3);
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });

    const result = await pdfToImagesEngine({
      files: [file],
      options: { dpi: 96, format: "png" },
    });

    expect(result.files).toHaveLength(3);
    expect(result.files[0].name).toBe("in-page-1.png");
    expect(result.files[0].blob.type).toBe("image/png");
    expect(result.summary).toContain("3 pages");
  });

  it("supports jpg output", async () => {
    const bytes = await makeTestPdf(1);
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });

    const result = await pdfToImagesEngine({ files: [file], options: { dpi: 96, format: "jpg" } });

    expect(result.files[0].blob.type).toBe("image/jpeg");
  });

  it("rejects a DPI outside 72-300", async () => {
    const bytes = await makeTestPdf(1);
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });

    await expect(
      pdfToImagesEngine({ files: [file], options: { dpi: 500, format: "png" } }),
    ).rejects.toThrow();
  });
});
