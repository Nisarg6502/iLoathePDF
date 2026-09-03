/**
 * The centrepiece of merge / split / organize: a drag-reorderable grid of PDF
 * page thumbnails.
 *
 * Fully controlled — it owns no page state. Every page carries a `docId` so the
 * same component serves "organize one PDF" and "arrange pages across several
 * merged PDFs".
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { FileText, ImageOff, RotateCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface PdfPageItem {
  /** Stable, unique across every source document in the grid. */
  id: string;
  /** Which source document this page came from. */
  docId: string;
  /** 1-based page number *within its source document*. */
  pageNumber: number;
  /** Absolute rotation to apply, 0 | 90 | 180 | 270. */
  rotation: number;
  /** Short label for the source doc; shown when more than one doc is present. */
  docLabel?: string;
}

/**
 * Produces a thumbnail for one page. Return `null` if nothing can be rendered.
 * Must honour `signal` — the grid aborts when a tile scrolls far away or the
 * component unmounts.
 */
export type ThumbnailRenderer = (
  page: PdfPageItem,
  width: number,
  signal: AbortSignal,
) => Promise<string | null>;

export interface PageThumbnailGridProps {
  pages: PdfPageItem[];
  onChange: (pages: PdfPageItem[]) => void;
  /** Controlled selection. Omit both to run uncontrolled. */
  selectedIds?: string[];
  onSelectedChange?: (ids: string[]) => void;
  renderThumbnail?: ThumbnailRenderer;
  /** Thumbnail render width in CSS px. Default 200. */
  thumbnailWidth?: number;
  /** Show the source-document chip. Defaults to "only when >1 document". */
  showDocBadges?: boolean;
  /** Hide per-tile rotate/delete affordances (e.g. a read-only preview). */
  readOnly?: boolean;
  emptyState?: ReactNode;
  className?: string;
}

