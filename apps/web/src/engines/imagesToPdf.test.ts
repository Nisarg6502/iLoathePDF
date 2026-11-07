import { describe, it, expect, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { imagesToPdfEngine } from "./imagesToPdf";
import { makeTestPng, makeTestImageFile } from "./testHelpers";

function toFile(bytes: Uint8Array, name: string) {
  return new File([bytes as BlobPart], name, { type: "image/png" });
}

async function pageSizes(blob: Blob) {
  const out = await PDFDocument.load(await blob.arrayBuffer());
  return out.getPages().map((p) => p.getSize());
}

describe("imagesToPdfEngine", () => {
  it("creates one page per image, in file order", async () => {
    const a = toFile(makeTestPng(), "a.png");
    const b = toFile(makeTestPng(), "b.png");

    const result = await imagesToPdfEngine({ files: [a, b], options: { margin_mm: 0 } });

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
      imagesToPdfEngine({ files: [a], options: { page_size: "a4", margin_mm: -5 } }),
    ).rejects.toThrow(/negative/);
  });

  it("rejects a margin that leaves no room for the image", async () => {
    const a = toFile(makeTestPng(), "a.png");
    await expect(
      imagesToPdfEngine({ files: [a], options: { page_size: "a4", margin_mm: 200 } }),
    ).rejects.toThrow(/too large/);
  });

  it("rasterizes through canvas when a file has a rotate/crop edit", async () => {
    const file = await makeTestImageFile(20, 10, "wide.png");
    const spy = vi.spyOn(globalThis, "createImageBitmap");

    const result = await imagesToPdfEngine({
      files: [file],
      options: { margin_mm: 0, edits: { 0: { rotate: 90, crop: null } } },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(1);
    spy.mockRestore();
  });

  it("skips rasterization and embeds directly when a file has no edit (fast path)", async () => {
    const a = toFile(makeTestPng(), "a.png");
    const spy = vi.spyOn(globalThis, "createImageBitmap");

    await imagesToPdfEngine({ files: [a], options: { margin_mm: 0 } });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  describe("output file name", () => {
    it("defaults to images.pdf", async () => {
      const result = await imagesToPdfEngine({ files: [toFile(makeTestPng(), "a.png")], options: {} });
      expect(result.files[0].name).toBe("images.pdf");
    });

    it("uses the name the user typed and adds .pdf", async () => {
      const result = await imagesToPdfEngine({
        files: [toFile(makeTestPng(), "a.png")],
        options: { outputName: "Holiday scans" },
      });
      expect(result.files[0].name).toBe("Holiday scans.pdf");
    });

    it("does not double the extension or keep illegal characters", async () => {
      const result = await imagesToPdfEngine({
        files: [toFile(makeTestPng(), "a.png")],
        options: { outputName: "my:file/v2.PDF" },
      });
      expect(result.files[0].name).toBe("myfilev2.pdf");
    });

    it("falls back to images.pdf when the name is blank", async () => {
      const result = await imagesToPdfEngine({
        files: [toFile(makeTestPng(), "a.png")],
        options: { outputName: "   " },
      });
      expect(result.files[0].name).toBe("images.pdf");
    });
  });

  describe("page layout", () => {
    it("fit: each page is its image's size at 96 dpi", async () => {
      const file = await makeTestImageFile(200, 100, "wide.png");
      const result = await imagesToPdfEngine({ files: [file], options: { page_size: "fit" } });
      const [size] = await pageSizes(result.files[0].blob);
      expect(size.width).toBeCloseTo(150, 1);
      expect(size.height).toBeCloseTo(75, 1);
    });

    it("a4 + auto: landscape images get a landscape page, portrait images a portrait one", async () => {
      const wide = await makeTestImageFile(200, 100, "wide.png");
      const tall = await makeTestImageFile(100, 200, "tall.png");
      const result = await imagesToPdfEngine({
        files: [wide, tall],
        options: { page_size: "a4", orientation: "auto" },
      });
      const [first, second] = await pageSizes(result.files[0].blob);
      expect(first.width).toBeGreaterThan(first.height);
      expect(second.width).toBeLessThan(second.height);
      expect(second.width).toBeCloseTo(595.28, 1);
    });

    it("letter + landscape forces landscape for a portrait image", async () => {
      const tall = await makeTestImageFile(100, 200, "tall.png");
      const result = await imagesToPdfEngine({
        files: [tall],
        options: { page_size: "letter", orientation: "landscape" },
      });
      const [size] = await pageSizes(result.files[0].blob);
      expect(size.width).toBeCloseTo(792, 1);
      expect(size.height).toBeCloseTo(612, 1);
    });

    it("ignores the margin on a fit page", async () => {
      const file = await makeTestImageFile(200, 100, "wide.png");
      const result = await imagesToPdfEngine({
        files: [file],
        options: { page_size: "fit", margin_mm: 30 },
      });
      const [size] = await pageSizes(result.files[0].blob);
      expect(size.width).toBeCloseTo(150, 1);
    });
  });

  it("rasterizes formats pdf-lib cannot embed (webp)", async () => {
    const png = await makeTestImageFile(20, 10, "pic.png");
    const webp = new File([await png.arrayBuffer()], "pic.webp", { type: "image/webp" });
    const result = await imagesToPdfEngine({ files: [webp], options: {} });
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(1);
  });

  it("names the file that could not be read", async () => {
    const bad = new File([new Uint8Array([1, 2, 3])], "broken.jpg", { type: "image/jpeg" });
    await expect(imagesToPdfEngine({ files: [bad], options: {} })).rejects.toThrow(/broken\.jpg/);
  });

  it("falls back to the browser decoder when the extension lies (a PNG saved as .jpg)", async () => {
    const png = await makeTestImageFile(20, 10, "pic.png");
    const liar = new File([await png.arrayBuffer()], "photo.jpg", { type: "image/jpeg" });
    const result = await imagesToPdfEngine({ files: [liar], options: {} });
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(1);
  });
});
