import { useRef, type DragEvent } from "react";

export function FileDropZone({
  accept,
  multiple,
  onFiles,
}: {
  accept: string[];
  multiple: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="flex min-h-[400px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface hover:border-accent hover:bg-accent-soft"
    >
      <input
        ref={inputRef}
        data-testid="file-input"
        type="file"
        accept={accept.join(",")}
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))}
      />
      <span className="grid size-18 place-items-center rounded-[22px] bg-accent-soft">
        <svg width="32" height="32" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="1.4">
          <path d="M10 13.5V4M10 4L6.8 7.2M10 4l3.2 3.2" />
          <path d="M3.5 12.5V15a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 16.5 15v-2.5" />
        </svg>
      </span>
      <div className="text-center">
        <div className="text-lg font-semibold">Drop a file here</div>
        <div className="mt-1 text-[13.5px] text-muted">or click anywhere in this box to browse</div>
      </div>
    </div>
  );
}
