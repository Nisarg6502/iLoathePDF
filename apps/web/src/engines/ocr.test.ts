import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import {
  ocrEngine,
  productionOcrWorkerOptions,
  localTesseractAssetPath,
  sanitizeForWinAnsi,
  DomCanvasFactory,
} from "./ocr";
import { makeTestPdf } from "./testHelpers";

async function makeImageOnlyPdf(width = 300, height = 100, text = "HELLO"): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "black";
  ctx.font = "48px sans-serif";
  ctx.fillText(text, 20, 60);
  const dataUrl = canvas.toDataURL("image/png");
  const pngBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));

  const doc = await PDFDocument.create();
  const png = await doc.embedPng(pngBytes);
  const page = doc.addPage([width, height]);
  page.drawImage(png, { x: 0, y: 0, width, height });
  return doc.save();
}

// --- Byte/stream-level content-stream inspection -----------------------
//
// Mirrors the pattern redact.test.ts uses for its own byte/stream-level
// regression tests: walk every `stream ... endstream` block in the saved
// PDF, zlib-inflate it (pdf-lib compresses content streams by default), and
// hand back the decoded text. pdf.js's getTextContent()/render() only see
// the live, already-correct rendering; they can't tell an invisible-text
// operator sequence from a visible one, or notice one silently missing --
// exactly the class of regression Finding 4 is guarding against. Only
// streams that look like real content streams (contain "BT"/"ET", the
// text-object delimiters) are considered, so this doesn't get confused by
// binary image-stream bytes that happen to survive inflation.
function decodedContentStreams(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  const raw = buf.toString("latin1");
  const streams: string[] = [];
  const streamRe = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end === -1) continue;
    let streamEnd = end;
    if (raw[streamEnd - 1] === "\n") streamEnd--;
    if (raw[streamEnd - 1] === "\r") streamEnd--;
    const chunk = buf.subarray(start, streamEnd);
    try {
      const decoded = inflateSync(chunk).toString("latin1");
      if (decoded.includes("BT") && decoded.includes("ET")) streams.push(decoded);
    } catch {
      // Not flate-compressed (or not valid deflate, e.g. a raw image
      // stream) -- not a content stream we care about here.
    }
    streamRe.lastIndex = end + "endstream".length;
  }
  return streams;
}

// Tokenizes a decoded content stream on whitespace and, for every text-show
// operator (Tj/TJ) it finds, records the text-rendering-mode value most
// recently set by a preceding "N Tr" operator (-1 if none was ever set).
// This directly answers Finding 4's question -- is text-rendering-mode 3
// (Invisible) genuinely in effect for every drawn word, not just present
// somewhere in the stream -- because a PDF operand always immediately
// precedes its operator token, so "the number right before the next `Tr`
// token" is unambiguously that Tr call's own argument regardless of
// whatever else appears earlier in the stream.
function textRenderModesAtShowOps(content: string): number[] {
  const tokens = content.split(/\s+/).filter(Boolean);
  const modes: number[] = [];
  let lastNumber: number | null = null;
  let currentMode = -1;
  for (const tok of tokens) {
    if (tok === "Tr") {
      currentMode = lastNumber ?? -1;
    } else if (tok === "Tj" || tok === "TJ") {
      modes.push(currentMode);
    } else {
      const n = Number(tok);
      if (!Number.isNaN(n)) lastNumber = n;
    }
  }
  return modes;
}

