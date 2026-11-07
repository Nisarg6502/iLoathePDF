import { useRef } from "react";

const smallButton =
  "flex-none rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium hover:bg-surface-3 disabled:pointer-events-none disabled:opacity-40";

/**
 * Ordered file list for multi-file PDF tools (Merge): the order is part of the
 * result, so it can be changed, and files can be removed or added after the
 * first drop instead of starting over.
 */
export function PdfInputList({
  files,
  onFilesChange,
  accept,
  disabled,
  running,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept: string[];
  disabled: boolean;
  /** Shows a spinner on every row. */
  running: boolean;
}) {
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

  function move(from: number, to: number) {
    if (to < 0 || to >= files.length) return;
    const next = files.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onFilesChange(next);
  }

  function add(picked: File[]) {
    const exts = accept.map((a) => a.toLowerCase());
    const allowed = picked.filter((f) => exts.some((ext) => f.name.toLowerCase().endsWith(ext)));
    if (allowed.length > 0) onFilesChange([...files, ...allowed]);
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {files.map((f, i) => (
          <li key={keyOf(f)} className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 p-3.5">
            <span className="w-4 flex-none text-center font-mono text-[12px] text-faint tabular-nums">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" title={f.name}>
                {f.name}
              </div>
              <div className="mt-0.5 font-mono text-[11.5px] text-muted">{(f.size / 1024).toFixed(0)} KB</div>
            </div>
            {running && (
              <svg className="spinner size-4 flex-none text-accent" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
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
            <button
              type="button"
              aria-label={`Remove ${f.name}`}
              disabled={disabled}
              onClick={() => onFilesChange(files.filter((_, j) => j !== i))}
              className={`${smallButton} hover:text-danger`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <input
        ref={addInput}
        data-testid="add-files-input"
        type="file"
        multiple
        accept={accept.join(",")}
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
        + Add more files
      </button>
    </>
  );
}
