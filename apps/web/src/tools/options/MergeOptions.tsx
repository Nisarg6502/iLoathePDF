import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function MergeOptions({ disabled }: OptionsPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-relaxed text-muted">
        Files merge in the order you added them. Per-file page ranges are
        coming to this panel — for now every page of every file is included.
      </p>
      <label className="flex items-center gap-2 text-[12.5px] text-faint">
        <input type="checkbox" disabled={disabled} />
        Reverse file order
      </label>
    </div>
  );
}
