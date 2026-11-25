import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { convertImage, renameFor } from "./saveImage";

async function makeImage(name: string, type: "image/png" | "image/jpeg", width = 40, height = 30): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e89800";
  ctx.fillRect(0, 0, width, height);
  const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), type));
  return new File([blob], name, { type });
}

const head = async (f: Blob, n: number) => new Uint8Array(await f.slice(0, n).arrayBuffer());

describe("renameFor", () => {
  it("swaps the extension, or adds one", () => {
    expect(renameFor("photo.webp", "pdf")).toBe("photo.pdf");
    expect(renameFor("IMG_0042.JPEG", "png")).toBe("IMG_0042.png");
    expect(renameFor("banner", "jpg")).toBe("banner.jpg");
    expect(renameFor(".png", "pdf")).toBe("image.pdf");
  });
});

describe("convertImage", () => {
  it("makes a one-page PDF the size of the image", async () => {
    const out = await convertImage(await makeImage("logo.png", "image/png", 40, 30), "pdf");
    expect(out.name).toBe("logo.pdf");
    expect(out.type).toBe("application/pdf");
    const doc = await PDFDocument.load(await out.arrayBuffer());
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width / height).toBeCloseTo(40 / 30, 2);
  });

  it("re-encodes PNG to JPG", async () => {
    const out = await convertImage(await makeImage("logo.png", "image/png"), "jpg");
    expect(out.name).toBe("logo.jpg");
    expect(out.type).toBe("image/jpeg");
    expect([...(await head(out, 3))]).toEqual([0xff, 0xd8, 0xff]);
  });

  it("re-encodes JPG to PNG", async () => {
    const out = await convertImage(await makeImage("photo.jpg", "image/jpeg"), "png");
    expect(out.name).toBe("photo.png");
    expect([...(await head(out, 4))]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("hands an image already in that format back unchanged", async () => {
    const png = await makeImage("same.png", "image/png");
    const out = await convertImage(png, "png");
    expect(out.size).toBe(png.size);
    expect(out.name).toBe("same.png");
  });
});
