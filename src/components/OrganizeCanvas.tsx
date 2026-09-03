/**
 * The page canvas for the Organize tool: loads a PDF's pages as thumbnails and
 * lets them be reordered, rotated and dropped.
 *
 * It owns the pdf.js document lifecycle so `PageThumbnailGrid` can stay a pure
 * controlled component, and so the document is destroyed when the file changes
 * or the route unmounts (a leaked pdf.js worker will eventually freeze the app).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { PageThumbnailGrid, type PdfPageItem } from "./PageThumbnailGrid";
import { PdfPreviewDocument, isCancellation } from "@/lib/pdfPreview";
import { JobError, readFileBytes } from "@/lib/jobs";

export interface OrganizeCanvasProps {
  /** The picked file: a path under Tauri, plus a Blob in the browser. */
  file: { id: string; path: string; name: string; blob?: File };
  pages: PdfPageItem[];
  onChange: (pages: PdfPageItem[]) => void;
  className?: string;
}

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; doc: PdfPreviewDocument }
  | { phase: "error"; message: string };

export function OrganizeCanvas({ file, pages, onChange, className }: OrganizeCanvasProps) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [selected, setSelected] = useState<string[]>([]);
  // onChange identity changes every render in the parent; keep it out of the
  // effect's deps so loading does not restart on each keystroke elsewhere.
  const emit = useRef(onChange);
  emit.current = onChange;

  useEffect(() => {
    let cancelled = false;
    let opened: PdfPreviewDocument | null = null;

    setState({ phase: "loading" });
    setSelected([]);

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
        emit.current(
          Array.from({ length: doc.pageCount }, (_, i) => ({
            id: `${file.id}:${i + 1}`,
            docId: file.id,
            pageNumber: i + 1,
            rotation: 0,
            docLabel: file.name,
          })),
        );
      } catch (err) {
        if (cancelled || isCancellation(err)) return;
        const message =
          err instanceof JobError
            ? err.message
            : "That PDF could not be opened for preview. You can still run the tool.";
        setState({ phase: "error", message });
        emit.current([]);
      }
    })();

    return () => {
      cancelled = true;
      opened?.destroy();
    };
  }, [file]);

  const renderThumbnail = useMemo(() => {
    if (state.phase !== "ready") return undefined;
    const doc = state.doc;
    return (page: PdfPageItem, width: number, signal: AbortSignal) =>
      doc.renderPage(page.pageNumber, { width, rotation: page.rotation, signal });
  }, [state]);

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

  return (
    <PageThumbnailGrid
      className={className}
      pages={pages}
      onChange={onChange}
      selectedIds={selected}
      onSelectedChange={setSelected}
      renderThumbnail={renderThumbnail}
      showDocBadges={false}
    />
  );
}

export default OrganizeCanvas;
