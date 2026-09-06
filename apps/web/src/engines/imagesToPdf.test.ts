import { describe, it, expect, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { imagesToPdfEngine } from "./imagesToPdf";
import { makeTestPng, makeTestImageFile } from "./testHelpers";

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

  it("rasterizes through canvas when a file has a rotate/crop edit", async () => {
    const file = await makeTestImageFile(20, 10, "wide.png");
    const spy = vi.spyOn(globalThis, "createImageBitmap");

    const result = await imagesToPdfEngine({
      files: [file],
      options: { margin: 0, edits: { 0: { rotate: 90, crop: null } } },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(1);
    spy.mockRestore();
  });

  it("skips rasterization and embeds directly when a file has no edit (fast path)", async () => {
    const a = toFile(makeTestPng(), "a.png");
    const spy = vi.spyOn(globalThis, "createImageBitmap");

    await imagesToPdfEngine({ files: [a], options: { margin: 0 } });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
