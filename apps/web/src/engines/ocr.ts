import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PDFDocument, TextRenderingMode, setTextRenderingMode, pushGraphicsState, popGraphicsState, rgb } from "pdf-lib";
import { createWorker } from "tesseract.js";
import type { Engine } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const OCR_SCALE = 300 / 72; // pdf.js viewport scale equivalent to 300 DPI
const OCR_JPEG_QUALITY = 0.85;

export function assetUrl(path: string): string {
  // import.meta.env.BASE_URL respects Vite's configured base path (this app
  // is served from a /iLoathePDF/ subpath on GitHub Pages, not the origin
  // root) -- a hardcoded "/tesseract/..." would 404 there.
  return `${import.meta.env.BASE_URL}tesseract/${path}`;
}

// Under Vitest there's no dev server to serve assetUrl()'s http(s) paths
// from, so this resolves straight to the real files vendored under public/
// on disk instead -- e.g. ".../apps/web/public/tesseract/lang". (The extra
// leading "/" a file:// URL's pathname puts before a Windows drive letter is
// stripped so this is a normal absolute path. `moduleUrl` is read into a
// variable first: Vite specifically pattern-matches the literal expression
// `new URL('...', import.meta.url)` and rewrites it into a dev-server asset
// URL, same as an `?url` import -- exactly the http(s) path this exists to
// avoid. One extra indirection keeps this a plain runtime URL resolution.)
export function localTesseractAssetPath(path: string): string {
  const moduleUrl = import.meta.url;
  const fileUrl = new URL(`../../public/tesseract/${path}`, moduleUrl);
  return fileUrl.pathname.replace(/^\/([A-Za-z]:)/, "$1");
}

// The real, production path-building logic -- pulled out as its own plain
// function (rather than inlined in ocrWorkerOptions()'s non-test branch) so
// it can be unit-tested directly without needing a MODE flag or a running
// tesseract.js worker. This is what a real browser build always uses.
export function productionOcrWorkerOptions() {
  return {
    workerPath: assetUrl("worker.min.js"),
    // MUST be a directory: tesseract.js feature-detects the best available
    // WASM core at runtime (relaxed-SIMD / SIMD / plain) and loads
    // "<corePath>/tesseract-core-<variant>-lstm.wasm.js" itself. This used
    // to be pinned to one exact file (tesseract-core-simd-lstm.wasm.js)
    // because tesseract.js-core@6.1.2 -- what this project's package.json
    // explicitly pinned, even though tesseract.js@7.0.0 itself depends on
    // tesseract.js-core@^7.0.0 -- doesn't ship a relaxedsimd build at all,
    // and the Chromium build this was tested against supports relaxed SIMD,
    // so a directory corePath 404'd on the capability-detected filename.
    // Verified directly: node_modules/tesseract.js-core@6.1.2 has no
    // "relaxedsimd" files; the nested tesseract.js-core@7.0.0 npm actually
    // resolved for tesseract.js's own internal use (before this fix) does.
    // Bumping this project's explicit tesseract.js-core dependency to
    // ^7.0.0 (matching what tesseract.js@7.0.0 itself requires) and
    // re-vendoring public/tesseract/core/ from that version -- all THREE
    // runtime-selectable variants (tesseract-core-relaxedsimd-lstm.*,
    // tesseract-core-simd-lstm.*, and tesseract-core-lstm.* for a browser
    // with no WASM SIMD support at all, e.g. older Safari/Firefox or SIMD
    // disabled by policy) are now vendored (OEM is always LSTM_ONLY here,
    // so only the *-lstm variants are ever requested) -- makes the
    // directory-based detection this option is designed around actually
    // work for every browser, instead of working around a stale, mismatched
    // core version or 404ing on the no-SIMD fallback.
    corePath: assetUrl("core"),
    langPath: assetUrl("lang"),
  };
}

function ocrWorkerOptions() {
  if (import.meta.env.MODE === "test") {
    // tesseract.js's *browser* worker bundle (dist/worker.min.js, the file
    // assetUrl("worker.min.js") points at) assumes real Worker globals
    // (self.addEventListener, postMessage) that don't exist when Node's
    // worker_threads runs it -- which is what happens under Vitest+jsdom,
    // since jsdom faking `document` makes tesseract.js's own environment
    // detection say "browser" for path resolution while the actual runtime
    // spawning the worker is Node. So workerPath/corePath are left
    // unset here, falling back to tesseract.js's own built-in Node worker
    // script (proven to work by this task's Step 1 smoke test). langPath
    // still points at the real vendored language file, so this still
    // exercises Step 3's actual bundled tessdata without a network call.
    return { langPath: localTesseractAssetPath("lang") };
  }
  return productionOcrWorkerOptions();
}

