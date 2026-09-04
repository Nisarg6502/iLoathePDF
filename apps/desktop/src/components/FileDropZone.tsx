import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { FileText, GripVertical, ImageIcon, Plus, Trash2, UploadCloud, X } from "lucide-react";
import { isTauri } from "../lib/jobs";
import { baseName, cn, formatBytes } from "../lib/utils";
import { extOf } from "../lib/tools";
import { Button } from "./ui/button";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface PickedFile {
  /** Stable key for React and for dnd-kit. */
  id: string;
  /** Absolute path under Tauri; the plain file name in the browser. */
  path: string;
  name: string;
  /** Unknown for Tauri drops (the OS hands us paths, not stat results). */
  size?: number;
  /** Only present in the browser fallback. */
  blob?: File;
}

let pickCounter = 0;
const nextId = () => `pf${++pickCounter}`;

export function pickedFromPaths(paths: string[]): PickedFile[] {
  return paths.map((p) => ({ id: nextId(), path: p, name: baseName(p) }));
}

export function pickedFromFiles(files: File[]): PickedFile[] {
  return files.map((f) => ({ id: nextId(), path: f.name, name: f.name, size: f.size, blob: f }));
}

// ---------------------------------------------------------------------------
// Tauri seam. Everything platform-specific lives here and nowhere else, so
// swapping the desktop shell means rewriting this block only.
// ---------------------------------------------------------------------------

type DragDropPhase = "over" | "drop" | "leave";

const desktop = {
  /** Native OS file picker. Returns [] when the user cancels. */
  async browse(accepts: string[], multiple: boolean): Promise<string[]> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      multiple,
      directory: false,
      filters: [{ name: "Supported files", extensions: accepts }],
    });
    if (picked == null) return [];
    return Array.isArray(picked) ? picked : [picked];
  },

  /** Webview-wide native drag & drop. Resolves to an unlisten function. */
  async onDragDrop(
    handler: (phase: DragDropPhase, paths: string[]) => void,
  ): Promise<() => void> {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    return getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload as { type: string; paths?: string[] };
      if (p.type === "enter" || p.type === "over") handler("over", p.paths ?? []);
      else if (p.type === "drop") handler("drop", p.paths ?? []);
      else handler("leave", []);
    });
  },
};

/**
 * File picking without the chrome.
 *
 * The redesigned tool screen puts the drop target, the file list and the
 * "Add files" button in three different places, so the behaviour has to be
 * available on its own rather than baked into one bordered box.
 */
export function useFilePicker({
  accept,
  multiple,
  files,
  onChange,
}: {
  accept: string[];
  multiple: boolean;
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
}) {
  const tauri = isTauri();
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(0);
  const [picking, setPicking] = useState(false);

  // The first native file dialog on Windows is slow -- Explorer's shell
  // namespace initialises lazily, and it can stall for seconds. Loading the
  // plugin chunk up front removes the part we control; `picking` covers the
  // part we do not, so the click is never left looking dead.
  useEffect(() => {
    if (!tauri) return;
    void import("@tauri-apps/plugin-dialog");
  }, [tauri]);

  const add = useCallback(
    (incoming: PickedFile[]) => {
      const ok = incoming.filter((f) => accept.includes(extOf(f.name)));
      setRejected(incoming.length - ok.length);
      if (!ok.length) return;
      const seen = new Set(files.map((f) => f.path));
      const fresh = ok.filter((f) => !seen.has(f.path));
      onChange(multiple ? [...files, ...fresh] : fresh.slice(0, 1));
    },
    [accept, files, multiple, onChange],
  );

  const browse = useCallback(() => {
    setRejected(0);
    if (!tauri) return;
    setPicking(true);
    void desktop
      .browse(accept, multiple)
      .then((paths) => {
        if (paths.length) add(pickedFromPaths(paths));
      })
      .finally(() => setPicking(false));
  }, [accept, add, multiple, tauri]);

  // Native drops arrive through the webview listener, not the DOM.
  useEffect(() => {
    if (!tauri) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void desktop
      .onDragDrop((phase, paths) => {
        if (phase === "over") setDragging(true);
        else if (phase === "leave") setDragging(false);
        else {
          setDragging(false);
          if (paths.length) add(pickedFromPaths(paths));
        }
      })
      .then((un) => {
        if (cancelled) un();
        else unlisten = un;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [tauri, add]);

  return {
    add,
    browse,
    dragging,
    rejected,
    picking,
    clearRejected: () => setRejected(0),
    tauri,
  };
}

/**
 * Whole-window file drop. Used by Home to suggest tools for whatever the
 * user threw at the app, and by the tool workspace as a catch-all target.
 */
export function useWindowFileDrop(onDrop: (files: PickedFile[]) => void, enabled = true) {
  const [dragging, setDragging] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    if (!enabled) {
      setDragging(false);
      return;
    }

    if (isTauri()) {
      let cancelled = false;
      let unlisten: (() => void) | undefined;
      void desktop
        .onDragDrop((phase, paths) => {
          if (phase === "over") setDragging(true);
          else if (phase === "leave") setDragging(false);
          else {
            setDragging(false);
            if (paths.length) onDropRef.current(pickedFromPaths(paths));
          }
        })
        .then((un) => {
          if (cancelled) un();
          else unlisten = un;
        });
      return () => {
        cancelled = true;
        unlisten?.();
      };
    }

    let depth = 0;
    const hasFiles = (e: globalThis.DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const onOver = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onLeave = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDropEvent = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const dropped = Array.from(e.dataTransfer?.files ?? []);
      if (dropped.length) onDropRef.current(pickedFromFiles(dropped));
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDropEvent);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDropEvent);
    };
  }, [enabled]);

  return dragging;
}

