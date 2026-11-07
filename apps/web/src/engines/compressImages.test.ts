import { describe, it, expect } from "vitest";
import { compressImagesEngine, compressImage, estimateCompressedSize, readSettings } from "./compressImages";
import { makeTestImageFile } from "./testHelpers";

/** A noisy image so quality actually changes the encoded size. */
async function makeNoisyFile(width: number, height: number, name: string, type: "image/jpeg" | "image/png" | "image/webp") {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const img = ctx.createImageData(width, height);
  let seed = 12345;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    img.data[i] = seed & 255;
    img.data[i + 1] = (seed >> 8) & 255;
    img.data[i + 2] = (seed >> 16) & 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, 0.95);
  });
  return new File([blob], name, { type });
}

describe("compressImagesEngine", () => {
  it("makes a JPEG smaller at low quality", async () => {
    const file = await makeNoisyFile(160, 120, "photo.jpg", "image/jpeg");
    const result = await compressImagesEngine({ files: [file], options: { quality: 20 } });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].blob.size).toBeLessThan(file.size);
    expect(result.files[0].blob.type).toBe("image/jpeg");
    expect(result.summary).toMatch(/smaller/);
  });

  it("returns the same count with a -compressed suffix and per-file before/after detail", async () => {
    const a = await makeNoisyFile(80, 60, "a.jpg", "image/jpeg");
    const b = await makeNoisyFile(80, 60, "b.webp", "image/webp");
    const result = await compressImagesEngine({ files: [a, b], options: { quality: 30 } });

    expect(result.files.map((f) => f.name)).toEqual(["a-compressed.jpg", "b-compressed.webp"]);
    expect(result.files[0].detail).toMatch(/→/);
  });

  it("keeps names unique when two inputs share a stem", async () => {
    const a = await makeNoisyFile(40, 40, "pic.jpg", "image/jpeg");
    const b = await makeNoisyFile(40, 40, "pic.jpg", "image/jpeg");
    const result = await compressImagesEngine({ files: [a, b], options: { quality: 30 } });

    expect(new Set(result.files.map((f) => f.name)).size).toBe(2);
  });

  it("caps the long edge with maxDimension", async () => {
    const file = await makeTestImageFile(200, 100, "wide.png");
    const result = await compressImagesEngine({ files: [file], options: { maxDimension: 50 } });

    const bitmap = await createImageBitmap(result.files[0].blob);
    expect(bitmap.width).toBe(50);
    expect(bitmap.height).toBe(25);
  });

  it("converts PNG to WebP when asked", async () => {
    const file = await makeNoisyFile(60, 60, "n.png", "image/png");
    const result = await compressImagesEngine({ files: [file], options: { format: "webp", quality: 50 } });

    expect(result.files[0].name).toBe("n-compressed.webp");
    expect(result.files[0].blob.type).toBe("image/webp");
  });

  it("never grows a PNG that is re-encoded with nothing else changed", async () => {
    const file = await makeNoisyFile(60, 60, "n.png", "image/png");
    const out = await compressImage(file, readSettings({}));

    expect(out.blob.size).toBeLessThanOrEqual(file.size);
  });

  it("rejects non-image input with a clear error", async () => {
    const file = new File(["not an image"], "notes.txt", { type: "text/plain" });
    await expect(compressImagesEngine({ files: [file], options: {} })).rejects.toThrow(/notes\.txt.*not a supported image/);
  });

  it("rejects a corrupt image with a clear error", async () => {
    const file = new File(["garbage"], "broken.jpg", { type: "image/jpeg" });
    await expect(compressImagesEngine({ files: [file], options: {} })).rejects.toThrow(/broken\.jpg.*could not be read/);
  });

  it("rejects an empty selection and bad settings", async () => {
    await expect(compressImagesEngine({ files: [], options: {} })).rejects.toThrow(/at least one image/i);
    const file = await makeTestImageFile(10, 10, "x.png");
    await expect(compressImagesEngine({ files: [file], options: { quality: 0 } })).rejects.toThrow(/quality/i);
    await expect(compressImagesEngine({ files: [file], options: { maxDimension: 3 } })).rejects.toThrow(/max dimension/i);
  });
});

describe("estimateCompressedSize", () => {
  it("estimates a smaller size at lower quality and scales to the whole batch", async () => {
    const a = await makeNoisyFile(120, 90, "a.jpg", "image/jpeg");
    const b = await makeNoisyFile(120, 90, "b.jpg", "image/jpeg");
    const high = await estimateCompressedSize([a, b], readSettings({ quality: 95 }));
    const low = await estimateCompressedSize([a, b], readSettings({ quality: 15 }));

    expect(low.estimatedBytes).toBeLessThan(high.estimatedBytes);
    expect(low.originalBytes).toBe(a.size + b.size);
    expect(low.estimatedBytes).toBeLessThan(low.originalBytes);
  });
});