async function pageHasText(page: pdfjsLib.PDFPageProxy): Promise<boolean> {
  const content = await page.getTextContent();
  return content.items.some((item) => "str" in item && item.str.trim().length > 0);
}

// pdf.js defaults to its own Node-specific canvas factory whenever it
// detects a real Node process -- true under Vitest even though jsdom (which
// this suite runs under) already provides a perfectly good `document`. That
// factory builds canvases straight from the `canvas` npm package rather than
// via `document.createElement`, and jsdom's own CanvasRenderingContext2D
// rejects drawImage() calls given a raw (non-jsdom-wrapped) canvas/image --
// this only bites pages with an embedded raster image (an inline image
// XObject), which is exactly what a scanned PDF's page is. Passing this
// factory explicitly (it must be a class -- pdf.js does `new CanvasFactory(...)`)
// opts back into the DOM path pdf.js already takes by default in a real
// browser, so it's a no-op there and just makes it consistent (and testable)
// under jsdom too. Mirrors pdf.js's own (unexported) DOMCanvasFactory.
export class DomCanvasFactory {
  #document: Document;
  constructor({ ownerDocument = document }: { ownerDocument?: Document } = {}) {
    this.#document = ownerDocument;
  }
  create(width: number, height: number) {
    const canvas = this.#document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(canvasAndContext: { canvas?: HTMLCanvasElement }, width: number, height: number) {
    if (!canvasAndContext.canvas) throw new Error("Canvas is not specified");
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext: { canvas?: HTMLCanvasElement | null; context?: unknown }) {
    if (!canvasAndContext.canvas) throw new Error("Canvas is not specified");
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

// Ligatures Tesseract's English LSTM model routinely emits (many digital
// fonts encode these letter pairs as a single glyph, so that's what OCR
// reads back). pdf-lib's default font embedder uses WinAnsi/CP1252
// encoding, which has no glyph for any of these -- encodeUnicodeCodePoint
// THROWS rather than substituting, so left alone a single ligature anywhere
// in the document aborts the entire OCR job. Expanding them back to plain
// Latin letters before drawText ever sees them keeps this text searchable
// instead of losing it.
const LIGATURE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\u{FB00}/gu, "ff"], // ﬀ
  [/\u{FB01}/gu, "fi"], // ﬁ
  [/\u{FB02}/gu, "fl"], // ﬂ
  [/\u{FB03}/gu, "ffi"], // ﬃ
  [/\u{FB04}/gu, "ffl"], // ﬄ
];

// Reduces `text` to the subset pdf-lib's default (WinAnsi/CP1252) font
// encoding can actually draw, so drawText() never throws on it. Common
// ligatures are expanded to their plain-Latin equivalents first (see
// LIGATURE_REPLACEMENTS above); anything left over that still falls outside
// WinAnsi's directly-mapped ranges -- arbitrary non-Latin-1 code points a
// noisy scan can produce, or WinAnsi's own undefined 0x80-0x9F slots -- is
// dropped outright. Losing one odd character (or, if the whole word is
// unencodable, one word) from the invisible/searchable text layer is a far
// smaller cost than aborting the whole OCR job over it.
export function sanitizeForWinAnsi(text: string): string {
  let sanitized = text;
  for (const [pattern, replacement] of LIGATURE_REPLACEMENTS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return Array.from(sanitized)
    .filter((ch) => {
      const codePoint = ch.codePointAt(0) ?? 0;
      // ASCII printable range, plus the Latin-1 supplement (0xA0-0xFF),
      // which WinAnsi maps at matching code points. 0x7F and the 0x80-0x9F
      // C1 range map to a handful of special characters (curly quotes,
      // dashes, ellipsis, ...) that don't line up 1:1 with these code
      // points, so they're conservatively excluded here too -- the
      // try/catch around drawText below is the safety net for anything
      // this approximation still misses.
      return (codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff);
    })
    .join("");
}

// canvas.toBlob(..., "image/jpeg", quality) instead of a lossless PNG data
// URL: the single biggest win for both browser memory and output file size
// on a multi-page scan (see compress.ts for the same lossless-vs-lossy
// tradeoff already made elsewhere in this codebase).
function jpegBytesFromCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas export failed."));
          return;
        }
        blob
          .arrayBuffer()
          .then((buf) => resolve(new Uint8Array(buf)))
          .catch(reject);
      },
      "image/jpeg",
      quality,
    );
  });
}

