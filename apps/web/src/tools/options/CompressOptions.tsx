import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function CompressOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const dpi = (options.dpi as number) ?? 96;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold">Image DPI</span>
          <span className="font-mono text-[11.5px] text-muted">{dpi}</span>
        </div>
        <input
          type="range"
          min={72}
          max={300}
          disabled={disabled}
          value={dpi}
          onChange={(e) => onChange({ ...options, dpi: Number(e.target.value) })}
          className="ihp-slider"
        />
      </div>
      <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">
        Preview engine: pages are rasterized, so this trades away selectable
        text for now. The desktop app's Ghostscript engine keeps text
        selectable — see the Download page.
      </div>
    </div>
  );
}
