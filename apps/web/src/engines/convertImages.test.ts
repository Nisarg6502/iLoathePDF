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
});