// ---------------------------------------------------------------------------
// Drop zone
// ---------------------------------------------------------------------------

export interface FileDropZoneProps {
  /** Lower-case extensions without the dot. */
  accept: string[];
  /** Human label, e.g. "PDF files". */
  acceptLabel: string;
  multiple?: boolean;
  /** Show the drag handles and index numbers. */
  ordered?: boolean;
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  className?: string;
}

export function FileDropZone({
  accept,
  acceptLabel,
  multiple = true,
  ordered = false,
  files,
  onChange,
  className,
}: FileDropZoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState(0);
  const tauri = isTauri();

  const acceptAttr = useMemo(() => accept.map((e) => `.${e}`).join(","), [accept]);

  const add = useCallback(
    (incoming: PickedFile[]) => {
      const ok = incoming.filter((f) => accept.includes(extOf(f.name)));
      setRejected(incoming.length - ok.length);
      if (!ok.length) return;
      const seen = new Set(files.map((f) => f.path));
      const fresh = ok.filter((f) => !seen.has(f.path));
      onChange(multiple ? [...files, ...fresh] : fresh.slice(0, 1));
    },
    [accept, files, multiple, onChange],
  );

  const browse = useCallback(() => {
    setRejected(0);
    if (tauri) {
      void desktop.browse(accept, multiple).then((paths) => {
        if (paths.length) add(pickedFromPaths(paths));
      });
    } else {
      inputRef.current?.click();
    }
  }, [accept, add, multiple, tauri]);

  // Native drops land through the webview listener, not the DOM, under Tauri.
  useEffect(() => {
    if (!tauri) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void desktop
      .onDragDrop((phase, paths) => {
        if (phase === "over") setOver(true);
        else if (phase === "leave") setOver(false);
        else {
          setOver(false);
          if (paths.length) add(pickedFromPaths(paths));
        }
      })
      .then((un) => {
        if (cancelled) un();
        else unlisten = un;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [tauri, add]);

  const browserDragProps = tauri
    ? {}
    : {
        onDragOver: (e: ReactDragEvent) => {
          e.preventDefault();
          setOver(true);
        },
        onDragLeave: (e: ReactDragEvent) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setOver(false);
        },
        onDrop: (e: ReactDragEvent) => {
          e.preventDefault();
          setOver(false);
          add(pickedFromFiles(Array.from(e.dataTransfer.files)));
        },
      };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over: target } = event;
    if (!target || active.id === target.id) return;
    const from = files.findIndex((f) => f.id === active.id);
    const to = files.findIndex((f) => f.id === target.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(files, from, to));
  };

  const knownBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const anySize = files.some((f) => f.size != null);

  const hiddenInput = tauri ? null : (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      className="sr-only"
      multiple={multiple}
      accept={acceptAttr}
      onChange={(e) => {
        add(pickedFromFiles(Array.from(e.currentTarget.files ?? [])));
        e.currentTarget.value = "";
      }}
    />
  );

  // -- Empty state ----------------------------------------------------------
  if (files.length === 0) {
    return (
      <div className={className} {...browserDragProps}>
        {hiddenInput}
        <button
          type="button"
          onClick={browse}
          className={cn(
            "group flex w-full flex-col items-center justify-center gap-4 rounded-card px-6 py-14",
            "border-2 border-dashed outline-none",
            "transition-[background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
            "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            over
              ? "border-accent bg-accent-soft/70 scale-[1.005]"
              : "border-border bg-surface hover:border-accent/60 hover:bg-surface-2",
          )}
        >
          <span
            className={cn(
              "grid size-14 place-items-center rounded-2xl",
              "transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
              over ? "bg-accent text-accent-fg scale-105" : "bg-accent-soft text-accent",
            )}
          >
            <UploadCloud className="size-7" />
          </span>
          <span className="text-center">
            <span className="block text-[17px] font-semibold tracking-[-0.01em] text-text">
              {over ? `Drop to add ${acceptLabel}` : `Drop ${acceptLabel} here`}
            </span>
            <span className="mt-1 block text-[14px] text-muted">
              or click anywhere in this box to browse your computer
            </span>
          </span>
          <span
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium",
              "text-accent-fg shadow-sm transition-[filter] duration-150",
              "group-hover:brightness-[1.07]",
            )}
          >
            <Plus className="size-4" />
            Select {multiple ? "files" : "a file"}
          </span>
          <span className="text-[12px] uppercase tracking-wider text-muted/80">
            {accept.slice(0, 6).join(" · ")}
            {accept.length > 6 ? " · …" : ""}
          </span>
        </button>
        {rejected > 0 ? (
          <p className="ihp-fade mt-2 text-center text-[14px] text-danger">
            {rejected} file{rejected === 1 ? " was" : "s were"} skipped — this tool only takes{" "}
            {acceptLabel}.
          </p>
        ) : null}
      </div>
    );
  }

  // -- Populated state ------------------------------------------------------
  return (
    <div
      className={cn(
        "rounded-card border bg-surface shadow-[var(--shadow-card)]",
        "transition-[border-color,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        over ? "border-accent bg-accent-soft/40" : "border-border",
        className,
      )}
      {...browserDragProps}
    >
      {hiddenInput}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <h3 className="text-[14px] font-semibold text-text">
          {files.length} file{files.length === 1 ? "" : "s"}
        </h3>
        {anySize ? (
          <span className="text-[14px] text-muted tabular-nums">
            {formatBytes(knownBytes)}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={browse}>
            <Plus />
            {multiple ? "Add more" : "Replace"}
          </Button>
          <Button variant="danger" size="sm" onClick={() => onChange([])}>
            <Trash2 />
            Clear
          </Button>
        </div>
      </div>

      {ordered && files.length > 1 ? (
        <p className="border-b border-border bg-surface-2/60 px-4 py-1.5 text-xs text-muted">
          Drag to reorder — this is the order they will appear in the result.
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext items={files.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <ul className="relative max-h-[46vh] overflow-y-auto p-1.5">
            {files.map((file, i) => (
              <FileRow
                key={file.id}
                file={file}
                index={i}
                ordered={ordered}
                onRemove={() => onChange(files.filter((f) => f.id !== file.id))}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {over ? (
        <p className="ihp-fade border-t border-accent/40 px-4 py-2 text-center text-[14px] font-medium text-accent">
          Drop to add to the list
        </p>
      ) : null}
      {rejected > 0 ? (
        <p className="ihp-fade border-t border-border px-4 py-2 text-[14px] text-danger">
          {rejected} file{rejected === 1 ? " was" : "s were"} skipped — not {acceptLabel}.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

const IMAGE_ROW_EXTS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "bmp", "tif", "tiff", "gif"]);

function FileRow({
  file,
  index,
  ordered,
  onRemove,
}: {
  file: PickedFile;
  index: number;
  ordered: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: file.id });

  const style: CSSProperties = {
    transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 2 : undefined,
  };

  const Icon = IMAGE_ROW_EXTS.has(extOf(file.name)) ? ImageIcon : FileText;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2",
        "transition-[background-color,box-shadow] duration-150",
        isDragging
          ? "bg-surface shadow-[var(--shadow-card)] ring-1 ring-accent/50"
          : "hover:bg-surface-2",
      )}
    >
      {ordered ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Reorder ${file.name}`}
          className={cn(
            "grid size-7 shrink-0 cursor-grab place-items-center rounded-md text-muted",
            "outline-none transition-colors duration-150 hover:bg-border/60 hover:text-text",
            "focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing",
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}

      {ordered ? (
        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">
          {index + 1}
        </span>
      ) : null}

      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-muted">
        <Icon className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-text" title={file.path}>
          {file.name}
        </span>
        <span className="block text-xs text-muted tabular-nums">
          {file.size != null ? formatBytes(file.size) : "on disk"}
        </span>
      </span>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-md text-muted outline-none",
          "opacity-0 transition-[opacity,background-color,color] duration-150",
          "group-hover:opacity-100 focus-visible:opacity-100",
          "hover:bg-danger/12 hover:text-danger focus-visible:ring-2 focus-visible:ring-accent",
        )}
      >
        <X className="size-4" />
      </button>
    </li>
  );
}
