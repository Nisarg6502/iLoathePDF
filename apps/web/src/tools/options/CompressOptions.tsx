import { useEffect, useState } from "react";
import type { OptionsPanelProps } from "@/tools/ToolConfig";
import { estimateCompressedPdfSize } from "@/engines/compress";
import { formatBytes, percentSmaller } from "@/lib/formatBytes";

const ESTIMATE_DEBOUNCE_MS = 400;

type EstimateState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "ready"; estimatedBytes: number; originalBytes: number; pageCount: number; sampledPages: number }
  | { status: "error"; message: string };

export function CompressOptions({ options, onChange, disabled, files }: OptionsPanelProps) {
  const dpi = (options.dpi as number) ?? 96;
  const [estimate, setEstimate] = useState<EstimateState>({ status: "idle" });

  useEffect(() => {
    const file = files?.[0];
    if (!file) {
      setEstimate({ status: "idle" });
      return;
    }
    let cancelled = false;
    setEstimate({ status: "working" });
    const timer = setTimeout(() => {
      estimateCompressedPdfSize(file, dpi)
        .then((r) => {
          if (!cancelled) setEstimate({ status: "ready", ...r });
        })
        .catch((e) => {
          if (!cancelled) setEstimate({ status: "error", message: e instanceof Error ? e.message : String(e) });
        });
    }, ESTIMATE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [files, dpi]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold">Image DPI</span>
          <span className="font-mono text-[11.5px] text-muted">{dpi}</span>
        </div>
        <input
          type="range"
          min={72}
          max={300}
          disabled={disabled}
          value={dpi}
          onChange={(e) => onChange({ ...options, dpi: Number(e.target.value) })}
          aria-label="Image DPI"
          className="ihp-slider"
        />
      </div>

      <div
        className="rounded-lg bg-accent-soft p-3 text-[12.5px] leading-relaxed text-on-accent"
        aria-live="polite"
        data-testid="size-estimate"
      >
        {estimate.status === "idle" && <>Add a PDF to see the estimated size.</>}
        {estimate.status === "working" && <>Estimating size…</>}
        {estimate.status === "error" && <>Can't estimate: {estimate.message}</>}
        {estimate.status === "ready" && (
          <>
            <strong>≈ {formatBytes(estimate.estimatedBytes)}</strong>
            {percentSmaller(estimate.originalBytes, estimate.estimatedBytes) > 0 ? (
              <>, about {percentSmaller(estimate.originalBytes, estimate.estimatedBytes)}% smaller than {formatBytes(estimate.originalBytes)}</>
            ) : (
              <>, not smaller than the {formatBytes(estimate.originalBytes)} you have — try a lower DPI</>
            )}
            <div className="mt-1 text-[11.5px] opacity-80">
              Estimate, from rendering {estimate.sampledPages} of {estimate.pageCount} page{estimate.pageCount === 1 ? "" : "s"} at {dpi} DPI.
              The real size can differ.
            </div>
          </>
        )}
      </div>

      <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">
        Preview engine: pages are rasterized, so this trades away selectable
        text for now. The desktop app's Ghostscript engine keeps text
        selectable — see the Download page.
      </div>
    </div>
  );
}