// btoa() only accepts a "binary string" (one char per byte), and spreading
// a large Uint8Array straight into String.fromCharCode can blow the call
// stack on a big enough page -- chunking keeps this safe for a full 300 DPI
// scan.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export const ocrEngine: Engine = async ({ files }) => {
  const file = files[0];
  if (!file) throw new Error("Add a scanned PDF to OCR.");

  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: bytes, CanvasFactory: DomCanvasFactory });
  const doc = await loadingTask.promise;

  try {
    // Guard against a PDF that already has selectable text BEFORE paying
    // for tesseract.js worker/WASM-core init (real cost, seconds on a cold
    // start) -- this rejection should be near-instant, not made to wait on
    // work whose result it's about to discard. Each page proxy is fetched,
    // checked, and cleaned up one at a time rather than collected into an
    // array up front, to avoid holding every page's resources resident for
    // the lifetime of the job on a large document.
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      if (await pageHasText(page)) {
        throw new Error("This PDF already has selectable text — OCR is for scanned/image-only PDFs.");
      }
      page.cleanup();
    }

    const worker = await createWorker("eng", 1, ocrWorkerOptions());

    try {
      const outDoc = await PDFDocument.create();

      // One page at a time -- fetched fresh from `doc` and cleaned up
      // immediately after it's fully embedded, rather than collecting every
      // PDFPageProxy into an array up front -- so a multi-page scan doesn't
      // hold every page's rendering resources (and every page's rasterized
      // canvas/recognition result) resident at once.
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: OCR_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable.");
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        // Encode the canvas to JPEG ONCE and reuse those same bytes for
        // both OCR input and the embedded page image, instead of the old
        // code's two separate encodes (a lossless PNG data URL for OCR,
        // then a second, separately atob'd copy of that same PNG for the
        // embed). JPEG instead of PNG is the single biggest win for both
        // browser memory and output file size on a multi-page scan (see
        // compress.ts for the same lossless-vs-lossy tradeoff already made
        // elsewhere in this codebase).
        //
        // This is handed to tesseract.js as a base64 data URL rather than
        // the canvas object itself: tesseract.js's worker-side image loader
        // is resolved differently depending on how the surrounding code is
        // bundled (its package.json "browser" field remaps a Node-oriented
        // loader with no canvas/Blob support to a canvas-aware one, but
        // only when built through a bundler that honors that field) --
        // under this project's own Vitest suite the plain Node loader is
        // what actually runs, and it doesn't understand an
        // HTMLCanvasElement at all. A data URL string is handled
        // identically by both loaders, so this keeps the exact OCR code
        // path under test the same as the real browser build's.
        const jpegBytes = await jpegBytesFromCanvas(canvas, OCR_JPEG_QUALITY);
        const jpegDataUrl = `data:image/jpeg;base64,${bytesToBase64(jpegBytes)}`;

        // tesseract.js only returns `text` by default -- the per-word
        // boxes this needs to place invisible text live under
        // `data.blocks` (> paragraphs > lines > words), which has to be
        // requested explicitly.
        const { data } = await worker.recognize(jpegDataUrl, {}, { blocks: true });
        const words = (data.blocks ?? []).flatMap((block) =>
          block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)),
        );

        const embeddedImage = await outDoc.embedJpg(jpegBytes);

        const pageViewport = page.getViewport({ scale: 1 });
        const outPage = outDoc.addPage([pageViewport.width, pageViewport.height]);
        outPage.drawImage(embeddedImage, { x: 0, y: 0, width: pageViewport.width, height: pageViewport.height });

        const scaleToPdfPoints = pageViewport.width / viewport.width;
        for (const word of words) {
          const x = word.bbox.x0 * scaleToPdfPoints;
          // Canvas y is top-down; PDF y is bottom-up.
          const yTop = word.bbox.y0 * scaleToPdfPoints;
          const wordHeightPt = (word.bbox.y1 - word.bbox.y0) * scaleToPdfPoints;
          const y = pageViewport.height - yTop - wordHeightPt;

          const sanitizedText = sanitizeForWinAnsi(word.text);
          if (!sanitizedText.trim()) continue;

          outPage.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
          try {
            outPage.drawText(sanitizedText, { x, y, size: Math.max(wordHeightPt, 1), color: rgb(0, 0, 0) });
          } catch {
            // Belt-and-suspenders: some code point survived
            // sanitizeForWinAnsi's range filter but pdf-lib's WinAnsi
            // encoder still can't represent it (or the font embedder
            // throws for some other unicode-encoding edge case). Skip just
            // this word -- losing it from the searchable text layer is far
            // cheaper than aborting the whole OCR job over it.
          }
          outPage.pushOperators(popGraphicsState());
        }

        page.cleanup();
      }

      const outBytes = await outDoc.save();
      return {
        files: [
          {
            name: file.name.replace(/\.pdf$/i, "-searchable.pdf"),
            blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }),
          },
        ],
        summary: `${doc.numPages} page(s) made searchable.`,
        isPreview: false,
      };
    } finally {
      await worker.terminate();
    }
  } finally {
    await loadingTask.destroy();
  }
};