const DOC_TINTS = [
  "text-[oklch(0.55_0.17_258)] bg-[oklch(0.55_0.17_258/0.12)]",
  "text-[oklch(0.58_0.16_150)] bg-[oklch(0.58_0.16_150/0.14)]",
  "text-[oklch(0.60_0.17_60)] bg-[oklch(0.60_0.17_60/0.16)]",
  "text-[oklch(0.58_0.19_330)] bg-[oklch(0.58_0.19_330/0.13)]",
  "text-[oklch(0.58_0.17_20)] bg-[oklch(0.58_0.17_20/0.13)]",
];

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export function PageThumbnailGrid({
  pages,
  onChange,
  selectedIds,
  onSelectedChange,
  renderThumbnail,
  thumbnailWidth = 200,
  showDocBadges,
  readOnly = false,
  emptyState,
  className,
}: PageThumbnailGridProps) {
  const [internalSelection, setInternalSelection] = useState<string[]>([]);
  const selection = selectedIds ?? internalSelection;
  const setSelection = useCallback(
    (ids: string[]) => {
      if (!selectedIds) setInternalSelection(ids);
      onSelectedChange?.(ids);
    },
    [selectedIds, onSelectedChange],
  );

  const anchorRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const listId = useId();

  const docIds = useMemo(() => [...new Set(pages.map((p) => p.docId))], [pages]);
  const badges = showDocBadges ?? docIds.length > 1;
  const tintOf = useCallback(
    (docId: string) => DOC_TINTS[docIds.indexOf(docId) % DOC_TINTS.length],
    [docIds],
  );

  // Drop selections that point at pages which no longer exist.
  useEffect(() => {
    if (!selection.length) return;
    const live = new Set(pages.map((p) => p.id));
    const next = selection.filter((id) => live.has(id));
    if (next.length !== selection.length) setSelection(next);
  }, [pages, selection, setSelection]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => pages.map((p) => p.id), [pages]);

  const handleDragEnd = (event: DragEndEvent) => {
    setDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(pages, from, to));
  };

  const handleDragStart = (event: DragStartEvent) => setDragId(String(event.active.id));

  const select = useCallback(
    (id: string, mode: "replace" | "toggle" | "range") => {
      if (mode === "range" && anchorRef.current) {
        const a = ids.indexOf(anchorRef.current);
        const b = ids.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelection(ids.slice(lo, hi + 1));
          return;
        }
      }
      if (mode === "toggle") {
        anchorRef.current = id;
        setSelection(
          selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id],
        );
        return;
      }
      anchorRef.current = id;
      setSelection(selection.length === 1 && selection[0] === id ? [] : [id]);
    },
    [ids, selection, setSelection],
  );

  const rotate = useCallback(
    (targets: string[], delta: number) => {
      const set = new Set(targets);
      onChange(
        pages.map((p) =>
          set.has(p.id) ? { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 } : p,
        ),
      );
    },
    [pages, onChange],
  );

  const remove = useCallback(
    (targets: string[]) => {
      const set = new Set(targets);
      onChange(pages.filter((p) => !set.has(p.id)));
      setSelection(selection.filter((id) => !set.has(id)));
    },
    [pages, onChange, selection, setSelection],
  );

  const dragging = dragId ? pages.find((p) => p.id === dragId) : undefined;

  if (!pages.length) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-[var(--radius-card)] border border-dashed",
          "border-border bg-surface-2/50 px-6 py-16 text-center",
          className,
        )}
      >
        {emptyState ?? (
          <div className="max-w-xs space-y-1.5">
            <FileText className="mx-auto h-7 w-7 text-muted/60" strokeWidth={1.5} />
            <p className="text-sm font-medium text-text">No pages yet</p>
            <p className="text-xs text-muted">
              Add a PDF and its pages will show up here, ready to reorder.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <SelectionBar
        total={pages.length}
        selection={selection}
        readOnly={readOnly}
        onRotate={() => rotate(selection, 90)}
        onDelete={() => remove(selection)}
        onSelectAll={() => setSelection(ids)}
        onClear={() => setSelection([])}
      />

      <DndContext
        id={listId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToWindowEdges]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragId(null)}
      >
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <ul
            className="grid list-none gap-4 p-0"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(9.5rem, 1fr))" }}
          >
            {pages.map((page, index) => (
              <PageTile
                key={page.id}
                page={page}
                index={index}
                selected={selection.includes(page.id)}
                badge={badges}
                tint={tintOf(page.docId)}
                readOnly={readOnly}
                thumbnailWidth={thumbnailWidth}
                renderThumbnail={renderThumbnail}
                onSelect={select}
                onRotate={(id) => rotate([id], 90)}
                onDelete={(id) => remove([id])}
              />
            ))}
          </ul>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}>
          {dragging ? (
            <div className="w-[9.5rem] rotate-2 rounded-xl border border-accent bg-surface p-1.5 shadow-[0_18px_40px_oklch(0.2_0.02_260/0.28)]">
              <PageCanvas
                page={dragging}
                width={thumbnailWidth}
                renderThumbnail={renderThumbnail}
                eager
              />
              <div className="pt-1.5 text-center text-xs font-medium tabular-nums text-text">
                {dragging.pageNumber}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selection toolbar
// ---------------------------------------------------------------------------

function SelectionBar({
  total,
  selection,
  readOnly,
  onRotate,
  onDelete,
  onSelectAll,
  onClear,
}: {
  total: number;
  selection: string[];
  readOnly: boolean;
  onRotate: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const n = selection.length;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span className="tabular-nums">
        {total} {total === 1 ? "page" : "pages"}
      </span>
      <span aria-hidden className="text-border">
        •
      </span>
      {n > 0 ? (
        <span className="font-medium tabular-nums text-text">{n} selected</span>
      ) : (
        <span className="hidden sm:inline">Drag to reorder — Space then arrows with a keyboard</span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {n > 0 && !readOnly && (
          <>
            <BarButton onClick={onRotate}>
              <RotateCw className="h-3.5 w-3.5" /> Rotate
            </BarButton>
            <BarButton onClick={onDelete} danger>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </BarButton>
          </>
        )}
        <BarButton onClick={n === total ? onClear : onSelectAll}>
          {n === total ? "Clear" : "Select all"}
        </BarButton>
      </div>
    </div>
  );
}

function BarButton({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1",
        "text-xs font-medium text-text transition-colors",
        "hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        danger && "text-danger hover:bg-[oklch(0.58_0.2_25/0.1)]",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

interface PageTileProps {
  page: PdfPageItem;
  index: number;
  selected: boolean;
  badge: boolean;
  tint: string;
  readOnly: boolean;
  thumbnailWidth: number;
  renderThumbnail?: ThumbnailRenderer;
  onSelect: (id: string, mode: "replace" | "toggle" | "range") => void;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
}

const PageTile = memo(function PageTile({
  page,
  index,
  selected,
  badge,
  tint,
  readOnly,
  thumbnailWidth,
  renderThumbnail,
  onSelect,
  onRotate,
  onDelete,
}: PageTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });

  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const click = (e: ReactMouseEvent<HTMLLIElement>) => {
    onSelect(page.id, e.shiftKey ? "range" : e.ctrlKey || e.metaKey ? "toggle" : "replace");
  };

  const keyDown = (e: ReactKeyboardEvent<HTMLLIElement>) => {
    if (readOnly) return;
    // dnd-kit owns Space/Enter (pick up & drop) — only add the extras.
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      onRotate(page.id);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onDelete(page.id);
    }
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={click}
      onKeyDown={keyDown}
      aria-selected={selected}
      className={cn(
        "group relative cursor-grab rounded-xl border bg-surface p-1.5",
        "transition-[box-shadow,border-color,transform] duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected
          ? "border-accent shadow-[0_0_0_1px_var(--accent)]"
          : "border-border hover:border-muted/40 hover:shadow-[var(--shadow-card)]",
      )}
    >
      <div className="relative">
        <PageCanvas page={page} width={thumbnailWidth} renderThumbnail={renderThumbnail} />

        {badge && page.docLabel && (
          <span
            className={cn(
              "absolute left-1 top-1 max-w-[calc(100%-0.5rem)] truncate rounded px-1.5 py-0.5",
              "text-[11px] font-semibold backdrop-blur-sm",
              tint,
            )}
            title={page.docLabel}
          >
            {page.docLabel}
          </span>
        )}

        {!readOnly && (
          <div
            className={cn(
              "absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity",
              "group-hover:opacity-100 group-focus-within:opacity-100",
            )}
          >
            <TileButton
              label={`Rotate page ${page.pageNumber}`}
              onClick={() => onRotate(page.id)}
            >
              <RotateCw className="h-3.5 w-3.5" />
            </TileButton>
            <TileButton
              label={`Remove page ${page.pageNumber}`}
              danger
              onClick={() => onDelete(page.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </TileButton>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1 pt-1.5">
        <span
          className={cn(
            "rounded px-1.5 text-xs font-medium tabular-nums",
            selected ? "bg-accent text-accent-fg" : "text-muted",
          )}
        >
          {index + 1}
        </span>
        {page.rotation !== 0 && (
          <span className="text-[11px] tabular-nums text-muted">{page.rotation}°</span>
        )}
      </div>
    </li>
  );
});

function TileButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // stop dnd-kit's pointer sensor from treating this as a drag handle
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid h-6 w-6 place-items-center rounded-md border border-border bg-surface/90 text-text",
        "shadow-sm backdrop-blur transition-colors hover:bg-surface-2",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        danger && "hover:border-danger hover:text-danger",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail: lazy, aborted when off-screen, skeleton while pending
// ---------------------------------------------------------------------------

function PageCanvas({
  page,
  width,
  renderThumbnail,
  eager = false,
}: {
  page: PdfPageItem;
  width: number;
  renderThumbnail?: ThumbnailRenderer;
  eager?: boolean;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(eager);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  // Only rasterise pages that are on (or near) screen. This is what keeps a
  // 200-page document from rendering 200 canvases at mount.
  useEffect(() => {
    if (eager) return;
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!visible || !renderThumbnail) return;
    const ac = new AbortController();
    let live = true;
    setState("loading");
    renderThumbnail(page, width, ac.signal)
      .then((next) => {
        if (!live) return;
        setUrl(next);
        setState(next ? "idle" : "error");
      })
      .catch(() => {
        if (live && !ac.signal.aborted) setState("error");
      });
    return () => {
      live = false;
      ac.abort();
    };
    // re-render when the page identity or its rotation changes
  }, [visible, renderThumbnail, page, page.rotation, page.pageNumber, page.docId, width]);

  const portrait = page.rotation % 180 === 0;

  return (
    <div
      ref={holder}
      className={cn(
        "relative w-full overflow-hidden rounded-lg bg-white ring-1 ring-border",
        portrait ? "aspect-[1/1.294]" : "aspect-[1.294/1]",
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`Page ${page.pageNumber}`}
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : state === "error" ? (
        <div className="absolute inset-0 grid place-items-center bg-surface-2">
          <ImageOff className="h-5 w-5 text-muted/60" strokeWidth={1.5} />
        </div>
      ) : (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-surface-2 to-border/40" />
      )}
    </div>
  );
}

export default PageThumbnailGrid;
