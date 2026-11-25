/**
 * Organize pages: a grid of page thumbnails. Click to select (Shift for a
 * range, Ctrl/Cmd to add), drag the selection to a new place, or use "Move to
 * position". Double-click (or the magnifier) opens a large preview, so you can
 * see exactly what you are removing. Removed pages stay in the grid, dimmed,
 * until you save.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { FileDropZone } from "@/components/FileDropZone";
import { ResultCard } from "@/components/ResultCard";
import type { ToolConfig } from "@/tools/ToolConfig";
import type { EngineResult } from "@/engines/types";
import { tr, useTranslation } from "@iloathepdf/i18n";
import {
  initialPages,
  moveSelected,
  moveSelectedTo,
  rangeBetween,
  rotateSelected,
  toEngineOptions,
  toggleRemoved,
  type OrganizePage,
} from "./model";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type Doc = pdfjsLib.PDFDocumentProxy;

/** Renders one page at a width, rotated, to an image URL. Cached; one render at a time. */
function useRenderer(doc: Doc | null) {
  const cache = useRef(new Map<string, Promise<string>>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    cache.current = new Map();
  }, [doc]);
  return (index: number, rotate: number, width: number): Promise<string> => {
    if (!doc) return Promise.reject(new Error("no document"));
    const key = `${index}:${rotate}:${width}`;
    let hit = cache.current.get(key);
    if (!hit) {
      hit = queue.current.then(async () => {
        const page = await doc.getPage(index + 1);
        const rotation = (page.rotate + rotate) % 360;
        const base = page.getViewport({ scale: 1, rotation });
        const viewport = page.getViewport({ scale: width / base.width, rotation });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable.");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        return canvas.toDataURL("image/jpeg", 0.85);
      });
      queue.current = hit.catch(() => {});
      cache.current.set(key, hit);
    }
    return hit;
  };
}

function PageImage({ render, page, width, className, fit }: { render: ReturnType<typeof useRenderer>; page: OrganizePage; width: number; className?: string; fit?: boolean }) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return setVisible(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "400px" });
    io.observe(node);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    render(page.index, page.rotate, width).then((url) => live && setSrc(url), () => {});
    return () => {
      live = false;
    };
  }, [visible, render, page.index, page.rotate, width]);
  return (
    <div ref={ref} className={`grid place-items-center ${className ?? ""}`}>
      {src ? (
        <img src={src} alt={t("Page {{page}}", { page: page.index + 1 })} draggable={false} className={`block max-w-full select-none shadow-sm ${fit ? "max-h-[calc(100dvh-120px)] w-auto" : "max-h-full"}`} />
      ) : (
        <div className="aspect-[3/4] w-full animate-pulse rounded bg-surface-3" />
      )}
    </div>
  );
}

const THUMB_PX = Math.round(200 * Math.min(2, globalThis.devicePixelRatio || 1));

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  x: number;
  y: number;
  before: number | null;
  timer?: number;
}

const BTN = "rounded-[9px] border border-border bg-surface-2 px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-surface-3 disabled:opacity-40";

