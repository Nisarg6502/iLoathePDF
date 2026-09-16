import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PDFDocument, TextRenderingMode, setTextRenderingMode, pushGraphicsState, popGraphicsState, rgb } from "pdf-lib";
import { createWorker } from "tesseract.js";
import type { Engine } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const OCR_SCALE = 300 / 72; // pdf.js viewport scale equivalent to 300 DPI

function assetUrl(path: string): string {
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
function localTesseractAssetPath(path: string): string {
  const moduleUrl = import.meta.url;
  const fileUrl = new URL(`../../public/tesseract/${path}`, moduleUrl);
  return fileUrl.pathname.replace(/^\/([A-Za-z]:)/, "$1");
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
  return {
    workerPath: assetUrl("worker.min.js"),
    corePath: assetUrl("core"),
    langPath: assetUrl("lang"),
  };
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
class DomCanvasFactory {
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

export const ocrEngine: Engine = async ({ files }) => {
  const file = files[0];
  if (!file) throw new Error("Add a scanned PDF to OCR.");

  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: bytes, CanvasFactory: DomCanvasFactory });
  const doc = await loadingTask.promise;

  const worker = await createWorker("eng", 1, ocrWorkerOptions());

  try {
    const pages = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      pages.push(await doc.getPage(pageNum));
    }
    for (const page of pages) {
      if (await pageHasText(page)) {
        throw new Error("This PDF already has selectable text — OCR is for scanned/image-only PDFs.");
      }
    }

    const outDoc = await PDFDocument.create();

    for (const page of pages) {
      const viewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable.");
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const pngDataUrl = canvas.toDataURL("image/png");
      // tesseract.js only returns `text` by default -- the per-word boxes
      // this needs to place invisible text live under `data.blocks` (>
      // paragraphs > lines > words), which has to be requested explicitly.
      const { data } = await worker.recognize(pngDataUrl, {}, { blocks: true });
      const words = (data.blocks ?? []).flatMap((block) =>
        block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)),
      );

      const pngBytes = Uint8Array.from(atob(pngDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
      const embeddedPng = await outDoc.embedPng(pngBytes);

      const pageViewport = page.getViewport({ scale: 1 });
      const outPage = outDoc.addPage([pageViewport.width, pageViewport.height]);
      outPage.drawImage(embeddedPng, { x: 0, y: 0, width: pageViewport.width, height: pageViewport.height });

      const scaleToPdfPoints = pageViewport.width / viewport.width;
      for (const word of words) {
        const x = word.bbox.x0 * scaleToPdfPoints;
        // Canvas y is top-down; PDF y is bottom-up.
        const yTop = word.bbox.y0 * scaleToPdfPoints;
        const wordHeightPt = (word.bbox.y1 - word.bbox.y0) * scaleToPdfPoints;
        const y = pageViewport.height - yTop - wordHeightPt;
        if (!word.text.trim()) continue;

        outPage.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
        outPage.drawText(word.text, { x, y, size: Math.max(wordHeightPt, 1), color: rgb(0, 0, 0) });
        outPage.pushOperators(popGraphicsState());
      }
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
    await loadingTask.destroy();
  }
};
