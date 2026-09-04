import { describe, it, expect } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { organizeEngine } from "./organize";
import { makeTestPdf } from "./testHelpers";

async function toFile(bytes: Uint8Array) {
  return new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });
}

describe("organizeEngine", () => {
  it("reorders pages per the given order", async () => {
    const file = await toFile(await makeTestPdf(3));
    const result = await organizeEngine({
      files: [file],
      options: { order: [2, 0, 1], rotate: {}, remove: [] },
    });

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
  });

  it("removes pages listed in remove", async () => {
    const file = await toFile(await makeTestPdf(4));
    const result = await organizeEngine({
      files: [file],
      options: { order: [0, 1, 2, 3], rotate: {}, remove: [1, 3] },
    });

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(2);
  });

  it("rotates pages by the given degrees", async () => {
    const file = await toFile(await makeTestPdf(2));
    const result = await organizeEngine({
      files: [file],
      options: { order: [0, 1], rotate: { 0: 90 }, remove: [] },
    });

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPage(0).getRotation()).toEqual(degrees(90));
    expect(out.getPage(1).getRotation()).toEqual(degrees(0));
  });

  it("rejects a rotation that isn't a multiple of 90", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      organizeEngine({ files: [file], options: { order: [0], rotate: { 0: 45 }, remove: [] } }),
    ).rejects.toThrow();
  });
});
