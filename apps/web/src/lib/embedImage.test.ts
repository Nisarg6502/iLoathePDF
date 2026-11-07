import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { embedImageBytes } from "./embedImage";
import { makeTestPng } from "@/engines/testHelpers";

async function jpegBytes(): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 6;
  canvas.height = 4;
  canvas.getContext("2d")!.fillRect(0, 0, 6, 4);
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg"));
  return new Uint8Array(await blob.arrayBuffer());
}

describe("embedImageBytes", () => {
  it("embeds a JPEG by its bytes (signature uploads used to assume PNG and throw)", async () => {
    const doc = await PDFDocument.create();
    const image = await embedImageBytes(doc, await jpegBytes());
    expect([image.width, image.height]).toEqual([6, 4]);
  });

  it("embeds a PNG", async () => {
    const doc = await PDFDocument.create();
    const image = await embedImageBytes(doc, makeTestPng());
    expect(image.width).toBe(1);
  });

  it("gives a readable error for bytes that are not an image", async () => {
    const doc = await PDFDocument.create();
    await expect(embedImageBytes(doc, new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/isn't supported/);
  });
});
