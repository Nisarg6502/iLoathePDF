import { describe, it, expect } from "vitest";
import { renderRotatedCropped, isNoopEdit, DEFAULT_IMAGE_EDIT } from "./imageEdit";

function makeSourceCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable in test environment.");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, w, h);
  return canvas;
}

describe("renderRotatedCropped", () => {
  it("keeps dimensions unchanged with no rotate and no crop", () => {
    const src = makeSourceCanvas(10, 6);
    const out = renderRotatedCropped(src, { rotate: 0, crop: null });
    expect(out.width).toBe(10);
    expect(out.height).toBe(6);
  });

  it("swaps width/height for a 90 degree rotation", () => {
    const src = makeSourceCanvas(10, 6);
    const out = renderRotatedCropped(src, { rotate: 90, crop: null });
    expect(out.width).toBe(6);
    expect(out.height).toBe(10);
  });

  it("keeps dimensions for a 180 degree rotation", () => {
    const src = makeSourceCanvas(10, 6);
    const out = renderRotatedCropped(src, { rotate: 180, crop: null });
    expect(out.width).toBe(10);
    expect(out.height).toBe(6);
  });

  it("swaps width/height for a 270 degree rotation", () => {
    const src = makeSourceCanvas(10, 6);
    const out = renderRotatedCropped(src, { rotate: 270, crop: null });
    expect(out.width).toBe(6);
    expect(out.height).toBe(10);
  });

  it("crops relative to the unrotated bounding box", () => {
    const src = makeSourceCanvas(10, 6);
    const out = renderRotatedCropped(src, { rotate: 0, crop: { x: 0.2, y: 0, w: 0.5, h: 1 } });
    expect(out.width).toBe(5);
    expect(out.height).toBe(6);
  });

  it("crops relative to the rotated bounding box after a 90 degree rotation", () => {
    const src = makeSourceCanvas(10, 6); // rotated box is 6 wide x 10 tall
    const out = renderRotatedCropped(src, { rotate: 90, crop: { x: 0, y: 0, w: 1, h: 0.5 } });
    expect(out.width).toBe(6);
    expect(out.height).toBe(5);
  });
});

describe("isNoopEdit", () => {
  it("is true for undefined", () => {
    expect(isNoopEdit(undefined)).toBe(true);
  });

  it("is true for the default edit", () => {
    expect(isNoopEdit(DEFAULT_IMAGE_EDIT)).toBe(true);
  });

  it("is false when rotate is set", () => {
    expect(isNoopEdit({ rotate: 90, crop: null })).toBe(false);
  });

  it("is false when crop is set", () => {
    expect(isNoopEdit({ rotate: 0, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } })).toBe(false);
  });
});
