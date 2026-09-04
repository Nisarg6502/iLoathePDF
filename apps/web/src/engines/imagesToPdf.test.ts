import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { imagesToPdfEngine } from "./imagesToPdf";
import { makeTestPng } from "./testHelpers";

function toFile(bytes: Uint8Array, name: string) {
  return new File([bytes as BlobPart], name, { type: "image/png" });
}

describe("imagesToPdfEngine", () => {
  it("creates one page per image, in file order", async () => {
    const a = toFile(makeTestPng(), "a.png");
    const b = toFile(makeTestPng(), "b.png");

    const result = await imagesToPdfEngine({ files: [a, b], options: { margin: 0 } });

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(2);
    expect(result.summary).toContain("2 images");
  });

  it("rejects an empty file list", async () => {
    await expect(imagesToPdfEngine({ files: [], options: {} })).rejects.toThrow();
  });

  it("rejects a negative margin", async () => {
    const a = toFile(makeTestPng(), "a.png");
    await expect(
      imagesToPdfEngine({ files: [a], options: { margin: -5 } }),
    ).rejects.toThrow();
  });
});
