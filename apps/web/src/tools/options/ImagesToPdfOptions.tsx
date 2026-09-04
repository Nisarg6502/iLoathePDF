import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function ImagesToPdfOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const margin = (options.margin as number) ?? 24;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold">Margin (points)</span>
      <input
        type="number"
        min={0}
        disabled={disabled}
        value={margin}
        onChange={(e) => onChange({ ...options, margin: Number(e.target.value) })}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
      />
      <span className="text-[11.5px] text-muted">Each image is centered on its own A4 page.</span>
    </label>
  );
}
