import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function ConvertImagesOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const to = (options.to as string) ?? "png";
  const quality = (options.quality as number) ?? 92;

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
      {to !== "png" && (
        <label className="mt-3 flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between text-[12.5px] font-semibold">
            Quality
            <span className="font-mono text-[11.5px] font-normal text-muted">{quality}</span>
          </span>
          <input
            type="range"
            min={40}
            max={100}
            step={1}
            disabled={disabled}
            value={quality}
            onChange={(e) => onChange({ ...options, quality: Number(e.target.value) })}
            className="accent-[var(--accent)]"
          />
        </label>
      )}
      <p className="mt-1.5 text-[11.5px] text-muted">
        HEIC input is accepted but shows a preview result until a decoder
        ships — see the tool card badge.
      </p>
    </div>
  );
}
