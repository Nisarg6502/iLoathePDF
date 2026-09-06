import { useEffect, useState } from "react";
import { ImageEditModal } from "./ImageEditModal";
import { DEFAULT_IMAGE_EDIT, type ImageEdit, type ImageEdits } from "@/tools/imageEdit";

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

export function ImageInputList({
  files,
  options,
  onChange,
  disabled,
}: {
  files: File[];
  options: Record<string, unknown>;
  onChange: (options: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const edits = (options.edits as ImageEdits | undefined) ?? {};

  function applyEdit(index: number, edit: ImageEdit) {
    onChange({ ...options, edits: { ...edits, [index]: edit } });
    setEditingIndex(null);
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {files.map((f, i) => {
          const summary = describeEdit(edits[i]);
          return (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 p-3.5">
              <Thumbnail file={f} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{f.name}</div>
                <div className="mt-0.5 font-mono text-[11.5px] text-muted">
                  {(f.size / 1024).toFixed(0)} KB{summary ? ` · ${summary}` : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setEditingIndex(i)}
                className="flex-none rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-surface-3 disabled:pointer-events-none disabled:opacity-50"
              >
                Edit
              </button>
            </li>
          );
        })}
      </ul>
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
