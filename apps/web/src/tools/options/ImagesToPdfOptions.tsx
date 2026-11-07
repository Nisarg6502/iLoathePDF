import type { OptionsPanelProps } from "@/tools/ToolConfig";

const fieldClass = "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";

export function ImagesToPdfOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const outputName = (options.outputName as string) ?? "images";
  const pageSize = (options.page_size as string) ?? "fit";
  const orientation = (options.orientation as string) ?? "auto";
  const margin = (options.margin_mm as number) ?? 0;

  const set = (patch: Record<string, unknown>) => onChange({ ...options, ...patch });

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Output file name</span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            disabled={disabled}
            value={outputName}
            placeholder="images"
            onChange={(e) => set({ outputName: e.target.value })}
            className={`min-w-0 flex-1 ${fieldClass}`}
          />
          <span className="font-mono text-[12.5px] text-muted">.pdf</span>
        </div>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Page size</span>
        <select
          disabled={disabled}
          value={pageSize}
          onChange={(e) => set({ page_size: e.target.value })}
          className={fieldClass}
        >
          <option value="fit">Fit to image</option>
          <option value="a4">A4</option>
          <option value="letter">US Letter</option>
        </select>
        <span className="text-[11.5px] text-muted">&lsquo;Fit&rsquo; makes every page exactly the size of its image.</span>
      </label>

      {pageSize !== "fit" && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold">Orientation</span>
            <select
              disabled={disabled}
              value={orientation}
              onChange={(e) => set({ orientation: e.target.value })}
              className={fieldClass}
            >
              <option value="auto">Match each image</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between text-[12.5px] font-semibold">
              Margin
              <span className="font-mono text-[11.5px] font-normal text-muted">{margin} mm</span>
            </span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              disabled={disabled}
              value={margin}
              onChange={(e) => set({ margin_mm: Number(e.target.value) })}
              className="accent-[var(--accent)]"
            />
          </label>
        </>
      )}
    </div>
  );
}
