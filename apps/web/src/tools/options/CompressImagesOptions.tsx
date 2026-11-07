import { useEffect, useState } from "react";
import type { OptionsPanelProps } from "@/tools/ToolConfig";
import { estimateCompressedSize, readSettings, type CompressFormat } from "@/engines/compressImages";
import type { ImageEdits } from "@/tools/imageEdit";
import { formatBytes, percentSmaller } from "@/lib/formatBytes";

const FORMATS: { value: CompressFormat; label: string }[] = [
  { value: "keep", label: "Same as input" },
  { value: "jpg", label: "JPG" },
  { value: "webp", label: "WebP" },
];

const ESTIMATE_DEBOUNCE_MS = 350;

type EstimateState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "ready"; estimatedBytes: number; originalBytes: number; sampled: string; fileCount: number }
  | { status: "error"; message: string };

export function CompressImagesOptions({ options, onChange, disabled, files }: OptionsPanelProps) {
  const quality = (options.quality as number) ?? 75;
  const format = (options.format as CompressFormat) ?? "keep";
  const maxDimension = options.maxDimension === undefined || options.maxDimension === null ? "" : String(options.maxDimension);
  const edits = options.edits as ImageEdits | undefined;

  const [estimate, setEstimate] = useState<EstimateState>({ status: "idle" });

  const hasFiles = Boolean(files && files.length > 0);
  const firstIsPng = hasFiles && (files![0].type === "image/png" || /\.png$/i.test(files![0].name));
  const pngLossless = format === "keep" && firstIsPng;

  useEffect(() => {
    if (!files || files.length === 0) {
      setEstimate({ status: "idle" });
      return;
    }
    let cancelled = false;
    setEstimate({ status: "working" });
    const timer = setTimeout(() => {
      let settings;
      try {
        settings = readSettings({ quality, maxDimension: maxDimension === "" ? null : Number(maxDimension), format });
      } catch (e) {
        if (!cancelled) setEstimate({ status: "error", message: e instanceof Error ? e.message : String(e) });
        return;
      }
      estimateCompressedSize(files, settings, edits)
        .then((r) => {
          if (cancelled) return;
          setEstimate({
            status: "ready",
            estimatedBytes: r.estimatedBytes,
            originalBytes: r.originalBytes,
            sampled: r.sampledName,
            fileCount: files.length,
          });
        })
        .catch((e) => {
          if (!cancelled) setEstimate({ status: "error", message: e instanceof Error ? e.message : String(e) });
        });
    }, ESTIMATE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [files, quality, maxDimension, format, edits]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold">Quality</span>
          <span className="font-mono text-[11.5px] text-muted">{pngLossless ? "n/a (PNG)" : quality}</span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          step={1}
          disabled={disabled}
          value={quality}
          onChange={(e) => onChange({ ...options, quality: Number(e.target.value) })}
          aria-label="Quality"
          className="ihp-slider"
        />
        <div className="mt-1 flex justify-between text-[11px] text-faint">
          <span>Smaller file</span>
          <span>Better look</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Output format</span>
        <div className="flex gap-1.5">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...options, format: f.value })}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] ${format === f.value ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {pngLossless && (
          <p className="text-[11.5px] leading-relaxed text-muted">
            PNG is lossless, so Quality has no effect on PNG output. To shrink a PNG, lower the max dimension or
            switch the output to WebP or JPG (JPG drops transparency).
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Max dimension (long edge, px)</span>
        <input
          type="number"
          min={16}
          step={1}
          inputMode="numeric"
          placeholder="Off — keep original size"
          disabled={disabled}
          value={maxDimension}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...options, maxDimension: v === "" ? null : Number(v) });
          }}
          className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-[13px]"
        />
      </label>

      <div
        className="rounded-lg bg-accent-soft p-3 text-[12.5px] leading-relaxed text-on-accent"
        aria-live="polite"
        data-testid="size-estimate"
      >
        {estimate.status === "idle" && <>Add images to see the estimated size.</>}
        {estimate.status === "working" && <>Estimating size…</>}
        {estimate.status === "error" && <>Can't estimate: {estimate.message}</>}
        {estimate.status === "ready" && (
          <>
            <strong>≈ {formatBytes(estimate.estimatedBytes)}</strong>
            {percentSmaller(estimate.originalBytes, estimate.estimatedBytes) > 0 ? (
              <>, about {percentSmaller(estimate.originalBytes, estimate.estimatedBytes)}% smaller than {formatBytes(estimate.originalBytes)}</>
            ) : (
              <>, no smaller than the {formatBytes(estimate.originalBytes)} you have</>
            )}
            <div className="mt-1 text-[11.5px] opacity-80">
              Estimate, based on {estimate.fileCount > 1 ? `compressing "${estimate.sampled}" and applying its ratio to all ${estimate.fileCount} files` : `compressing "${estimate.sampled}"`}. The real size can differ.
            </div>
          </>
        )}
      </div>

      <p className="text-[11.5px] leading-relaxed text-muted">
        Re-encoding strips EXIF/metadata. Nothing leaves your machine.
      </p>
    </div>
  );
}
