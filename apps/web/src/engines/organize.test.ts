import { describe, it, expect } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { organizeEngine } from "./organize";
import { makeTestPdf } from "./testHelpers";

async function toFile(bytes: Uint8Array) {
  return new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });
}

// A fixture whose pages have distinct sizes, so reordering can be proven by
// checking which size ends up at which output index (page count alone can't
// distinguish a reorder from a no-op).
async function makeDistinctSizedPdf(sizes: [number, number][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const [w, h] of sizes) doc.addPage([w, h]);
  return doc.save();
}

describe("organizeEngine", () => {
  it("reorders pages per the given order", async () => {
    const sizes: [number, number][] = [
      [100, 150],
      [200, 250],
      [300, 350],
    ];
    const file = await toFile(await makeDistinctSizedPdf(sizes));
    const result = await organizeEngine({
      files: [file],
      options: { order: [2, 0, 1], rotate: {}, remove: [] },
    });

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
    expect(out.getPage(0).getSize()).toEqual({ width: 300, height: 350 });
    expect(out.getPage(1).getSize()).toEqual({ width: 100, height: 150 });
    expect(out.getPage(2).getSize()).toEqual({ width: 200, height: 250 });
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
