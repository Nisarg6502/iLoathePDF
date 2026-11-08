import type { OptionsPanelProps } from "@/tools/ToolConfig";

const fieldClass = "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";

const MODES = [
  { value: "enhanced", label: "Enhanced", hint: "Stronger contrast: paper reads white, ink reads dark." },
  { value: "bw", label: "Black & white", hint: "Crisp ink on white. Ignores shadows and uneven light." },
  { value: "color", label: "Original colour", hint: "The photo as it is." },
];

export function ScanOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const mode = (options.mode as string) ?? "enhanced";
  const set = (patch: Record<string, unknown>) => onChange({ ...options, ...patch });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Cleanup</span>
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`cursor-pointer rounded-lg border p-2.5 ${mode === m.value ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
          >
            <input
              type="radio"
              name="scan-mode"
              className="sr-only"
              checked={mode === m.value}
              disabled={disabled}
              onChange={() => set({ mode: m.value })}
            />
            <div className="text-[12.5px] font-semibold">{m.label}</div>
            <div className="text-[11.5px] text-muted">{m.hint}</div>
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Page size</span>
        <select
          disabled={disabled}
          value={(options.page_size as string) ?? "a4"}
          onChange={(e) => set({ page_size: e.target.value })}
          className={fieldClass}
        >
          <option value="a4">A4</option>
          <option value="letter">US Letter</option>
          <option value="fit">Fit each photo</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Output file name</span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            disabled={disabled}
            value={(options.outputName as string) ?? "scan"}
            placeholder="scan"
            onChange={(e) => set({ outputName: e.target.value })}
            className={`min-w-0 flex-1 ${fieldClass}`}
          />
          <span className="font-mono text-[12.5px] text-muted">.pdf</span>
        </div>
      </label>
    </div>
  );
}
