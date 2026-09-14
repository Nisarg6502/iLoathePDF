import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { watermarkEngine } from "./watermark";
import { makeTestPdf, makeTestPng } from "./testHelpers";

async function toFile(bytes: Uint8Array, name = "in.pdf") {
  return new File([bytes as BlobPart], name, { type: "application/pdf" });
}

function pngDataUrl(): string {
  const bytes = makeTestPng();
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(binary)}`;
}

describe("watermarkEngine", () => {
  it("watermark: draws single centered text on every page", async () => {
    const file = await toFile(await makeTestPdf(3));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "watermark", pages: "all",
        watermark: { content: "text", text: "CONFIDENTIAL", fontSize: 48, color: "#888888",
                    opacity: 0.35, rotation: 45, placement: "single" },
      },
    });
    expect(result.files).toHaveLength(1);
    expect(result.isPreview).toBe(false);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
  });

  it("watermark: tiled placement produces a larger file than single", async () => {
    const single = await toFile(await makeTestPdf(1));
    const tiled = await toFile(await makeTestPdf(1));
    const base = { content: "text" as const, text: "X", fontSize: 24, color: "#888888", opacity: 0.35, rotation: 45 };

    const singleResult = await watermarkEngine({
      files: [single],
      options: { mode: "watermark", pages: "all", watermark: { ...base, placement: "single" } },
    });
    const tiledResult = await watermarkEngine({
      files: [tiled],
      options: { mode: "watermark", pages: "all", watermark: { ...base, placement: "tiled" } },
    });
    expect(tiledResult.files[0].blob.size).toBeGreaterThan(singleResult.files[0].blob.size);
  });

  it("watermark: image content embeds without error", async () => {
    const file = await toFile(await makeTestPdf(1));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "watermark", pages: "all",
        watermark: { content: "image", imageDataUrl: pngDataUrl(), opacity: 0.5, rotation: 0, placement: "single" },
      },
    });
    expect(result.files).toHaveLength(1);
  });

  it("watermark: respects a custom page range", async () => {
    const file = await toFile(await makeTestPdf(5));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "watermark", pages: "2-3",
        watermark: { content: "text", text: "DRAFT", fontSize: 24, color: "#888888",
                    opacity: 0.35, rotation: 45, placement: "single" },
      },
    });
    expect(result.summary).toMatch(/2/);
  });

  it("watermark: rejects a missing text when content is text", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      watermarkEngine({
        files: [file],
        options: { mode: "watermark", pages: "all",
                  watermark: { content: "text", fontSize: 24, color: "#888888", opacity: 0.35, rotation: 45, placement: "single" } },
      }),
    ).rejects.toThrow();
  });

  it("page_numbers: applies to every selected page and reports the count", async () => {
    const file = await toFile(await makeTestPdf(3));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "page_numbers", pages: "all",
        page_numbers: { position: "bottom-center", format: "n-of-total", start: 1, fontSize: 11, color: "#000000" },
      },
    });
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
    expect(result.summary).toMatch(/3/);
  });

  it("page_numbers: rejects a stamp-only position", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      watermarkEngine({
        files: [file],
        options: { mode: "page_numbers", pages: "all",
                  page_numbers: { position: "center", format: "n", start: 1, fontSize: 11, color: "#000000" } },
      }),
    ).rejects.toThrow();
  });

  it("stamp: text at the center position", async () => {
    const file = await toFile(await makeTestPdf(2));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "stamp", pages: "all",
        stamp: { content: "text", text: "APPROVED", position: "center", fontSize: 24 },
      },
    });
    expect(result.files).toHaveLength(1);
  });

  it("stamp: image at bottom-right, scaled by maxWidthPct", async () => {
    const file = await toFile(await makeTestPdf(1));
    const result = await watermarkEngine({
      files: [file],
      options: {
        mode: "stamp", pages: "all",
        stamp: { content: "image", imageDataUrl: pngDataUrl(), position: "bottom-right", maxWidthPct: 0.2 },
      },
    });
    expect(result.files).toHaveLength(1);
  });

  it("stamp: rejects an unknown position", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      watermarkEngine({
        files: [file],
        options: { mode: "stamp", pages: "all",
                  stamp: { content: "text", text: "X", position: "diagonal", fontSize: 24 } },
      }),
    ).rejects.toThrow();
  });

  it("rejects an unknown mode", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      watermarkEngine({ files: [file], options: { mode: "underline", pages: "all" } }),
    ).rejects.toThrow();
  });

  it("rejects an out-of-range custom page spec", async () => {
    const file = await toFile(await makeTestPdf(3));
    await expect(
      watermarkEngine({
        files: [file],
        options: { mode: "watermark", pages: "1-99",
                  watermark: { content: "text", text: "X", fontSize: 24, color: "#888888",
                              opacity: 0.35, rotation: 45, placement: "single" } },
      }),
    ).rejects.toThrow();
  });

  it("rejects an empty file list", async () => {
    await expect(
      watermarkEngine({
        files: [],
        options: { mode: "watermark", pages: "all",
                  watermark: { content: "text", text: "X", fontSize: 24, color: "#888888",
                              opacity: 0.35, rotation: 45, placement: "single" } },
      }),
    ).rejects.toThrow();
  });
});
