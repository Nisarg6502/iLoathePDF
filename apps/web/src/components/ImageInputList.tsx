import { useEffect, useRef, useState } from "react";
import { ImageEditModal } from "./ImageEditModal";
import { DEFAULT_IMAGE_EDIT, removeEdit, reorderEdits, type ImageEdit, type ImageEdits } from "@/tools/imageEdit";

function Thumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? (
    <img src={url} alt="" className="size-11 flex-none rounded-lg border border-border object-cover" />
  ) : (
    <span className="size-11 flex-none rounded-lg border border-border bg-surface-3" />
  );
}

function describeEdit(edit: ImageEdit | undefined): string | null {
  if (!edit) return null;
  const parts: string[] = [];
  if (edit.rotate !== 0) parts.push(`rotated ${edit.rotate}°`);
  if (edit.crop) parts.push("cropped");
  return parts.length ? parts.join(" · ") : null;
}

const smallButton =
  "flex-none rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium hover:bg-surface-3 disabled:pointer-events-none disabled:opacity-40";

export function ImageInputList({
  files,
  options,
  onChange,
  disabled,
  onFilesChange,
  accept,
}: {
  files: File[];
  options: Record<string, unknown>;
  onChange: (options: Record<string, unknown>) => void;
  disabled: boolean;
  /** When given, the list can reorder, remove and add images. */
  onFilesChange?: (files: File[]) => void;
  /** Extensions (".png") the "Add more" picker offers and accepts. */
  accept?: string[];
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  // Stable React keys: names repeat and positions change when reordering.
  const keys = useRef(new WeakMap<File, number>());
  const nextKey = useRef(0);
  const keyOf = (f: File) => {
    let k = keys.current.get(f);
    if (k === undefined) {
      k = nextKey.current++;
      keys.current.set(f, k);
    }
    return k;
  };
  const edits = (options.edits as ImageEdits | undefined) ?? {};

  function applyEdit(index: number, edit: ImageEdit) {
    onChange({ ...options, edits: { ...edits, [index]: edit } });
    setEditingIndex(null);
  }

  function move(from: number, to: number) {
    if (!onFilesChange || to < 0 || to >= files.length) return;
    const next = files.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...options, edits: reorderEdits(edits, files.length, from, to) });
    onFilesChange(next);
  }

  function remove(index: number) {
    if (!onFilesChange) return;
    onChange({ ...options, edits: removeEdit(edits, index) });
    onFilesChange(files.filter((_, i) => i !== index));
  }

  function add(picked: File[]) {
    if (!onFilesChange || picked.length === 0) return;
    const exts = accept?.map((a) => a.toLowerCase());
    const allowed = picked.filter((f) => !exts || exts.some((ext) => f.name.toLowerCase().endsWith(ext)));
    const id = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
    const seen = new Set(files.map(id));
    const fresh = allowed.filter((f) => !seen.has(id(f)));
    if (fresh.length > 0) onFilesChange([...files, ...fresh]);
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {files.map((f, i) => {
          const summary = describeEdit(edits[i]);
          return (
            <li key={keyOf(f)} className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 p-3.5">
              {onFilesChange && (
                <span className="w-4 flex-none text-center font-mono text-[12px] text-faint tabular-nums">{i + 1}</span>
              )}
              <Thumbnail file={f} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" title={f.name}>
                  {f.name}
                </div>
                <div className="mt-0.5 font-mono text-[11.5px] text-muted">
                  {(f.size / 1024).toFixed(0)} KB{summary ? ` · ${summary}` : ""}
                </div>
              </div>
              {onFilesChange && (
                <>
                  <button
                    type="button"
                    aria-label={`Move ${f.name} up`}
                    disabled={disabled || i === 0}
                    onClick={() => move(i, i - 1)}
                    className={smallButton}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${f.name} down`}
                    disabled={disabled || i === files.length - 1}
                    onClick={() => move(i, i + 1)}
                    className={smallButton}
                  >
                    ↓
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => setEditingIndex(i)}
                className="flex-none rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-surface-3 disabled:pointer-events-none disabled:opacity-50"
              >
                Edit
              </button>
              {onFilesChange && (
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  disabled={disabled}
                  onClick={() => remove(i)}
                  className={`${smallButton} hover:text-danger`}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {onFilesChange && (
        <>
          <input
            ref={addInput}
            data-testid="add-images-input"
            type="file"
            multiple
            accept={accept?.join(",")}
            className="hidden"
            onChange={(e) => {
              add(Array.from(e.target.files ?? []));
              e.target.value = ""; // lets the same file be re-added after removing it
            }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => addInput.current?.click()}
            className="mt-3 flex h-10 w-full items-center justify-center rounded-[11px] border border-dashed border-border text-sm font-medium text-muted hover:border-accent hover:text-text disabled:pointer-events-none disabled:opacity-50"
          >
            + Add more images
          </button>
        </>
      )}
      {editingIndex !== null && files[editingIndex] && (
        <ImageEditModal
          file={files[editingIndex]}
          edit={edits[editingIndex] ?? DEFAULT_IMAGE_EDIT}
          onApply={(edit) => applyEdit(editingIndex, edit)}
          onClose={() => setEditingIndex(null)}
        />
      )}
    </>
  );
}
