import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergeEngine } from "./merge";
import { makeTestPdf } from "./testHelpers";

async function toFile(bytes: Uint8Array, name: string) {
  return new File([bytes as BlobPart], name, { type: "application/pdf" });
}

describe("mergeEngine", () => {
  it("concatenates all pages of all files in the given file order", async () => {
    // Distinct page sizes per file let us prove ordering, not just count —
    // a scrambled merge (b's pages before a's) would fail these size checks.
    const a = await toFile(await makeTestPdf(2, { pageSize: [200, 300] }), "a.pdf");
    const b = await toFile(await makeTestPdf(3, { pageSize: [150, 250] }), "b.pdf");

    const result = await mergeEngine({ files: [a, b], options: {} });

    expect(result.files).toHaveLength(1);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(5);
    expect(out.getPage(0).getSize()).toEqual({ width: 200, height: 300 });
    expect(out.getPage(1).getSize()).toEqual({ width: 200, height: 300 });
    expect(out.getPage(2).getSize()).toEqual({ width: 150, height: 250 });
    expect(out.getPage(4).getSize()).toEqual({ width: 150, height: 250 });
    expect(result.isPreview).toBe(false);
    expect(result.summary).toContain("5 pages");
  });

  it("applies a per-file page range when given one", async () => {
    const a = await toFile(await makeTestPdf(5), "a.pdf");

    const result = await mergeEngine({
      files: [a],
      options: { ranges: { "a.pdf": "1-2,5" } },
    });

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
  });

  it("rejects an empty file list", async () => {
    await expect(mergeEngine({ files: [], options: {} })).rejects.toThrow();
  });
});
