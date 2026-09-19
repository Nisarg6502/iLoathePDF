import { describe, it, expect, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { runRecipe } from "./runRecipe";
import { getRecipe } from "./registry";
import { makeTestPdf } from "@/engines/testHelpers";

// A small canvas-drawn image with real, visible text -- mirrors the pattern
// ocr.test.ts's makeImageOnlyPdf() uses, but produces a plain image File
// (rather than an already-built PDF) since this recipe's first step,
// Images to PDF, is what turns it into a PDF.
async function makeTestScanImage(text = "SCAN"): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = 200;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.font = "48px sans-serif";
  ctx.fillText(text, 20, 100);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))), "image/png");
  });
  return new File([blob], "scan.png", { type: "image/png" });
}

// Approximate bbox for "SCAN" -- position doesn't matter for this test
// (only that the final PDF has SOME extractable text), so this is just a
// plausible-looking box on the page, not a precisely computed one.
const SCAN_WORD = { text: "SCAN", bbox: { x0: 20, y0: 15, x1: 220, y1: 90 } };

describe("runRecipe", () => {
  it("chains merge then compress into one final result", async () => {
    const recipe = getRecipe("merge-compress");
    if (!recipe) throw new Error("Expected merge-compress recipe to exist.");

    const a = await makeTestPdf(2);
    const b = await makeTestPdf(3);
    const files = [
      new File([a as BlobPart], "a.pdf", { type: "application/pdf" }),
      new File([b as BlobPart], "b.pdf", { type: "application/pdf" }),
    ];

    const result = await runRecipe(recipe, files);

    expect(result.files).toHaveLength(1);
    const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBytes);
    expect(outDoc.getPageCount()).toBe(5); // 2 + 3 pages merged, then compressed (page count unchanged)
  });

  it("threads every output file from a multi-output step into the next step (flatten-pdf)", async () => {
    const recipe = getRecipe("flatten-pdf");
    if (!recipe) throw new Error("Expected flatten-pdf recipe to exist.");

    const source = await makeTestPdf(4);
    const file = new File([source as BlobPart], "source.pdf", { type: "application/pdf" });

    const result = await runRecipe(recipe, [file]);

    expect(result.files).toHaveLength(1);
    const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBytes);
    // If runRecipe only forwarded the first output of PDF to Images (one
    // page's worth of images) instead of all of them, this would be 1, not 4.
    expect(outDoc.getPageCount()).toBe(4);
  });

  it("reports which step failed, with that step's own error message", async () => {
    const recipe = getRecipe("merge-compress");
    if (!recipe) throw new Error("Expected merge-compress recipe to exist.");

    // A single valid PDF still merges fine (merge accepts 1+ files), so the
    // failure needs to come from step 2. Simplest reliable way: pass a file
    // that Compress's real engine will reject once it receives merge's
    // output -- but merge's output is always a valid PDF, so instead force
    // the failure by using a corrupt "PDF" that merge itself rejects at
    // step 1, proving step-attribution works for the FIRST step at least.
    // (A step-2-specific failure is harder to construct with real inputs
    // alone; step-1 attribution exercises the same code path in
    // runRecipe.ts that would attribute a step-2 failure, since the
    // try/catch wraps every iteration identically.)
    const corrupt = new File([new Uint8Array([1, 2, 3, 4])], "corrupt.pdf", { type: "application/pdf" });

    await expect(runRecipe(recipe, [corrupt])).rejects.toThrow(/Step 1 of 2 \(Merge PDF\) failed:/);
  });

  // Regression test for the finding that Compress running AFTER OCR
  // silently destroyed the recipe's whole reason for existing: web's
  // Compress engine rasterizes every page to a JPEG and rebuilds a
  // brand-new PDF with no text objects at all, which would wipe out
  // whatever invisible text layer a prior OCR step had just added. This
  // must run OCR LAST (images-to-pdf -> compress -> ocr) so nothing after
  // it can destroy its text layer. Uses a mocked tesseract.js worker (real
  // recognize() doesn't reliably run under Vitest+jsdom -- see ocr.test.ts's
  // own withMockedTesseract for why), same technique ocr.test.ts already
  // established, so this exercises runRecipe's real step-chaining and every
  // real engine's own code (imagesToPdf, compress, ocr) with only the
  // tesseract.js worker itself faked out.
  it("produces a genuinely searchable final PDF for scan-to-searchable-pdf (OCR must run after Compress)", async () => {
    vi.resetModules();
    vi.doMock("tesseract.js", () => ({
      createWorker: vi.fn(async () => ({
        recognize: vi.fn(async () => ({
          data: { blocks: [{ paragraphs: [{ lines: [{ words: [SCAN_WORD] }] }] }] },
        })),
        terminate: vi.fn(async () => {}),
      })),
    }));

    try {
      const { runRecipe: mockedRunRecipe } = await import("./runRecipe");
      const { getRecipe: mockedGetRecipe } = await import("./registry");
      const recipe = mockedGetRecipe("scan-to-searchable-pdf");
      if (!recipe) throw new Error("Expected scan-to-searchable-pdf recipe to exist.");

      const imageFile = await makeTestScanImage();
      const result = await mockedRunRecipe(recipe, [imageFile]);

      expect(result.files).toHaveLength(1);
      const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());

      const loadingTask = pdfjsLib.getDocument({ data: outBytes });
      const outDoc = await loadingTask.promise;
      try {
        const page = await outDoc.getPage(1);
        const content = await page.getTextContent();
        const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        // If Compress ran AFTER OCR (the old, buggy order), the recipe's
        // final step would be Compress, whose rasterize-and-rebuild
        // approach leaves zero text objects on the page -- this would be
        // empty and the assertion below would fail.
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text.toUpperCase()).toContain("SCAN");
      } finally {
        await loadingTask.destroy();
      }
    } finally {
      vi.doUnmock("tesseract.js");
      vi.resetModules();
    }
  }, 30000);
});
