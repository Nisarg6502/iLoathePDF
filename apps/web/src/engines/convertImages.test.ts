import { describe, it, expect } from "vitest";
import { convertImagesEngine } from "./convertImages";
import { makeTestPng } from "./testHelpers";

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
});
