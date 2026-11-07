import { describe, it, expect } from "vitest";
import { convertImagesEngine } from "./convertImages";
import { makeTestPng, makeTestImageFile } from "./testHelpers";

describe("convertImagesEngine", () => {
  it("converts PNG to JPG (live)", async () => {
    const file = new File([makeTestPng() as BlobPart], "a.png", { type: "image/png" });
    const result = await convertImagesEngine({ files: [file], options: { to: "jpg" } });

    expect(result.isPreview).toBe(false);
    expect(result.files[0].name).toBe("a.jpg");
    expect(result.files[0].blob.type).toBe("image/jpeg");
  });

  it("converts PNG to WebP (live)", async () => {
    const file = new File([makeTestPng() as BlobPart], "a.png", { type: "image/png" });
    const result = await convertImagesEngine({ files: [file], options: { to: "webp" } });

    expect(result.files[0].blob.type).toBe("image/webp");
  });

  it("marks HEIC input as preview and does not silently produce a wrong file", async () => {
    const file = new File([new Uint8Array([0, 1, 2]) as BlobPart], "a.heic", { type: "image/heic" });
    const result = await convertImagesEngine({ files: [file], options: { to: "jpg" } });

    expect(result.isPreview).toBe(true);
    expect(result.summary).toMatch(/heic/i);
  });

  it("rotates before converting", async () => {
    const file = await makeTestImageFile(20, 10, "wide.png");
    const result = await convertImagesEngine({
      files: [file],
      options: { to: "png", edits: { 0: { rotate: 90, crop: null } } },
    });

    const bitmap = await createImageBitmap(result.files[0].blob);
    expect(bitmap.width).toBe(10);
    expect(bitmap.height).toBe(20);
  });

  it("crops within the rotated bounding box before converting", async () => {
    const file = await makeTestImageFile(20, 10, "wide.png");
    const result = await convertImagesEngine({
      files: [file],
      options: { to: "png", edits: { 0: { rotate: 0, crop: { x: 0, y: 0, w: 0.5, h: 1 } } } },
    });

    const bitmap = await createImageBitmap(result.files[0].blob);
    expect(bitmap.width).toBe(10);
    expect(bitmap.height).toBe(10);
  });

  it("leaves a file with no edit entry untouched in size", async () => {
    const file = await makeTestImageFile(20, 10, "wide.png");
    const result = await convertImagesEngine({ files: [file], options: { to: "png" } });

    const bitmap = await createImageBitmap(result.files[0].blob);
    expect(bitmap.width).toBe(20);
    expect(bitmap.height).toBe(10);
  });

  it("flattens transparency onto white when converting to JPG (not black)", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8; // left fully transparent
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
    const file = new File([blob], "clear.png", { type: "image/png" });

    const result = await convertImagesEngine({ files: [file], options: { to: "jpg" } });

    const bitmap = await createImageBitmap(result.files[0].blob);
    const probe = document.createElement("canvas");
    probe.width = bitmap.width;
    probe.height = bitmap.height;
    const ctx = probe.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const [r, g, b] = ctx.getImageData(4, 4, 1, 1).data;
    expect(Math.min(r, g, b)).toBeGreaterThan(240);
  });

  it("never lets two inputs overwrite each other when their stems collide", async () => {
    const a = await makeTestImageFile(10, 10, "photo.png");
    const b = await makeTestImageFile(10, 10, "photo.jpg");
    const result = await convertImagesEngine({ files: [a, b], options: { to: "png" } });
    expect(result.files.map((f) => f.name)).toEqual(["photo.png", "photo (2).png"]);
  });

  it("rejects an out-of-range quality", async () => {
    const a = await makeTestImageFile(10, 10, "a.png");
    await expect(convertImagesEngine({ files: [a], options: { to: "jpg", quality: 0 } })).rejects.toThrow(/Quality/);
  });
});
