import type { OptionsPanelProps } from "@/tools/ToolConfig";

const SIDES = ["top", "right", "bottom", "left"] as const;

export function CropOptions({ options, onChange, disabled }: OptionsPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {SIDES.map((side) => (
          <label key={side} className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold capitalize">{side} (%)</span>
            <input
              type="number"
              min={0}
              max={99}
              step={1}
              disabled={disabled}
              value={(options[side] as number) ?? 0}
              onChange={(e) => onChange({ ...options, [side]: Number(e.target.value) })}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Pages</span>
        <input
          type="text"
          placeholder="All pages"
          disabled={disabled}
          value={(options.pages as string) ?? ""}
          onChange={(e) => onChange({ ...options, pages: e.target.value })}
          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
        />
        <span className="text-[11.5px] text-muted">Leave empty for every page. Example: 1-3,8</span>
      </label>
      <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">
        Each side is trimmed by a percentage of the page. Cropped-out content stays inside the file, hidden — use
        Redact to remove it for good.
      </div>
    </div>
  );
}
