import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { splitEngine } from "./split";
import { makeTestPdf } from "./testHelpers";

async function toFile(bytes: Uint8Array) {
  return new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });
}

describe("splitEngine", () => {
  it("splits by explicit ranges into one file per range", async () => {
    const file = await toFile(await makeTestPdf(6));
    const result = await splitEngine({
      files: [file],
      options: { mode: "ranges", ranges: "1-2,3-6" },
    });

    expect(result.files).toHaveLength(2);
    const first = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    const second = await PDFDocument.load(await result.files[1].blob.arrayBuffer());
    expect(first.getPageCount()).toBe(2);
    expect(second.getPageCount()).toBe(4);
  });

  it("splits every N pages", async () => {
    const file = await toFile(await makeTestPdf(5));
    const result = await splitEngine({
      files: [file],
      options: { mode: "everyN", n: 2 },
    });

    expect(result.files).toHaveLength(3);
    const counts = await Promise.all(
      result.files.map(async (f) => (await PDFDocument.load(await f.blob.arrayBuffer())).getPageCount()),
    );
    expect(counts).toEqual([2, 2, 1]);
  });

  it("extracts a selection into a single file", async () => {
    const file = await toFile(await makeTestPdf(5));
    const result = await splitEngine({
      files: [file],
      options: { mode: "extract", ranges: "1,3,5" },
    });

    expect(result.files).toHaveLength(1);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
  });

  it("deletes a selection, keeping the rest as one file", async () => {
    const file = await toFile(await makeTestPdf(5));
    const result = await splitEngine({
      files: [file],
      options: { mode: "delete", ranges: "2,4" },
    });

    expect(result.files).toHaveLength(1);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
  });

  it("rejects everyN mode with n < 1", async () => {
    const file = await toFile(await makeTestPdf(3));
    await expect(
      splitEngine({ files: [file], options: { mode: "everyN", n: 0 } }),
    ).rejects.toThrow();
  });
});