describe("ocrEngine", () => {
  it("rejects a PDF that already has selectable text", async () => {
    const bytes = await makeTestPdf(1); // makeTestPdf uses drawText -> real text
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });

    await expect(ocrEngine({ files: [file], options: {} })).rejects.toThrow(/already has selectable text/i);
  });

  it("adds selectable text that pdf.js can extract back out", async () => {
    const bytes = await makeImageOnlyPdf();
    const file = new File([bytes as BlobPart], "scan.pdf", { type: "application/pdf" });

    const result = await ocrEngine({ files: [file], options: {} });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("scan-searchable.pdf");

    const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument({ data: outBytes });
    const outDoc = await loadingTask.promise;
    try {
      const page = await outDoc.getPage(1);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").toUpperCase();
      expect(text).toContain("HELLO");
    } finally {
      await loadingTask.destroy();
    }
  }, 30000);

  it("preserves the visible page image", async () => {
    const bytes = await makeImageOnlyPdf();
    const file = new File([bytes as BlobPart], "scan.pdf", { type: "application/pdf" });

    const result = await ocrEngine({ files: [file], options: {} });

    const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBytes);
    expect(outDoc.getPageCount()).toBe(1);

    // The old version of this test stopped at getPageCount(), which the
    // test's own name doesn't promise -- a page whose image embed silently
    // failed, came out blank, or was badly mangled would still pass it.
    // Actually verify the visible scan survived: re-rasterize the OUTPUT
    // PDF's page with pdf.js (the same approach ocrEngine itself uses on
    // the source page -- DomCanvasFactory is needed for the same reason
    // ocr.ts needs it: jsdom's canvas rejects drawImage() for an embedded
    // raster image without it) at the page's original point dimensions,
    // and confirm the rasterized pixels contain both the white background
    // and the black "HELLO" glyphs from the source image -- not a blank or
    // corrupt page.
    const loadingTask = pdfjsLib.getDocument({ data: outBytes.slice(0), CanvasFactory: DomCanvasFactory });
    const outPdfDoc = await loadingTask.promise;
    try {
      const page = await outPdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      expect(viewport.width).toBeCloseTo(300, 0);
      expect(viewport.height).toBeCloseTo(100, 0);

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let darkPixels = 0;
      let lightPixels = 0;
      for (let i = 0; i < imageData.length; i += 4) {
        const brightness = (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3;
        if (brightness < 128) darkPixels++;
        else lightPixels++;
      }
      // The source image is a mostly-white background with black "HELLO"
      // text drawn on it -- both must survive into the re-rasterized
      // output for the embed to be genuinely intact.
      expect(lightPixels).toBeGreaterThan(0);
      expect(darkPixels).toBeGreaterThan(0);
    } finally {
      await loadingTask.destroy();
    }
  }, 30000);

  // --- Finding 4: invisible-in-practice regression guard -----------------
  //
  // The mechanism (drawText wraps itself in its own q/Q, but Tr is text
  // state that's inherited into that nested block, so the outer
  // setTextRenderingMode(Invisible) call genuinely applies) is correct
  // today, but nothing previously guarded against a future refactor
  // silently dropping that call -- which would make every OCR output show
  // visible black text stamped over every scan, the worst possible silent
  // regression for this feature. This inspects the actual saved content
  // stream (not just pdf.js's already-correct rendering) and asserts text
  // rendering mode 3 (Invisible) is genuinely in effect for every drawn
  // word, not merely present somewhere in the stream.
  it("draws every word of OCR text with text-rendering-mode 3 (Invisible), not just visually equivalent to it", async () => {
    const bytes = await makeImageOnlyPdf();
    const file = new File([bytes as BlobPart], "scan.pdf", { type: "application/pdf" });

    const result = await ocrEngine({ files: [file], options: {} });
    const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());

    const streams = decodedContentStreams(outBytes);
    expect(streams.length).toBeGreaterThan(0);

    const modes = streams.flatMap(textRenderModesAtShowOps);
    // At least one word must have actually been drawn (sanity check the
    // scanner isn't just failing to find anything), and every single one
    // of them must be under render mode 3.
    expect(modes.length).toBeGreaterThan(0);
    expect(modes.every((mode) => mode === 3)).toBe(true);
  }, 30000);

  // --- Finding 1: unguarded drawText crashes the whole OCR job ----------
  //
  // pdf-lib's default (WinAnsi/CP1252) font embedder throws --
  // `WinAnsi cannot encode "ﬁ" (0xfb01)` -- rather than substituting or
  // skipping, for any code point outside CP1252. Tesseract's English LSTM
  // model emits ligatures like "ﬁ"/"ﬂ" routinely on ordinary scans (many
  // digital fonts encode "fi"/"fl" as a single glyph), so unguarded this
  // aborts the entire OCR job on the tool's primary happy path.
  //
  // This exercises the real word-drawing path in ocrEngine (not just the
  // sanitizeForWinAnsi unit tests below) by mocking tesseract.js's
  // `createWorker` to return a fixed recognition result containing a word
  // whose text is the literal "ﬁ" ligature -- deterministically, rather
  // than relying on the test environment's canvas/font stack to render
  // U+FB01 and then on Tesseract to faithfully OCR it back out as that same
  // ligature codepoint, which turned out NOT to reliably happen with a
  // synthetic canvas image (verified manually: a real rendered-and-OCR'd
  // "ﬁling" came back from Tesseract as ordinary "filing", never exercising
  // this code path at all -- see the final report for that verification).
  // Mocking the worker is what "directly exercises the word-drawing path
  // with a word containing ﬁ" from the review finding.
  it("does not crash when a recognized word's text contains a ligature (mocked worker)", async () => {
    vi.resetModules();
    vi.doMock("tesseract.js", () => ({
      createWorker: vi.fn(async () => ({
        recognize: vi.fn(async () => ({
          data: {
            blocks: [
              {
                paragraphs: [
                  {
                    lines: [
                      {
                        words: [
                          // The literal U+FB01 ligature, exactly what pdf-lib's
                          // WinAnsi encoder throws on.
                          { text: "ﬁling", bbox: { x0: 10, y0: 10, x1: 100, y1: 40 } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        })),
        terminate: vi.fn(async () => {}),
      })),
    }));

    try {
      const { ocrEngine: mockedOcrEngine } = await import("./ocr");
      const bytes = await makeImageOnlyPdf();
      const file = new File([bytes as BlobPart], "scan.pdf", { type: "application/pdf" });

      const result = await mockedOcrEngine({ files: [file], options: {} });

      expect(result.files).toHaveLength(1);
      const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
      const outDoc = await PDFDocument.load(outBytes);
      expect(outDoc.getPageCount()).toBe(1);

      // The searchable text layer should carry the sanitized ("fi", not
      // "ﬁ") expansion of the ligature-bearing word tesseract reported.
      const loadingTask = pdfjsLib.getDocument({ data: outBytes.slice(0) });
      const outPdfDoc = await loadingTask.promise;
      try {
        const page = await outPdfDoc.getPage(1);
        const content = await page.getTextContent();
        const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        expect(text).toContain("filing");
      } finally {
        await loadingTask.destroy();
      }
    } finally {
      vi.doUnmock("tesseract.js");
      vi.resetModules();
    }
  }, 30000);
});

describe("sanitizeForWinAnsi", () => {
  it("expands common ligatures to their plain-Latin equivalents", () => {
    expect(sanitizeForWinAnsi("ﬀﬁﬂﬃﬄ")).toBe("fffiflffiffl");
    expect(sanitizeForWinAnsi("ﬁling")).toBe("filing");
  });

  it("drops code points outside WinAnsi's directly-mapped ranges", () => {
    // U+4E2D (中) is nowhere near CP1252 -- must be stripped, not thrown.
    expect(sanitizeForWinAnsi("abc中def")).toBe("abcdef");
  });

  it("leaves ordinary ASCII text untouched", () => {
    expect(sanitizeForWinAnsi("Hello, World! 123.")).toBe("Hello, World! 123.");
  });
});

describe("productionOcrWorkerOptions", () => {
  // The real browser build never runs through Vitest's MODE==="test" branch
  // (see ocrWorkerOptions() in ocr.ts), so this is the path-construction
  // logic every real user actually hits, tested directly and independent of
  // running tesseract.js's WASM init. A regression here (e.g. someone
  // reverting corePath to a single hardcoded file, or to a directory that
  // doesn't have both WASM variants vendored) would have shipped the exact
  // "NetworkError: Failed to execute 'importScripts'" bug this project hit
  // in a real browser without ever failing this suite.
  it("resolves worker/core/lang under the local /tesseract/ asset path, not a CDN", () => {
    const opts = productionOcrWorkerOptions();
    expect(opts.workerPath).toBe("/tesseract/worker.min.js");
    expect(opts.corePath).toBe("/tesseract/core");
    expect(opts.langPath).toBe("/tesseract/lang");
  });

  it("vendors all three WASM core variants a real browser's feature detection might request", () => {
    // tesseract.js's browser core-loader picks between these based on
    // runtime WASM feature detection (relaxed-SIMD / plain SIMD / neither);
    // OEM is always LSTM_ONLY in this engine, so only the *-lstm builds
    // matter. This caught two real bugs: tesseract.js-core@6.1.2 (this
    // project's old explicit pin) ships no relaxedsimd build at all, so a
    // browser that detects relaxed-SIMD support (e.g. current Chrome) 404'd
    // loading it; and the plain (no-SIMD) tesseract-core-lstm.* build was
    // missing entirely, 404ing for a browser with no WASM SIMD support at
    // all (older Safari/Firefox, or SIMD disabled by policy).
    const coreDir = localTesseractAssetPath("core");
    expect(existsSync(`${coreDir}/tesseract-core-relaxedsimd-lstm.wasm.js`)).toBe(true);
    expect(existsSync(`${coreDir}/tesseract-core-simd-lstm.wasm.js`)).toBe(true);
    expect(existsSync(`${coreDir}/tesseract-core-lstm.wasm.js`)).toBe(true);
  });
});
