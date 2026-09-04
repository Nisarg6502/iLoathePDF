/**
 * Progress UI for a running sidecar job, driven by `Progress` events from
 * `@/lib/jobs`.
 *
 * Degrades on purpose: a job that never emits a single progress line still gets
 * an honest indeterminate bar and a live elapsed clock, so the app never looks
 * frozen.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { Progress } from "@/lib/jobs";
import { cn } from "@/lib/utils";

export type JobPhase = "running" | "cancelling" | "done" | "error";

export interface JobProgressProps {
  /** What the user asked for, e.g. "Compressing report.pdf". */
  title: string;
  /** Latest progress event, or null if none has arrived yet. */
  progress?: Progress | null;
  phase?: JobPhase;
  /** performance.now()-style timestamp; defaults to first mount. */
  startedAt?: number;
  /** Wire this to `controller.abort()`. Omit to hide the Cancel button. */
  onCancel?: () => void;
  className?: string;
}

export function JobProgress({
  title,
  progress = null,
  phase = "running",
  startedAt,
  onCancel,
  className,
}: JobProgressProps) {
  const elapsed = useElapsed(startedAt, phase === "running" || phase === "cancelling");

  const pct = progress ? clamp(progress.pct, 0, 100) : null;
  const determinate = pct !== null && pct > 0;
  const cancelling = phase === "cancelling";
  const note = cancelling ? "Stopping…" : (progress?.note ?? "Starting…");

  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-surface p-4",
        "shadow-[var(--shadow-card)]",
        className,
      )}
      aria-busy={phase === "running" || cancelling}
    >
      <div className="flex items-start gap-3">
        <Loader2
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent",
            cancelling && "text-muted",
          )}
          strokeWidth={2.25}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h3 className="truncate text-sm font-semibold text-text">{title}</h3>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">
              {determinate && <span className="font-medium text-text">{Math.round(pct)}%</span>}
              {determinate && <span className="px-1.5 text-border">·</span>}
              {formatElapsed(elapsed)}
            </span>
          </div>

          <div
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label={title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={determinate ? Math.round(pct) : undefined}
            aria-valuetext={determinate ? `${Math.round(pct)}%` : "Working"}
          >
            {determinate ? (
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            ) : (
              <div className="h-full w-2/5 rounded-full bg-accent [animation:ihp-indeterminate_1.4s_ease-in-out_infinite]" />
            )}
          </div>

          <p className="mt-2 truncate text-xs text-muted" title={note}>
            {note}
          </p>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border",
              "bg-surface px-2.5 py-1.5 text-xs font-medium text-text transition-colors",
              "hover:border-danger hover:text-danger",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-text",
            )}
          >
            <X className="h-3.5 w-3.5" />
            {cancelling ? "Cancelling" : "Cancel"}
          </button>
        )}
      </div>

      {/* Scoped keyframes — index.css belongs to another agent. */}
      <style>{`@keyframes ihp-indeterminate {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(250%); }
      }`}</style>
    </section>
  );
}

// ---------------------------------------------------------------------------

function useElapsed(startedAt: number | undefined, ticking: boolean): number {
  const start = useRef(startedAt ?? Date.now());
  if (startedAt !== undefined && startedAt !== start.current) start.current = startedAt;

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [ticking]);

  return Math.max(0, now - start.current);
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default JobProgress;
