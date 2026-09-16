/**
 * Bespoke workspace for the Redact tool: a scrollable page preview with
 * draggable/resizable black boxes, instead of the generic drop-zone +
 * options sidebar every other tool uses (ToolPage doesn't render a page
 * canvas). Mirrors SignWorkspace's structure.
 */
import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { FileDropZone } from "@/components/FileDropZone";
import { ResultCard } from "@/components/ResultCard";
import type { ToolConfig } from "@/tools/ToolConfig";
import type { EngineResult } from "@/engines/types";
import { RedactBoxElement } from "./RedactBoxElement";
import type { RedactBox, RedactMode } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PageInfo {
  index: number;
  dataUrl: string;
  widthPt: number;
  heightPt: number;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MODE_COPY: Record<RedactMode, string> = {
  visual:
    "Draws a black box over each area. The PDF's original text and images are still underneath — recoverable by anyone who knows to look.",
  true:
    "Flattens every page that has a box to a picture, so nothing underneath survives. Only pages with a box are affected; the rest of the document stays fully searchable.",
};

export function RedactWorkspace({ tool }: { tool: ToolConfig }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [boxes, setBoxes] = useState<RedactBox[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [mode, setMode] = useState<RedactMode>("visual");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPages([]);
    setBoxes([]);
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

  function addBox() {
    const b: RedactBox = { id: newId(), pageIndex: activePage, xPct: 0.3, yPct: 0.4, wPct: 0.3, hPct: 0.1 };
    setBoxes((prev) => [...prev, b]);
    setSelectedId(b.id);
  }

  function updateBox(id: string, patch: Partial<Pick<RedactBox, "xPct" | "yPct" | "wPct" | "hPct">>) {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function deleteBox(id: string) {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  async function runExport() {
    if (!file) return;
    setRunning(true);
    setRunError(null);
    try {
      const engineResult = await tool.engine({ files: [file], options: { mode, boxes } });
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
    setBoxes([]);
    setSelectedId(null);
    setResult(null);
    setRunError(null);
  }

  const boxCount = boxes.length;

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
              />
              <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                Page {page.index + 1}
              </div>
              <div className="pointer-events-auto absolute inset-0">
                {boxes
                  .filter((b) => b.pageIndex === page.index)
                  .map((b) => (
                    <RedactBoxElement
                      key={b.id}
                      box={b}
                      selected={selectedId === b.id}
                      onSelect={() => {
                        setSelectedId(b.id);
                        setActivePage(page.index);
                      }}
                      onUpdate={(patch) => updateBox(b.id, patch)}
                      onDelete={() => deleteBox(b.id)}
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
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Mode</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("visual")}
                className={`rounded-[10px] border px-3 py-2 text-[13px] font-medium ${
                  mode === "visual" ? "border-accent bg-accent-soft" : "border-border bg-surface-2 hover:bg-surface-3"
                }`}
              >
                Visual cover-up
              </button>
              <button
                type="button"
                onClick={() => setMode("true")}
                className={`rounded-[10px] border px-3 py-2 text-[13px] font-medium ${
                  mode === "true" ? "border-accent bg-accent-soft" : "border-border bg-surface-2 hover:bg-surface-3"
                }`}
              >
                True redact
              </button>
            </div>
            <p className="mt-2 text-[12px] text-muted">{MODE_COPY[mode]}</p>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Add to page {activePage + 1}</div>
            <button
              type="button"
              onClick={addBox}
              className="mt-2 w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium hover:bg-surface-3"
            >
              Add box
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Boxes ({boxCount})
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {boxes.map((b) => (
                <li
                  key={b.id}
                  onClick={() => {
                    setSelectedId(b.id);
                    setActivePage(b.pageIndex);
                  }}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-[12.5px] ${
                    selectedId === b.id ? "border-accent bg-accent-soft" : "border-border bg-surface-2"
                  }`}
                >
                  <span>Box · p{b.pageIndex + 1}</span>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      deleteBox(b.id);
                    }}
                    className="text-muted hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {boxes.length === 0 && <li className="text-[12.5px] text-muted">Nothing placed yet.</li>}
            </ul>
          </div>

          {runError && <p className="text-[12.5px] text-danger">{runError}</p>}

          <button
            type="button"
            onClick={runExport}
            disabled={running || boxCount === 0}
            className="flex h-10 w-full items-center justify-center rounded-[11px] bg-accent text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
          >
            {running ? "Working…" : "Export redacted PDF"}
          </button>
          <button type="button" onClick={reset} className="text-[12.5px] text-muted hover:text-text">
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}

export default RedactWorkspace;
