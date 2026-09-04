import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function ConvertImagesOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const to = (options.to as string) ?? "png";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold">Convert to</span>
      <div className="flex gap-1.5">
        {["png", "jpg", "webp"].map((f) => (
          <button
            key={f}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...options, to: f })}
            className={`rounded-lg border px-3 py-1.5 text-[12.5px] ${to === f ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] text-muted">
        HEIC input is accepted but shows a preview result until a decoder
        ships — see the tool card badge.
      </p>
    </div>
  );
}