export function OrganizeWorkspace({ tool }: { tool: ToolConfig }) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pages, setPages] = useState<OrganizePage[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState("1");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const tiles = useRef(new Map<number, HTMLDivElement>());
  const render = useRenderer(doc);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let task: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    setLoadError(null);
    setDoc(null);
    setPages([]);
    setSelected(new Set());
    (async () => {
      try {
        task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const opened = await task.promise;
        if (cancelled) return;
        setDoc(opened);
        setPages(initialPages(opened.numPages));
      } catch {
        if (!cancelled) setLoadError(tr("That PDF couldn't be opened for preview."));
      }
    })();
    return () => {
      cancelled = true;
      // Frees the pdf.js worker too.
      void task?.destroy();
    };
  }, [file]);

  // --- selection ------------------------------------------------------------
  function select(index: number, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    if (e.shiftKey && anchor !== null) {
      setSelected(rangeBetween(pages, anchor, index));
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      setSelected(next);
    } else {
      setSelected(new Set([index]));
    }
    setAnchor(index);
  }

  // --- drag -------------------------------------------------------------------
  /** Which slot the pointer is over: before the tile under it, or after it if on its right half. */
  function slotAt(x: number, y: number): number | null {
    let best: { slot: number; dist: number } | null = null;
    pages.forEach((p, i) => {
      const r = tiles.current.get(p.index)?.getBoundingClientRect();
      if (!r) return;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dist = dy * 4 + dx;
      if (!best || dist < best.dist) best = { slot: x > r.left + r.width / 2 ? i + 1 : i, dist };
    });
    return (best as { slot: number } | null)?.slot ?? null;
  }

  function onTilePointerDown(e: ReactPointerEvent, page: OrganizePage) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const d: Drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, x: e.clientX, y: e.clientY, before: null };
    if (e.pointerType === "touch") {
      // Touch: hold still to pick up, so a swipe still scrolls the page.
      d.timer = window.setTimeout(() => {
        setSelected((s) => (s.has(page.index) ? s : new Set([page.index])));
        setDrag((cur) => (cur && cur.pointerId === d.pointerId ? { ...cur, active: true } : cur));
      }, 350);
    }
    setDrag(d);
  }

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const far = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6;
      if (!drag.active) {
        if (!far) return;
        if (e.pointerType === "touch") {
          window.clearTimeout(drag.timer);
          setDrag(null);
          return;
        }
        // Dragging a page that isn't selected picks up just that page.
        const tile = [...tiles.current.entries()].find(([, el]) => el.contains(document.elementFromPoint(drag.startX, drag.startY)))?.[0];
        if (tile !== undefined && !selected.has(tile)) setSelected(new Set([tile]));
      }
      if (e.clientY < 60) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
      setDrag({ ...drag, active: true, x: e.clientX, y: e.clientY, before: slotAt(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      window.clearTimeout(drag.timer);
      if (drag.active && drag.before !== null) setPages((p) => moveSelected(p, selected, drag.before!));
      setDrag(null);
    };
    const noScroll = (e: TouchEvent) => drag.active && e.preventDefault();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("touchmove", noScroll, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("touchmove", noScroll);
    };
  });

  // --- keyboard ---------------------------------------------------------------
  function onTileKey(e: KeyboardEvent, page: OrganizePage, i: number) {
    const focus = (j: number) => pages[j] && tiles.current.get(pages[j].index)?.focus();
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const j = i + (e.key === "ArrowRight" ? 1 : -1);
      if (e.altKey) {
        const sel = selected.has(page.index) ? selected : new Set([page.index]);
        setPages((p) => moveSelected(p, sel, e.key === "ArrowRight" ? i + 2 : i - 1));
        setTimeout(() => tiles.current.get(page.index)?.focus());
      } else focus(j);
    } else if (e.key === " ") {
      e.preventDefault();
      select(page.index, { shiftKey: e.shiftKey, ctrlKey: true, metaKey: false });
    } else if (e.key === "Enter") setPreview(page.index);
    else if (e.key === "Delete" || e.key === "Backspace") setPages((p) => toggleRemoved(p, selected.size ? selected : new Set([page.index])));
  }

  const sel = selected;
  const kept = pages.filter((p) => !p.removed).length;
  const selectionRemoved = pages.some((p) => sel.has(p.index)) && pages.filter((p) => sel.has(p.index)).every((p) => p.removed);

  async function save() {
    if (!file) return;
    setRunning(true);
    setRunError(null);
    try {
      setResult(await tool.engine({ files: [file], options: toEngineOptions(pages) }));
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setFile(null);
    setDoc(null);
    setPages([]);
    setResult(null);
    setRunError(null);
    setPreview(null);
  }

  if (!file) {
    return (
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8">
        <div className="mt-3.5 max-w-2xl">
          <FileDropZone accept={tool.accept} multiple={false} onFiles={(files) => files[0] && setFile(files[0])} />
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8">
        <div className="mt-3.5 max-w-2xl">
          <ResultCard result={result} onReset={reset} />
        </div>
      </div>
    );
  }

  const previewPos = preview === null ? -1 : pages.findIndex((p) => p.index === preview);
  const previewPage = previewPos >= 0 ? pages[previewPos] : null;

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8">
      <div className="mt-3.5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_280px]">
        <div className="rounded-2xl border border-border bg-surface-2 p-4">
          <div className="sticky top-[62px] z-10 -mx-4 -mt-4 mb-4 flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-border bg-surface-2/95 px-4 py-3 backdrop-blur">
            <span className="mr-1 text-[12.5px] font-semibold">{t("{{count}} selected", { count: sel.size })}</span>
            <button type="button" className={BTN} onClick={() => setSelected(new Set(pages.map((p) => p.index)))}>{t("Select all")}</button>
            <button type="button" className={BTN} disabled={!sel.size} onClick={() => setSelected(new Set())}>{t("Clear selection")}</button>
            <button type="button" className={BTN} disabled={!sel.size} onClick={() => setPages((p) => rotateSelected(p, sel, -90))}>⟲ {t("Rotate left")}</button>
            <button type="button" className={BTN} disabled={!sel.size} onClick={() => setPages((p) => rotateSelected(p, sel, 90))}>⟳ {t("Rotate right")}</button>
            <button type="button" className={`${BTN} ${selectionRemoved ? "" : "text-danger"}`} disabled={!sel.size} onClick={() => setPages((p) => toggleRemoved(p, sel))}>
              {selectionRemoved ? t("Keep") : t("Remove")}
            </button>
            <span className="flex items-center gap-1.5">
              <label htmlFor="org-move" className="text-[12.5px] text-muted">{t("Move to position")}</label>
              <input id="org-move" type="number" min={1} max={pages.length} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-8 w-16 rounded-[8px] border border-border bg-bg px-2 text-[12.5px]" />
              <button type="button" className={BTN} disabled={!sel.size} onClick={() => setPages((p) => moveSelectedTo(p, sel, Number(moveTo) || 1))}>{t("Move")}</button>
            </span>
          </div>
          <p className="mb-3 text-[12px] text-muted">{t("Click a page to select it (Shift or Ctrl to select more), then drag to a new place. Double-click to see it large. On a phone, hold a page to pick it up.")}</p>

          {loadError && <p className="text-[13px] text-danger">{loadError}</p>}
          {!doc && !loadError && <p className="text-[13px] text-muted">{t("Reading pages…")}</p>}

          <div role="listbox" aria-multiselectable="true" aria-label={t("Pages")} className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {pages.map((page, i) => {
              const isSel = sel.has(page.index);
              const lifted = drag?.active && isSel;
              return (
                <div
                  key={page.index}
                  ref={(el) => {
                    if (el) tiles.current.set(page.index, el);
                    else tiles.current.delete(page.index);
                  }}
                  role="option"
                  aria-selected={isSel}
                  tabIndex={0}
                  onPointerDown={(e) => onTilePointerDown(e, page)}
                  onClick={(e) => !drag?.active && select(page.index, e)}
                  onDoubleClick={() => setPreview(page.index)}
                  onKeyDown={(e) => onTileKey(e, page, i)}
                  className={`group relative flex cursor-grab flex-col gap-1.5 rounded-xl border-2 bg-surface p-2 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-accent ${
                    isSel ? "border-accent bg-accent-soft" : "border-transparent hover:border-border-hi"
                  } ${lifted ? "opacity-40" : ""}`}
                >
                  {drag?.active && drag.before === i && <span className="absolute -left-2 top-2 bottom-2 w-1 rounded bg-accent" />}
                  {drag?.active && drag.before === i + 1 && i === pages.length - 1 && <span className="absolute -right-2 top-2 bottom-2 w-1 rounded bg-accent" />}
                  <div className="relative">
                    <PageImage render={render} page={page} width={THUMB_PX} className={`h-[150px] ${page.removed ? "opacity-30 grayscale" : ""}`} />
                    {page.removed && (
                      <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-fit rounded bg-danger px-1.5 py-0.5 text-[10.5px] font-semibold text-white">{t("Will be removed")}</span>
                    )}
                    <button
                      type="button"
                      aria-label={t("Preview page {{page}}", { page: page.index + 1 })}
                      onClick={() => setPreview(page.index)}
                      className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="font-mono text-muted">{i + 1}</span>
                    <span className={page.removed ? "text-faint line-through" : ""}>{t("Page {{page}}", { page: page.index + 1 })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sticky top-[82px] flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="text-[13px]">{t("{{kept}} of {{total}} pages kept", { kept, total: pages.length })}</div>
          {pages.some((p) => p.removed) && (
            <div className="text-[12px] text-muted">
              {t("Removing: {{pages}}", { pages: pages.filter((p) => p.removed).map((p) => p.index + 1).join(", ") })}
            </div>
          )}
          {runError && <p className="text-[12.5px] text-danger">{runError}</p>}
          <button
            type="button"
            onClick={save}
            disabled={running || !doc || kept === 0}
            className="flex h-10 w-full items-center justify-center rounded-[11px] bg-accent text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
          >
            {running ? t("Working…") : t("Save PDF")}
          </button>
          <button type="button" onClick={() => setPages(initialPages(pages.length))} className="text-[12.5px] text-muted hover:text-text">{t("Undo all changes")}</button>
          <button type="button" onClick={reset} className="text-[12.5px] text-muted hover:text-text">{t("Start over")}</button>
        </div>
      </div>

      {drag?.active && (
        <div className="pointer-events-none fixed z-50 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-semibold text-on-accent shadow-lg" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {t("{{count}} pages", { count: sel.size })}
        </div>
      )}

      {previewPage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Page {{page}}", { page: previewPage.index + 1 })}
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3 sm:p-6"
          onClick={(e) => e.target === e.currentTarget && setPreview(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPreview(null);
            if (e.key === "ArrowRight" && pages[previewPos + 1]) setPreview(pages[previewPos + 1].index);
            if (e.key === "ArrowLeft" && pages[previewPos - 1]) setPreview(pages[previewPos - 1].index);
          }}
          ref={(el) => el?.focus()}
          tabIndex={-1}
        >
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 pb-3 text-white">
            <span className="text-[14px] font-semibold">
              {t("Page {{page}}", { page: previewPage.index + 1 })} · {t("position {{pos}} of {{total}}", { pos: previewPos + 1, total: pages.length })}
            </span>
            {previewPage.removed && <span className="rounded bg-danger px-1.5 py-0.5 text-[11.5px] font-semibold">{t("Will be removed")}</span>}
            <span className="flex-1" />
            <button type="button" className={BTN + " text-text"} disabled={previewPos <= 0} onClick={() => setPreview(pages[previewPos - 1].index)}>← {t("Previous")}</button>
            <button type="button" className={BTN + " text-text"} disabled={previewPos >= pages.length - 1} onClick={() => setPreview(pages[previewPos + 1].index)}>{t("Next")} →</button>
            <button type="button" className={BTN + " text-text"} onClick={() => setPages((p) => rotateSelected(p, new Set([previewPage.index]), 90))}>⟳ {t("Rotate right")}</button>
            <button type="button" className={`${BTN} ${previewPage.removed ? "text-text" : "text-danger"}`} onClick={() => setPages((p) => toggleRemoved(p, new Set([previewPage.index])))}>
              {previewPage.removed ? t("Keep") : t("Remove")}
            </button>
            <button type="button" aria-label={t("Close")} className={BTN + " text-text"} onClick={() => setPreview(null)}>✕</button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto" onClick={(e) => e.target === e.currentTarget && setPreview(null)}>
            <PageImage
              key={`${previewPage.index}:${previewPage.rotate}`}
              render={render}
              page={previewPage}
              fit
              width={Math.round(Math.min(1400, window.innerWidth * (globalThis.devicePixelRatio || 1)))}
              className={`mx-auto h-full max-w-4xl ${previewPage.removed ? "opacity-40 grayscale" : ""}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default OrganizeWorkspace;
