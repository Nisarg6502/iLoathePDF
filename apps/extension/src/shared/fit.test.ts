import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { makeTestPdf } from "@/engines/testHelpers";
import { imagesToPdfEngine } from "@/engines/imagesToPdf";
import { FitError, fitImage, fitImagesToPdf, fitPdf, fitPdfToImages, fitToPlan, fitsTarget, outputName } from "./fit";
import { planOutput } from "./accept";

const FIXTURES = join(import.meta.dirname, "../../../web/src/engines/__fixtures__");

/**
 * A photo-like test image: smooth gradients plus some grain, so quality and
 * pixel count both change the encoded size the way they do for real photos.
 * `grain` 255 gives pure noise.
 */
async function makeImage(width: number, height: number, name: string, type: "image/jpeg" | "image/png", grain = 40): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const img = ctx.createImageData(width, height);
  let seed = 4242;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = ((seed & 255) / 255 - 0.5) * grain;
      const i = (y * width + x) * 4;
      img.data[i] = (x / width) * 255 + n;
      img.data[i + 1] = (y / height) * 255 + n;
      img.data[i + 2] = ((x + y) / (width + height)) * 255 - n;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, 0.97),
  );
  return new File([blob], name, { type });
}

async function dimensions(blob: Blob): Promise<[number, number]> {
  const bitmap = await createImageBitmap(blob);
  return [bitmap.width, bitmap.height];
}

describe("fitImage", () => {
  it("passes a file through untouched when it already fits", async () => {
    const file = await makeImage(60, 40, "small.jpg", "image/jpeg");
    const out = await fitImage(file, "jpeg", { maxBytes: file.size + 1 });
    expect(out).toMatchObject({ met: true, untouched: true });
    expect(out.file).toBe(file);
  });

  it("lowers JPEG quality to get under the limit and keeps the pixels", async () => {
    const file = await makeImage(320, 240, "photo.jpg", "image/jpeg");
    const max = Math.floor(file.size * 0.5);
    const out = await fitImage(file, "jpeg", { maxBytes: max });

    expect(out.met).toBe(true);
    expect(out.file.size).toBeLessThanOrEqual(max);
    expect(out.file.type).toBe("image/jpeg");
    expect(out.file.name).toBe("photo.jpg");
    expect(out.quality).toBeGreaterThanOrEqual(60);
    expect(await dimensions(out.file)).toEqual([320, 240]);
  });

  it("picks the highest quality that fits, not just any", async () => {
    const file = await makeImage(320, 240, "photo.jpg", "image/jpeg");
    const max = Math.floor(file.size * 0.5);
    const out = await fitImage(file, "jpeg", { maxBytes: max });
    // Five quality points higher would no longer fit (the search stops within 4).
    const higher = await fitImage(file, "jpeg", { maxBytes: out.file.size - 1 });
    expect(higher.quality ?? 0).toBeLessThanOrEqual(out.quality ?? 0);
  });

  it("shrinks the pixels when quality alone isn't enough", async () => {
    const file = await makeImage(400, 300, "big.jpg", "image/jpeg", 255);
    const max = 6000;
    const out = await fitImage(file, "jpeg", { maxBytes: max });

    expect(out.met).toBe(true);
    expect(out.file.size).toBeLessThanOrEqual(max);
    const [w, h] = await dimensions(out.file);
    expect(w).toBeLessThan(400);
    expect(w / h).toBeCloseTo(4 / 3, 1);
  });

  it("converts a PNG to JPEG and fits it", async () => {
    const file = await makeImage(300, 200, "scan.png", "image/png");
    const out = await fitImage(file, "jpeg", { maxBytes: 15_000 });
    expect(out.met).toBe(true);
    expect(out.file.name).toBe("scan.jpg");
    expect(out.file.type).toBe("image/jpeg");
    expect(out.file.size).toBeLessThanOrEqual(15_000);
  });

  it("fits a PNG target by making it smaller in pixels", async () => {
    const file = await makeImage(300, 200, "noise.png", "image/png", 255);
    const max = Math.floor(file.size * 0.4);
    const out = await fitImage(file, "png", { maxBytes: max });

    expect(out.met).toBe(true);
    expect(out.file.type).toBe("image/png");
    expect(out.file.size).toBeLessThanOrEqual(max);
    expect((await dimensions(out.file))[0]).toBeLessThan(300);
  });

  it("turns a JPEG into a PNG when the field only takes PNG", async () => {
    const file = await makeImage(80, 60, "photo.jpg", "image/jpeg");
    const out = await fitImage(file, "png", {});
    expect(out.met).toBe(true);
    expect(out.file.name).toBe("photo.png");
    expect(new Uint8Array(await out.file.arrayBuffer()).slice(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47]));
  });

  it("grows an image that is below the minimum", async () => {
    const file = await makeImage(32, 24, "tiny.jpg", "image/jpeg", 255);
    const target = { minBytes: 20 * 1024, maxBytes: 50_000 };
    expect(file.size).toBeLessThan(target.minBytes);
    const out = await fitImage(file, "jpeg", target);

    expect(out.met).toBe(true);
    expect(fitsTarget(out.file.size, target)).toBe(true);
    expect((await dimensions(out.file))[0]).toBeGreaterThan(32);
  });

  it("returns the closest result and says so when the limit can't be met", async () => {
    const file = await makeImage(200, 150, "photo.jpg", "image/jpeg", 255);
    const out = await fitImage(file, "jpeg", { maxBytes: 200 });
    expect(out.met).toBe(false);
    expect(out.miss).toBe("too-big");
    expect(out.file.size).toBeGreaterThan(200);
    expect(out.file.size).toBeLessThan(file.size);
  });

  it("reports an unreadable image", async () => {
    const broken = new File(["not really a jpeg"], "broken.jpg", { type: "image/jpeg" });
    await expect(fitImage(broken, "jpeg", { maxBytes: 10 })).rejects.toMatchObject({ code: "unreadable", fileName: "broken.jpg" });
  });
});

