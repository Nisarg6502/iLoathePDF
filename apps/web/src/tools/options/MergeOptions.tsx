import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function MergeOptions({}: OptionsPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-relaxed text-muted">
        Files merge in the order you added them. Per-file page ranges are
        coming to this panel — for now every page of every file is included.
      </p>
    </div>
  );
}
