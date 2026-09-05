/**
 * Bespoke workspace for the Sign & Fill tool: a scrollable page preview with
 * draggable/resizable elements, instead of the generic drop-zone + options
 * sidebar every other tool uses (ToolPage doesn't render a page canvas).
 */
import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { FileDropZone } from "@/components/FileDropZone";
import { ResultCard } from "@/components/ResultCard";
import type { ToolConfig } from "@/tools/ToolConfig";
import type { EngineResult } from "@/engines/types";
import { SignElementBox } from "./SignElementBox";
import { SignatureCapture } from "./SignatureCapture";
import { TEXT_COLORS, isImageElement, type SignElement } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PageInfo {
  index: number;
  dataUrl: string;
  widthPt: number;
  heightPt: number;
}

const DEFAULT_FONT_SIZE = 16;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayFormatted(): string {
  return new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function SignWorkspace({ tool }: { tool: ToolConfig }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elements, setElements] = useState<SignElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [capture, setCapture] = useState<"signature" | "initials" | null>(null);
  const [pxPerPt, setPxPerPt] = useState<Record<number, number>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const selected = elements.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPages([]);
    setElements([]);
    setSelectedId(null);

    (async () => {
      try {
        const bytes = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        const out: PageInfo[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2, (900 * (globalThis.devicePixelRatio || 1)) / base.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas 2D context unavailable.");
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          out.push({ index: n - 1, dataUrl: canvas.toDataURL("image/png"), widthPt: base.width, heightPt: base.height });
        }
        if (!cancelled) setPages(out);
      } catch {
        if (!cancelled) setLoadError("That PDF couldn't be opened for preview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  function measure(pageIndex: number, img: HTMLImageElement) {
    const widthPt = pages[pageIndex]?.widthPt;
    if (!widthPt) return;
    const ratio = img.clientWidth / widthPt;
    setPxPerPt((prev) => (prev[pageIndex] === ratio ? prev : { ...prev, [pageIndex]: ratio }));
  }

  function addImageElement(kind: "signature" | "initials", imageDataUrl: string) {
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight || 2.4;
      const wPct = kind === "signature" ? 0.28 : 0.12;
      const hPct = wPct / aspect;
      const el: SignElement = {
        id: newId(),
        kind,
        pageIndex: activePage,
        xPct: 0.35,
        yPct: 0.45,
        wPct,
        hPct,
        imageDataUrl,
      };
      setElements((prev) => [...prev, el]);
      setSelectedId(el.id);
    };
    img.src = imageDataUrl;
  }

  function addTextElement(kind: "text" | "date") {
    const el: SignElement = {
      id: newId(),
      kind,
      pageIndex: activePage,
      xPct: 0.35,
      yPct: 0.45,
      wPct: 0.25,
      hPct: 0.045,
      text: kind === "date" ? todayFormatted() : "Text",
      fontSize: DEFAULT_FONT_SIZE,
      color: "#000000",
    };
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  }

  function updateElement(id: string, patch: Partial<SignElement>) {
    setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as SignElement) : e)));
  }

  function deleteElement(id: string) {
    setElements((prev) => prev.filter((e) => e.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  async function runExport() {
    if (!file) return;
    setRunning(true);
    setRunError(null);
    try {
      const engineResult = await tool.engine({ files: [file], options: { elements } });
      setResult(engineResult);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setFile(null);
    setPages([]);
    setElements([]);
    setSelectedId(null);
    setResult(null);
    setRunError(null);
  }

  const elementCount = elements.length;

  if (!file) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mt-3.5 max-w-2xl">
          <FileDropZone accept={tool.accept} multiple={false} onFiles={(files) => files[0] && setFile(files[0])} />
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mt-3.5 max-w-2xl">
          <ResultCard result={result} onReset={reset} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mt-3.5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
        {/* Page preview */}
        <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-surface-2 p-5">
          {loading && <p className="text-center text-[13px] text-muted">Reading pages…</p>}
          {loadError && <p className="text-center text-[13px] text-danger">{loadError}</p>}
          {pages.map((page) => (
            <div
              key={page.index}
              ref={(node) => {
                pageRefs.current[page.index] = node;
              }}
              onPointerDown={() => setActivePage(page.index)}
              onFocus={() => setActivePage(page.index)}
              className={`relative mx-auto w-full max-w-[640px] shrink-0 overflow-hidden rounded-lg border bg-white shadow-sm ${
                activePage === page.index ? "border-accent" : "border-border"
              }`}
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedId(null);
              }}
            >
              <img
                src={page.dataUrl}
                alt={`Page ${page.index + 1}`}
                className="block w-full select-none"
                draggable={false}
                onLoad={(e) => measure(page.index, e.currentTarget)}
              />
              <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                Page {page.index + 1}
              </div>
              <div className="pointer-events-auto absolute inset-0">
                {elements
                  .filter((e) => e.pageIndex === page.index)
                  .map((e) => (
                    <SignElementBox
                      key={e.id}
                      element={e}
                      pxPerPt={pxPerPt[page.index] ?? 1.33}
                      selected={selectedId === e.id}
                      onSelect={() => {
                        setSelectedId(e.id);
                        setActivePage(page.index);
                      }}
                      onUpdate={(patch) => updateElement(e.id, patch)}
                      onDelete={() => deleteElement(e.id)}
                      containerRef={{ current: pageRefs.current[page.index] }}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <div className="sticky top-[82px] flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Add to page {activePage + 1}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCapture("signature")} className="rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium hover:bg-surface-3">
                Signature
              </button>
              <button type="button" onClick={() => setCapture("initials")} className="rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium hover:bg-surface-3">
                Initials
              </button>
              <button type="button" onClick={() => addTextElement("text")} className="rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium hover:bg-surface-3">
                Text
              </button>
              <button type="button" onClick={() => addTextElement("date")} className="rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium hover:bg-surface-3">
                Date
              </button>
            </div>
          </div>

          {selected && !isImageElement(selected) && (
            <div className="rounded-[10px] border border-border bg-surface-2 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Edit {selected.kind}</div>
              <input
                type="text"
                value={selected.text}
                onChange={(e) => updateElement(selected.id, { text: e.target.value })}
                className="mt-2 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px]"
              />
              <div className="mt-2 flex items-center gap-2">
                <label className="text-[12px] text-muted">Size</label>
                <input
                  type="range"
                  min={8}
                  max={48}
                  value={selected.fontSize}
                  onChange={(e) => updateElement(selected.id, { fontSize: Number(e.target.value) })}
                  className="flex-1"
                />
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateElement(selected.id, { color: c })}
                    className={`size-5.5 rounded-full border-2 ${selected.color === c ? "border-accent" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Elements ({elementCount})
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {elements.map((e) => (
                <li
                  key={e.id}
                  onClick={() => {
                    setSelectedId(e.id);
                    setActivePage(e.pageIndex);
                  }}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-[12.5px] ${
                    selectedId === e.id ? "border-accent bg-accent-soft" : "border-border bg-surface-2"
                  }`}
                >
                  <span className="capitalize">
                    {e.kind} · p{e.pageIndex + 1}
                  </span>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      deleteElement(e.id);
                    }}
                    className="text-muted hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {elements.length === 0 && <li className="text-[12.5px] text-muted">Nothing placed yet.</li>}
            </ul>
          </div>

          {runError && <p className="text-[12.5px] text-danger">{runError}</p>}

          <button
            type="button"
            onClick={runExport}
            disabled={running || elementCount === 0}
            className="flex h-10 w-full items-center justify-center rounded-[11px] bg-accent text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
          >
            {running ? "Working…" : "Export signed PDF"}
          </button>
          <button type="button" onClick={reset} className="text-[12.5px] text-muted hover:text-text">
            Start over
          </button>
        </div>
      </div>

      {capture && (
        <SignatureCapture
          kind={capture}
          onClose={() => setCapture(null)}
          onPick={(dataUrl) => {
            addImageElement(capture, dataUrl);
            setCapture(null);
          }}
        />
      )}
    </div>
  );
}

export default SignWorkspace;
