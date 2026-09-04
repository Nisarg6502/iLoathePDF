import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function PdfToImagesOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const dpi = (options.dpi as number) ?? 144;
  const format = (options.format as string) ?? "png";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold">Image DPI</span>
          <span className="font-mono text-[11.5px] text-muted">{dpi}</span>
        </div>
        <input
          type="range"
          min={72}
          max={300}
          step={1}
          disabled={disabled}
          value={dpi}
          onChange={(e) => onChange({ ...options, dpi: Number(e.target.value) })}
          className="ihp-slider"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Format</span>
        <div className="flex gap-1.5">
          {["png", "jpg"].map((f) => (
            <button
              key={f}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...options, format: f })}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] ${format === f ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
