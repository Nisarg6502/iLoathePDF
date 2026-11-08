import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { enhance, toBlackAndWhite, filterImage } from "@/lib/scanFilter";
import { scanToPdfEngine } from "./scanToPdf";
import { makeTestImageFile } from "./testHelpers";

/** Paper with a strong left-to-right shadow and five bars of black "text". */
function shadedPage(width = 400, height = 300) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const shade = Math.round(120 + (120 * x) / width);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = shade;
      data[i + 3] = 255;
    }
  }
  for (let row = 0; row < 5; row++) {
    for (let y = 40 + row * 40; y < 52 + row * 40; y++) {
      for (let x = 40; x < 360; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 10;
      }
    }
  }
  return { data, width, height };
}

const at = (data: Uint8ClampedArray, width: number, x: number, y: number) => data[(y * width + x) * 4];

describe("toBlackAndWhite", () => {
  it("removes the shadow and keeps the ink", () => {
    const { data, width, height } = shadedPage();
    toBlackAndWhite(data, width, height);
    const values = new Set<number>();
    for (let i = 0; i < data.length; i += 4) values.add(data[i]);
    expect([...values].sort()).toEqual([0, 255]);
    // Paper on the dark left and the bright right both come out white.
    expect(at(data, width, 10, 10)).toBe(255);
    expect(at(data, width, 390, 290)).toBe(255);
    // Text is black on both sides of the shadow.
    expect(at(data, width, 60, 46)).toBe(0);
    expect(at(data, width, 340, 46)).toBe(0);
  });

  it("turns a blank page entirely white", () => {
    const width = 50, height = 50;
    const data = new Uint8ClampedArray(width * height * 4).fill(180);
    toBlackAndWhite(data, width, height);
    for (let i = 0; i < data.length; i += 4) expect(data[i]).toBe(255);
  });
});

describe("enhance", () => {
  it("stretches a low-contrast image to the full range", () => {
    const width = 60, height = 60;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      const left = (i / 4) % width < 30;
      data[i] = data[i + 1] = data[i + 2] = left ? 100 : 150;
      data[i + 3] = 255;
    }
    enhance(data);
    let lo = 255, hi = 0;
    for (let i = 0; i < data.length; i += 4) {
      lo = Math.min(lo, data[i]);
      hi = Math.max(hi, data[i]);
    }
    expect(lo).toBeLessThan(20);
    expect(hi).toBeGreaterThan(235);
  });

  it("leaves a flat image alone instead of dividing by zero", () => {
    const data = new Uint8ClampedArray(16 * 4).fill(128);
    enhance(data);
    expect(data[0]).toBe(128);
  });
});

describe("scanToPdfEngine", () => {
  it("makes one page per image in original-colour mode without touching pixels", async () => {
    const a = await makeTestImageFile(40, 30, "a.png");
    const b = await makeTestImageFile(30, 40, "b.png");
    expect(await filterImage(a, "color")).toBe(a);
    const result = await scanToPdfEngine({ files: [a, b], options: { mode: "color", page_size: "a4" } });
    expect(result.files).toHaveLength(1);
    expect((await PDFDocument.load(await result.files[0].blob.arrayBuffer())).getPageCount()).toBe(2);
    expect(result.summary).toBe("2 pages, original colour");
  });

  it("requires at least one image", async () => {
    await expect(scanToPdfEngine({ files: [], options: {} })).rejects.toThrow(/at least one/);
  });
});
