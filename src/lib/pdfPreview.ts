/**
 * Thin, well-bounded wrapper over pdfjs-dist for rendering page thumbnails
 * inside the webview.
 *
 * Hard requirements this file exists to guarantee:
 *  - the pdf.js worker is BUNDLED by Vite, never fetched from a CDN. This app
 *    makes zero network requests, ever.
 *  - rendering is lazy and cached per (page, width). A 200 page PDF must not
 *    rasterise 200 canvases up front.
 *  - documents and in-flight render tasks are destroyed/cancelled on unmount,
 *    because leaked pdf.js workers will wedge the app.
 */

import {
  PDFWorker,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist";
// `?worker` makes Vite emit the worker as part of the bundle and hand us a
// constructor for it. Do NOT replace this with a URL string: that reintroduces
// a network fetch in production.
import PdfJsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

/**
 * Each document gets its own worker.
 *
 * Sharing one worker through `GlobalWorkerOptions.workerPort` looks tidier and
 * is a trap: tearing down any one document terminates that shared port, and
 * every later `getDocument` then fails with "the worker is being destroyed".
 * Opening a second PDF after closing the first is the normal case here, so the
 * worker's lifetime has to match the document's.
 */
function newWorker(): PDFWorker {
  // pdfjs-dist 6.x types `port` as `null | undefined`, but the runtime accepts
  // (and documents) a Worker. Cast rather than fall back to a shared worker.
  const params = { port: new PdfJsWorker() } as unknown as ConstructorParameters<
    typeof PDFWorker
  >[0];
  return new PDFWorker(params);
}

export interface PageDimensions {
  /** CSS pixels at scale 1, already accounting for the page's own /Rotate. */
  width: number;
  height: number;
  /** width / height */
  aspect: number;
}

export interface RenderOptions {
  /** Target CSS width in pixels. Height follows the page aspect ratio. */
  width: number;
  /** Extra rotation in degrees on top of the page's own, 0 | 90 | 180 | 270. */
  rotation?: number;
  /** Defaults to devicePixelRatio, clamped to 2 to keep memory sane. */
  pixelRatio?: number;
  signal?: AbortSignal;
}

const MAX_CACHE_ENTRIES = 240;

export class RenderCancelled extends Error {
  constructor() {
    super("Thumbnail render cancelled");
    this.name = "RenderCancelled";
  }
}

/**
 * A loaded PDF. One instance owns one pdf.js document; call `destroy()` when
 * the owning component unmounts.
 */
export class PdfPreviewDocument {
  readonly pageCount: number;

  #doc: PDFDocumentProxy;
  #loadingTask: PDFDocumentLoadingTask;
  #worker: PDFWorker;
  #destroyed = false;
  /** dataURL cache, keyed `${page}@${width}@${rotation}` (insertion-ordered). */
  #cache = new Map<string, string>();
  /** de-duplicates concurrent requests for the same key */
  #inflight = new Map<string, Promise<string>>();
  #tasks = new Set<RenderTask>();
  #dims = new Map<number, PageDimensions>();

  private constructor(
    doc: PDFDocumentProxy,
    loadingTask: PDFDocumentLoadingTask,
    worker: PDFWorker,
  ) {
    this.#doc = doc;
    this.#loadingTask = loadingTask;
    this.#worker = worker;
    this.pageCount = doc.numPages;
  }

  static async load(
    source: ArrayBuffer | Uint8Array,
    opts: { password?: string } = {},
  ): Promise<PdfPreviewDocument> {
    // pdf.js transfers (neuters) the buffer it is given, so hand it a copy —
    // callers routinely keep the original around for the sidecar.
    const bytes =
      source instanceof Uint8Array
        ? new Uint8Array(source)
        : new Uint8Array(source.slice(0));

    const worker = newWorker();
    const task = getDocument({
      data: bytes,
      password: opts.password,
      worker,
      // Everything below keeps pdf.js entirely offline.
      useWorkerFetch: false,
      disableAutoFetch: true,
      disableStream: true,
    });
    try {
      const doc = await task.promise;
      return new PdfPreviewDocument(doc, task, worker);
    } catch (err) {
      // A failed load still leaves a live worker behind.
      worker.destroy();
      throw err;
    }
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  /** Page size at scale 1. Cheap, cached; use it to size skeletons. */
  async dimensions(pageNumber: number): Promise<PageDimensions> {
    const hit = this.#dims.get(pageNumber);
    if (hit) return hit;
    const page = await this.#page(pageNumber);
    const vp = page.getViewport({ scale: 1 });
    const dims: PageDimensions = {
      width: vp.width,
      height: vp.height,
      aspect: vp.width / vp.height,
    };
    this.#dims.set(pageNumber, dims);
    return dims;
  }

  /** Already-rendered thumbnail for this exact request, or undefined. */
  cached(pageNumber: number, o: Pick<RenderOptions, "width" | "rotation">): string | undefined {
    return this.#cache.get(cacheKey(pageNumber, o.width, o.rotation ?? 0));
  }

  /**
   * Render one page to a PNG data URL at `width` CSS pixels. Repeat calls for
   * the same key resolve from cache; concurrent calls share one render.
   */
  async renderPage(pageNumber: number, options: RenderOptions): Promise<string> {
    const rotation = normalizeRotation(options.rotation ?? 0);
    const width = Math.max(16, Math.round(options.width));
    const key = cacheKey(pageNumber, width, rotation);

    const hit = this.#cache.get(key);
    if (hit) {
      // refresh LRU position
      this.#cache.delete(key);
      this.#cache.set(key, hit);
      return hit;
    }
    const pending = this.#inflight.get(key);
    if (pending) return pending;

    const job = this.#render(pageNumber, width, rotation, options)
      .then((url) => {
        this.#remember(key, url);
        return url;
      })
      .finally(() => {
        this.#inflight.delete(key);
      });

    this.#inflight.set(key, job);
    return job;
  }

  /** Cancel every in-flight render (e.g. the user scrolled away fast). */
  cancelAll(): void {
    for (const task of this.#tasks) {
      try {
        task.cancel();
      } catch {
        /* already settled */
      }
    }
    this.#tasks.clear();
  }

  /** Idempotent. Always call this on unmount. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.cancelAll();
    this.#cache.clear();
    this.#inflight.clear();
    this.#dims.clear();
    // In pdf.js v6 the document is torn down through its loading task; the
    // worker is ours, so it has to be shut down explicitly afterwards.
    void this.#loadingTask
      .destroy()
      .catch(() => undefined)
      .finally(() => this.#worker.destroy());
  }

  // -- internals ----------------------------------------------------------

  async #page(pageNumber: number): Promise<PDFPageProxy> {
    if (this.#destroyed) throw new RenderCancelled();
    return this.#doc.getPage(pageNumber);
  }

  async #render(
    pageNumber: number,
    width: number,
    rotation: number,
    options: RenderOptions,
  ): Promise<string> {
    if (options.signal?.aborted) throw new RenderCancelled();

    const page = await this.#page(pageNumber);
    if (this.#destroyed || options.signal?.aborted) throw new RenderCancelled();

    const base = page.getViewport({ scale: 1, rotation });
    const dpr = clamp(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 1, 2);
    const scale = (width / base.width) * dpr;
    const viewport = page.getViewport({ scale, rotation });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context unavailable");

    const task = page.render({ canvas, viewport, background: "#ffffff" });
    this.#tasks.add(task);

    const onAbort = () => {
      try {
        task.cancel();
      } catch {
        /* noop */
      }
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      await task.promise;
    } catch (err) {
      if (isCancellation(err) || options.signal?.aborted) throw new RenderCancelled();
      throw err;
    } finally {
      this.#tasks.delete(task);
      options.signal?.removeEventListener("abort", onAbort);
      // release the page's operator list; keeps a long document's memory flat
      page.cleanup();
    }

    if (this.#destroyed) throw new RenderCancelled();
    const url = canvas.toDataURL("image/png");
    // free the backing store eagerly rather than waiting for GC
    canvas.width = 0;
    canvas.height = 0;
    return url;
  }

  #remember(key: string, url: string): void {
    this.#cache.set(key, url);
    while (this.#cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.#cache.keys().next();
      if (oldest.done) break;
      this.#cache.delete(oldest.value);
    }
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const cacheKey = (page: number, width: number, rotation: number) =>
  `${page}@${width}@${rotation}`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function normalizeRotation(deg: number): number {
  return ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
}

export function isCancellation(err: unknown): boolean {
  if (err instanceof RenderCancelled) return true;
  const name = (err as { name?: string } | null)?.name;
  return name === "RenderingCancelledException" || name === "AbortError";
}

/** Convenience for `<input type=file>` / drop payloads. */
export async function loadPdfFromFile(file: Blob): Promise<PdfPreviewDocument> {
  return PdfPreviewDocument.load(await file.arrayBuffer());
}
