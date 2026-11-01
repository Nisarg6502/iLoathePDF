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

  it("is true for a crop that covers the entire frame", () => {
    expect(isNoopEdit({ rotate: 0, crop: { x: 0, y: 0, w: 1, h: 1 } })).toBe(true);
  });
});

describe("reorderEdits / removeEdit", () => {
  const rot = (rotate: 0 | 90 | 180 | 270) => ({ rotate, crop: null });

  it("moves an edit with its image when the image moves down", async () => {
    const { reorderEdits } = await import("./imageEdit");
    // [A(90), B, C(270)] -> move A to the end -> [B, C(270), A(90)]
    expect(reorderEdits({ 0: rot(90), 2: rot(270) }, 3, 0, 2)).toEqual({ 1: rot(270), 2: rot(90) });
  });

  it("moves an edit with its image when the image moves up", async () => {
    const { reorderEdits } = await import("./imageEdit");
    // [A, B, C(180)] -> move C to the front -> [C(180), A, B]
    expect(reorderEdits({ 2: rot(180) }, 3, 2, 0)).toEqual({ 0: rot(180) });
  });

  it("drops the removed image's edit and shifts later ones down", async () => {
    const { removeEdit } = await import("./imageEdit");
    expect(removeEdit({ 0: rot(90), 1: rot(180), 2: rot(270) }, 1)).toEqual({ 0: rot(90), 1: rot(270) });
  });
});