describe("fitImagesToPdf", () => {
  it("makes one PDF with a page per image", async () => {
    const a = await makeImage(120, 90, "a.jpg", "image/jpeg");
    const b = await makeImage(90, 120, "b.png", "image/png");
    const out = await fitImagesToPdf([a, b], {});
    expect(out.met).toBe(true);
    expect(out.file.name).toBe("a.pdf");
    const doc = await PDFDocument.load(await out.file.arrayBuffer());
    expect(doc.getPageCount()).toBe(2);
  });

  it("shrinks the images until the PDF is under the limit", async () => {
    const a = await makeImage(400, 300, "a.jpg", "image/jpeg");
    const b = await makeImage(400, 300, "b.jpg", "image/jpeg");
    const plain = await fitImagesToPdf([a, b], {});
    const max = Math.floor(plain.file.size * 0.4);
    const out = await fitImagesToPdf([a, b], { maxBytes: max });

    expect(out.met).toBe(true);
    expect(out.file.size).toBeLessThanOrEqual(max);
    expect((await PDFDocument.load(await out.file.arrayBuffer())).getPageCount()).toBe(2);
  });
});

describe("fitPdf", () => {
  it("passes a PDF that already fits through untouched", async () => {
    const file = new File([(await makeTestPdf(1)) as BlobPart], "form.pdf", { type: "application/pdf" });
    const out = await fitPdf(file, { maxBytes: file.size });
    expect(out).toMatchObject({ met: true, untouched: true });
  });

  it("re-renders a scanned PDF at a lower DPI to get under the limit", async () => {
    const photo = await makeImage(900, 1200, "scan.jpg", "image/jpeg", 120);
    const made = await imagesToPdfEngine({ files: [photo], options: { page_size: "a4" } });
    const file = new File([made.files[0].blob], "scan.pdf", { type: "application/pdf" });
    const max = Math.floor(file.size * 0.5);
    const out = await fitPdf(file, { maxBytes: max });

    expect(out.met).toBe(true);
    expect(out.file.size).toBeLessThanOrEqual(max);
    expect(out.file.name).toBe("scan.pdf");
    expect(out.dpi).toBeGreaterThanOrEqual(72);
    expect((await PDFDocument.load(await out.file.arrayBuffer())).getPageCount()).toBe(1);
  });

  it("says a password-protected PDF can't be opened (fixture from the desktop engine)", async () => {
    const bytes = readFileSync(join(FIXTURES, "pikepdf-aes256.pdf"));
    const file = new File([new Uint8Array(bytes)], "locked.pdf", { type: "application/pdf" });
    const err = await fitPdf(file, { maxBytes: 100 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FitError);
    expect(err).toMatchObject({ code: "password", fileName: "locked.pdf" });
  });
});

describe("fitPdfToImages", () => {
  it("renders only the first page for a one-file field", async () => {
    const file = new File([(await makeTestPdf(2)) as BlobPart], "certificate.pdf", { type: "application/pdf" });
    const out = await fitPdfToImages(file, "jpeg", { maxBytes: 200_000 }, true);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ met: true });
    expect(out[0].file.name).toBe("certificate.jpg");
    expect(out[0].file.type).toBe("image/jpeg");
  });

  it("renders every page for a multiple field", async () => {
    const file = new File([(await makeTestPdf(2)) as BlobPart], "doc.pdf", { type: "application/pdf" });
    const out = await fitPdfToImages(file, "jpeg", {}, false);
    expect(out.map((f) => f.file.name)).toEqual(["doc-page-1.jpg", "doc-page-2.jpg"]);
  });
});

describe("fitToPlan", () => {
  it("runs the plan planOutput chose", async () => {
    const png = await makeImage(200, 150, "signature.png", "image/png");
    const plan = planOutput([png], ["jpeg"], false, { sizeLimited: true });
    if (plan.kind === "error") throw new Error("unexpected");
    const [out] = await fitToPlan([png], plan, { maxBytes: 8000 });
    expect(out.met).toBe(true);
    expect(out.file.name).toBe("signature.jpg");
    expect(out.file.size).toBeLessThanOrEqual(8000);
  });
});

describe("outputName", () => {
  it("swaps the extension", () => {
    expect(outputName("photo.PNG", "jpeg")).toBe("photo.jpg");
    expect(outputName("my.scan.jpeg", "pdf")).toBe("my.scan.pdf");
    expect(outputName("noext", "png")).toBe("noext.png");
    expect(outputName(".hidden", "webp")).toBe(".hidden.webp");
  });
});
