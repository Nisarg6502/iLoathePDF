/**
 * PDF Reader: a continuous-scroll viewer. Pages render lazily (only the ones
 * near the viewport hold a canvas), with a selectable text layer, zoom, a page
 * box and find-in-document. Nothing is uploaded; the file is read in this tab.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { FileDropZone } from "@/components/FileDropZone";
import type { ToolConfig } from "@/tools/ToolConfig";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type Zoom = "fit" | number;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

interface PageViewProps {
  doc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  placeholder: { width: number; height: number };
  query: string;
  onSize: (pageNumber: number, size: { width: number; height: number }) => void;
  register: (pageNumber: number, el: HTMLDivElement | null) => void;
}

function PageView({ doc, pageNumber, scale, placeholder, query, onSize, register }: PageViewProps) {
  const holder = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(0);

  useEffect(() => {
    register(pageNumber, holder.current);
    return () => register(pageNumber, null);
  }, [pageNumber, register]);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: pdfjsLib.RenderTask | null = null;
    let textLayer: pdfjsLib.TextLayer | null = null;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      onSize(pageNumber, { width: viewport.width / scale, height: viewport.height / scale });

      const canvas = canvasRef.current;
      const text = textRef.current;
      if (!canvas || !text) return;
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      task = page.render({
        canvasContext: ctx,
        canvas,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      });
      try {
        await task.promise;
      } catch {
        return; // cancelled by scrolling away or zooming
      }
      if (cancelled) return;
      text.replaceChildren();
      text.style.setProperty("--scale-factor", String(scale));
      textLayer = new pdfjsLib.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport });
      try {
        await textLayer.render();
      } catch {
        return;
      }
      if (!cancelled) setRendered((n) => n + 1);
    })().catch(() => undefined);

    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [visible, doc, pageNumber, scale, onSize]);

  // Free the canvas of pages that scroll far away; the placeholder keeps their height.
  useEffect(() => {
    if (visible) return;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    textRef.current?.replaceChildren();
  }, [visible]);

  useEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const needle = query.trim().toLowerCase();
    text.querySelectorAll("span").forEach((span) => {
      const hit = needle !== "" && (span.textContent ?? "").toLowerCase().includes(needle);
      span.style.background = hit ? "color-mix(in oklch, var(--accent) 45%, transparent)" : "";
    });
  }, [query, rendered]);

  // `placeholder` is the page's true size (at scale 1) once it has rendered, the first page's size before that.
  const w = placeholder.width * scale;
  const h = placeholder.height * scale;

  return (
    <div
      ref={holder}
      data-page={pageNumber}
      className="relative mx-auto mb-4 bg-white shadow-[var(--shadow-card)]"
      style={{ width: w, height: h }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block" style={{ width: w, height: h }} />
      <div ref={textRef} className="textLayer absolute inset-0" />
    </div>
  );
}

const btn =
  "flex h-8 min-w-8 items-center justify-center rounded-lg border border-border bg-surface px-2 text-[13px] hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40";

export function ReaderWorkspace({ tool }: { tool: ToolConfig }) {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fitScale, setFitScale] = useState(1);
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [sizes, setSizes] = useState<Record<number, { width: number; height: number }>>({});
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<number[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [searching, setSearching] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let task: pdfjsLib.PDFDocumentLoadingTask | null = null;
    setError(null);
    setDoc(null);
    setSizes({});
    setCurrent(1);
    setPageInput("1");
    setQuery("");
    setMatches([]);
    (async () => {
      try {
        task = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
        const loaded = await task.promise;
        if (cancelled) return;
        const first = await loaded.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setSizes({ 1: { width: vp.width, height: vp.height } });
        setDoc(loaded);
      } catch (e) {
        if (cancelled) return;
        const locked = e instanceof Error && e.name === "PasswordException";
        setError(
          locked
            ? "This PDF is password protected. Remove the password with Protect & Unlock first, then open it here."
            : "That PDF couldn't be opened.",
        );
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [file]);

  // Fit-to-width follows the window.
  useEffect(() => {
    const el = scroller.current;
    const base = sizes[1];
    if (!el || !base) return;
    const update = () => setFitScale(Math.max(0.2, (el.clientWidth - 32) / base.width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc, sizes]);

  const scale = zoom === "fit" ? fitScale : zoom;
  const placeholder = sizes[1] ?? { width: 612, height: 792 };

  const register = useCallback((n: number, el: HTMLDivElement | null) => {
    if (el) pageEls.current.set(n, el);
    else pageEls.current.delete(n);
  }, []);
  const onSize = useCallback((n: number, size: { width: number; height: number }) => {
    setSizes((prev) => (prev[n]?.width === size.width && prev[n]?.height === size.height ? prev : { ...prev, [n]: size }));
  }, []);

  const goTo = useCallback((n: number) => {
    const target = pageEls.current.get(n);
    if (target && scroller.current) scroller.current.scrollTo({ top: target.offsetTop - 8, behavior: "auto" });
  }, []);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const probe = el.scrollTop + el.clientHeight * 0.25;
    let best = 1;
    for (const [n, page] of pageEls.current) {
      if (page.offsetTop <= probe && n >= best) best = n;
    }
    setCurrent(best);
    setPageInput(String(best));
  }, []);

  async function runSearch() {
    const needle = query.trim().toLowerCase();
    if (!doc || !needle) {
      setMatches([]);
      return;
    }
    setSearching(true);
    const found: number[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const text = content.items.map((i) => ("str" in i ? i.str : "")).join(" ").toLowerCase();
      let at = text.indexOf(needle);
      while (at !== -1) {
        found.push(n);
        at = text.indexOf(needle, at + needle.length);
      }
    }
    setMatches(found);
    setMatchIndex(0);
    setSearching(false);
    if (found.length) goTo(found[0]);
  }

  function step(delta: number) {
    if (!matches.length) return;
    const next = (matchIndex + delta + matches.length) % matches.length;
    setMatchIndex(next);
    goTo(matches[next]);
  }

  const numbers = useMemo(() => (doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : []), [doc]);

  if (!file) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mt-3.5 max-w-2xl">
          <FileDropZone accept={tool.accept} multiple={false} onFiles={(files) => files[0] && setFile(files[0])} />
        </div>
      </div>
    );
  }

  const zoomIndex = (dir: 1 | -1) => {
    const now = scale;
    const next = dir === 1 ? ZOOM_STEPS.find((z) => z > now + 0.01) : [...ZOOM_STEPS].reverse().find((z) => z < now - 0.01);
    if (next) setZoom(next);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-110px)] max-w-6xl flex-col px-8 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="max-w-[28ch] truncate text-[13px] font-semibold" title={file.name}>
          {file.name}
        </span>
        {doc && (
          <>
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Math.min(doc.numPages, Math.max(1, Number(pageInput) || 1));
                setPageInput(String(n));
                goTo(n);
              }}
            >
              <input
                aria-label="Page number"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                className="h-8 w-12 rounded-lg border border-border bg-surface px-2 text-center text-[13px]"
              />
              <span className="text-[13px] text-muted">of {doc.numPages}</span>
            </form>
            <button type="button" aria-label="Zoom out" className={btn} onClick={() => zoomIndex(-1)}>
              −
            </button>
            <span className="w-12 text-center font-mono text-[12px] text-muted">{Math.round(scale * 100)}%</span>
            <button type="button" aria-label="Zoom in" className={btn} onClick={() => zoomIndex(1)}>
              +
            </button>
            <button type="button" className={btn} onClick={() => setZoom("fit")} aria-pressed={zoom === "fit"}>
              Fit width
            </button>
            <form
              className="ml-auto flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch();
              }}
            >
              <input
                aria-label="Find in document"
                placeholder="Find…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 w-40 rounded-lg border border-border bg-surface px-2.5 text-[13px]"
              />
              <button type="button" aria-label="Previous match" className={btn} disabled={!matches.length} onClick={() => step(-1)}>
                ↑
              </button>
              <button type="button" aria-label="Next match" className={btn} disabled={!matches.length} onClick={() => step(1)}>
                ↓
              </button>
              <span className="w-24 text-[12px] text-muted" aria-live="polite">
                {searching ? "Searching…" : matches.length ? `${matchIndex + 1} of ${matches.length}` : query.trim() ? "No matches" : ""}
              </span>
            </form>
          </>
        )}
        <button
          type="button"
          className={btn}
          onClick={() => {
            setFile(null);
            setDoc(null);
          }}
        >
          Close
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger bg-danger-soft p-6 text-sm">{error}</div>
      ) : (
        <div
          ref={scroller}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-surface-2 p-4"
          aria-label={`Pages of ${file.name}, page ${current}`}
        >
          {doc ? (
            numbers.map((n) => (
              <PageView
                key={`${n}`}
                doc={doc}
                pageNumber={n}
                scale={scale}
                placeholder={sizes[n] ?? placeholder}
                query={query}
                onSize={onSize}
                register={register}
              />
            ))
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">Opening…</div>
          )}
        </div>
      )}
    </div>
  );
}
