import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function MergeOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const outputName = (options.outputName as string) ?? "merged";

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Output file name</span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            disabled={disabled}
            value={outputName}
            placeholder="merged"
            onChange={(e) => onChange({ ...options, outputName: e.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
          <span className="font-mono text-[12.5px] text-muted">.pdf</span>
        </div>
      </label>
      <p className="text-[12.5px] leading-relaxed text-muted">
        Files merge in the order you added them. Per-file page ranges are
        coming to this panel — for now every page of every file is included.
      </p>
    </div>
  );
}
