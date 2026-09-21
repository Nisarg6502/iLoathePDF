/**
 * Shared with ToolPage and RecipeDetail: warns when the selected input(s)
 * exceed a size a browser tab can reasonably hold in memory. Recipes are
 * the most memory-hungry path on web -- multiple sequential Blobs held at
 * once across steps -- so this matters there at least as much as it does
 * for a single tool run.
 */

export const LARGE_FILE_WARNING_BYTES = 150 * 1024 * 1024; // ~150 MB, per spec's browser-memory ceiling

export function LargeFileWarning({
  totalBytes,
  onDismiss,
}: {
  totalBytes: number;
  onDismiss: () => void;
}) {
  return (
    <div className="page-in mt-3 flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3.5">
      <span className="mt-0.5 flex-none text-[13px]">⚠</span>
      <div className="flex-1 text-[12.5px] leading-relaxed text-muted">
        {(totalBytes / (1024 * 1024)).toFixed(0)} MB is a lot for one browser tab — this may
        run slowly or the tab may run out of memory. The desktop app has no such limit.
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex-none text-[12.5px] text-muted hover:text-text"
      >
        Dismiss
      </button>
    </div>
  );
}
