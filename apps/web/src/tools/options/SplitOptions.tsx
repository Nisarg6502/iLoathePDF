import type { OptionsPanelProps } from "@/tools/ToolConfig";

const MODES = [
  { value: "ranges", label: "By ranges", hint: "e.g. 1-3,4-6 → two files" },
  { value: "everyN", label: "Every N pages", hint: "chop into fixed-size chunks" },
  { value: "extract", label: "Extract a selection", hint: "one file with just those pages" },
  { value: "delete", label: "Delete a selection", hint: "one file with those pages removed" },
];

export function SplitOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const mode = (options.mode as string) ?? "ranges";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`cursor-pointer rounded-lg border p-2.5 ${mode === m.value ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
          >
            <input
              type="radio"
              name="split-mode"
              className="sr-only"
              checked={mode === m.value}
              disabled={disabled}
              onChange={() => onChange({ ...options, mode: m.value })}
            />
            <div className="text-[12.5px] font-semibold">{m.label}</div>
            <div className="text-[11.5px] text-muted">{m.hint}</div>
          </label>
        ))}
      </div>

      {mode === "everyN" ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">Pages per file</span>
          <input
            type="number"
            min={1}
            disabled={disabled}
            value={(options.n as number) ?? 1}
            onChange={(e) => onChange({ ...options, n: Number(e.target.value) })}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
        </label>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">Page ranges</span>
          <input
            type="text"
            placeholder="1-3,5"
            disabled={disabled}
            value={(options.ranges as string) ?? ""}
            onChange={(e) => onChange({ ...options, ranges: e.target.value })}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
        </label>
      )}
    </div>
  );
}
