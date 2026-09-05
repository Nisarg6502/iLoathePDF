/**
 * The page canvas for the Sign & Fill tool: loads a PDF's pages and lets
 * placed elements (signature/initials/text/date) be dragged and resized on
 * top of them.
 *
 * Owns the pdf.js document lifecycle the same way OrganizeCanvas does, so it
 * gets torn down when the file changes or the route unmounts.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { SignElementBox } from "./SignElementBox";
import { PdfPreviewDocument, isCancellation } from "@/lib/pdfPreview";
import { JobError, readFileBytes } from "@/lib/jobs";
import type { SignElement } from "@/lib/signTypes";

export interface SignCanvasProps {
  file: { id: string; path: string; name: string; blob?: File };
  elements: SignElement[];
  activePageIndex: number;
  onActivePageChange: (index: number) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Pick<SignElement, "xPct" | "yPct" | "wPct" | "hPct">>) => void;
  onDelete: (id: string) => void;
  className?: string;
}

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; doc: PdfPreviewDocument }
  | { phase: "error"; message: string };

const RENDER_WIDTH = 680;

export function SignCanvas({
  file,
  elements,
  activePageIndex,
  onActivePageChange,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  className,
}: SignCanvasProps) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [pxPerPt, setPxPerPt] = useState<Record<number, number>>({});
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    let opened: PdfPreviewDocument | null = null;

    setState({ phase: "loading" });
    setUrls({});
    setPxPerPt({});

    (async () => {
      try {
        const bytes = await readFileBytes(file);
        const doc = await PdfPreviewDocument.load(bytes);
        if (cancelled) {
          doc.destroy();
          return;
        }
        opened = doc;
        setState({ phase: "ready", doc });
        for (let n = 1; n <= doc.pageCount; n++) {
          const dims = await doc.dimensions(n);
          const width = Math.min(RENDER_WIDTH, dims.width);
          const url = await doc.renderPage(n, { width });
          if (cancelled) return;
          setUrls((prev) => ({ ...prev, [n - 1]: url }));
        }
      } catch (err) {
        if (cancelled || isCancellation(err)) return;
        const message =
          err instanceof JobError ? err.message : "That PDF could not be opened for preview.";
        setState({ phase: "error", message });
      }
    })();

    return () => {
      cancelled = true;
      opened?.destroy();
    };
  }, [file]);

  function measure(pageIndex: number, img: HTMLImageElement) {
    if (state.phase !== "ready") return;
    void state.doc.dimensions(pageIndex + 1).then((dims) => {
      const ratio = img.clientWidth / dims.width;
      setPxPerPt((prev) => (prev[pageIndex] === ratio ? prev : { ...prev, [pageIndex]: ratio }));
    });
  }

  if (state.phase === "loading") {
    return (
      <div className={className}>
        <div className="flex items-center justify-center gap-2 rounded-card border border-border bg-surface px-5 py-10 text-[14px] text-muted">
          <Loader2 className="size-4 animate-spin" />
          Reading pages…
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className={className}>
        <div className="rounded-card border border-danger/40 bg-surface px-5 py-6 text-center">
          <p className="text-[14px] font-medium text-text">Preview unavailable</p>
          <p className="mt-1 text-[14px] text-muted">{state.message}</p>
        </div>
      </div>
    );
  }

  const pageCount = state.doc.pageCount;

  return (
    <div className={className}>
      <div className="mx-auto flex max-w-[720px] flex-col gap-4">
        {Array.from({ length: pageCount }, (_, pageIndex) => (
          <div
            key={pageIndex}
            ref={(node) => {
              pageRefs.current[pageIndex] = node;
            }}
            onPointerDown={() => onActivePageChange(pageIndex)}
            className={`relative shrink-0 overflow-hidden rounded-card border bg-white shadow-sm ${
              activePageIndex === pageIndex ? "border-accent" : "border-border"
            }`}
            onClick={(e) => {
              if (e.target === e.currentTarget) onSelect(null);
            }}
          >
            {urls[pageIndex] ? (
              <img
                src={urls[pageIndex]}
                alt={`Page ${pageIndex + 1}`}
                className="block w-full select-none"
                draggable={false}
                onLoad={(e) => measure(pageIndex, e.currentTarget)}
              />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-[13px] text-muted">
                Rendering page {pageIndex + 1}…
              </div>
            )}
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
              Page {pageIndex + 1}
            </div>
            <div className="pointer-events-auto absolute inset-0">
              {elements
                .filter((el) => el.pageIndex === pageIndex)
                .map((el) => (
                  <SignElementBox
                    key={el.id}
                    element={el}
                    pxPerPt={pxPerPt[pageIndex] ?? 1.33}
                    selected={selectedId === el.id}
                    onSelect={() => {
                      onSelect(el.id);
                      onActivePageChange(pageIndex);
                    }}
                    onUpdate={(patch) => onUpdate(el.id, patch)}
                    onDelete={() => onDelete(el.id)}
                    containerRef={{ current: pageRefs.current[pageIndex] }}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SignCanvas;
