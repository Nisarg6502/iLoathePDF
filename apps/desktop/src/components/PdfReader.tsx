/**
 * PDF Reader: a continuous-scroll viewer for the desktop app. Pages render
 * lazily (only those near the viewport hold an image), with zoom, a page box
 * and find-in-document. Pages are drawn as images, so text can be searched
 * but not selected here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PdfPreviewDocument, isCancellation, type PageDimensions } from "@/lib/pdfPreview";
import { readFileBytes } from "@/lib/jobs";
import type { PickedFile } from "@/components/FileDropZone";

type Zoom = "fit" | number;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

const btn =
  "flex h-8 min-w-8 items-center justify-center rounded-lg border border-border bg-surface px-2 text-[13px] text-text hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40";

function ReaderPage({
  doc,
  pageNumber,
  scale,
  placeholder,
  onDimensions,
  register,
}: {
  doc: PdfPreviewDocument;
  pageNumber: number;
  scale: number;
  placeholder: PageDimensions;
  onDimensions: (n: number, d: PageDimensions) => void;
  register: (n: number, el: HTMLDivElement | null) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  const width = Math.round(placeholder.width * scale);
  const height = Math.round(placeholder.height * scale);

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
    if (!visible) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const dims = await doc.dimensions(pageNumber);
        if (cancelled) return;
        onDimensions(pageNumber, dims);
        const rotation = await doc.rotationOf(pageNumber);
        const shown = await doc.renderPage(pageNumber, { width: Math.round(dims.width * scale), rotation });
        if (!cancelled) setUrl(shown);
      } catch (err) {
        if (!isCancellation(err)) setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      // The page scrolled away or was re-zoomed: drop its bitmap so a long document stays light.
      doc.forget(pageNumber, Math.round(placeholder.width * scale));
    };
  }, [visible, doc, pageNumber, scale, onDimensions, placeholder.width]);

  return (
    <div
      ref={holder}
      data-page={pageNumber}
      className="relative mx-auto mb-4 bg-white shadow-[0_1px_8px_rgba(0,0,0,0.25)]"
      style={{ width, height }}
    >
      {url ? <img src={url} alt={`Page ${pageNumber}`} width={width} height={height} className="block" draggable={false} /> : null}
    </div>
  );
}

export function PdfReader({ file, onClose }: { file: PickedFile; onClose: () => void }) {
  const [doc, setDoc] = useState<PdfPreviewDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fitScale, setFitScale] = useState(1);
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [dims, setDims] = useState<Record<number, PageDimensions>>({});
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<number[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [searching, setSearching] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    let cancelled = false;
    let loaded: PdfPreviewDocument | null = null;
    setError(null);
    setDoc(null);
    setDims({});
    setCurrent(1);
    setPageInput("1");
    setQuery("");
    setMatches([]);
    (async () => {
      try {
        loaded = await PdfPreviewDocument.load(await readFileBytes(file));
        if (cancelled) {
          loaded.destroy();
          return;
        }
        const first = await loaded.dimensions(1);
        setDims({ 1: first });
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
      loaded?.destroy();
    };
  }, [file]);

  const first = dims[1];
  useEffect(() => {
    const el = scroller.current;
    if (!el || !first) return;
    const update = () => setFitScale(Math.max(0.2, (el.clientWidth - 32) / first.width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc, first]);

  const scale = zoom === "fit" ? fitScale : zoom;
  const placeholder = first ?? { width: 612, height: 792, aspect: 612 / 792 };

  const register = useCallback((n: number, el: HTMLDivElement | null) => {
    if (el) pageEls.current.set(n, el);
    else pageEls.current.delete(n);
  }, []);
  const onDimensions = useCallback((n: number, d: PageDimensions) => {
    setDims((prev) => (prev[n]?.width === d.width && prev[n]?.height === d.height ? prev : { ...prev, [n]: d }));
  }, []);

  const goTo = useCallback((n: number) => {
    const target = pageEls.current.get(n);
    if (target && scroller.current) scroller.current.scrollTo({ top: target.offsetTop - 8 });
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
    for (let n = 1; n <= doc.pageCount; n++) {
      const text = (await doc.pageText(n)).toLowerCase();
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

  const zoomBy = (dir: 1 | -1) => {
    const next =
      dir === 1 ? ZOOM_STEPS.find((z) => z > scale + 0.01) : [...ZOOM_STEPS].reverse().find((z) => z < scale - 0.01);
    if (next) setZoom(next);
  };

  const numbers = useMemo(() => (doc ? Array.from({ length: doc.pageCount }, (_, i) => i + 1) : []), [doc]);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="max-w-[28ch] truncate text-[13px] font-semibold text-text" title={file.name}>
          {file.name}
        </span>
        {doc && (
          <>
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Math.min(doc.pageCount, Math.max(1, Number(pageInput) || 1));
                setPageInput(String(n));
                goTo(n);
              }}
            >
              <input
                aria-label="Page number"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                className="h-8 w-12 rounded-lg border border-border bg-surface px-2 text-center text-[13px] text-text"
              />
              <span className="text-[13px] text-muted">of {doc.pageCount}</span>
            </form>
            <button type="button" aria-label="Zoom out" className={btn} onClick={() => zoomBy(-1)}>
              −
            </button>
            <span className="w-12 text-center font-mono text-[12px] text-muted">{Math.round(scale * 100)}%</span>
            <button type="button" aria-label="Zoom in" className={btn} onClick={() => zoomBy(1)}>
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
                className="h-8 w-40 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text"
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
        <button type="button" className={btn} onClick={onClose}>
          Close
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger bg-danger-soft p-6 text-sm text-text">{error}</div>
      ) : (
        <div
          ref={scroller}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-surface-2 p-4"
          aria-label={`Pages of ${file.name}, page ${current}`}
        >
          {doc ? (
            numbers.map((n) => (
              <ReaderPage
                key={n}
                doc={doc}
                pageNumber={n}
                scale={scale}
                placeholder={dims[n] ?? placeholder}
                onDimensions={onDimensions}
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
