/**
 * The moment the user judges the tool: what came out, how big it is, and — for
 * compression — how much smaller it got.
 *
 * Also owns the failure state. Users never see an error code; they see a
 * sentence tuned to what actually went wrong and what to do about it.
 */

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FolderOpen,
  Lock,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { isTauri, type JobError, type OutputFile } from "@/lib/jobs";
import { baseName, cn, formatBytes } from "@/lib/utils";

/**
 * `baseName()` in lib/utils only splits on "/", so Windows paths come back
 * whole. Everything the sidecar returns is a Windows path, so trim the
 * backslash segment too. (Reported upstream — utils.ts is not ours to edit.)
 */
const fileName = (path: string) => baseName(path).split("\\").pop() ?? path;

export interface CompressionSummary {
  originalBytes: number;
  bytes: number;
  engine?: string;
}

export interface ResultCardProps {
  /** Files produced by the job. */
  files: OutputFile[];
  /** Headline. Defaults to a sensible "Done" line. */
  title?: string;
  /** Present it as a before -> after saving. Compression only. */
  compression?: CompressionSummary;
  onAgain?: () => void;
  againLabel?: string;
  className?: string;
}

export function ResultCard({
  files,
  title,
  compression,
  onAgain,
  againLabel = "Do another",
  className,
}: ResultCardProps) {
  const primary = files[0];
  const many = files.length > 1;
  const heading =
    title ?? (many ? `${files.length} files ready` : primary ? "Your file is ready" : "Done");

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface",
        "shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <header className="flex items-start gap-3 border-b border-border px-4 py-3.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[oklch(0.62_0.15_155/0.14)]">
          <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text">{heading}</h3>
          <p className="truncate text-xs text-muted">
            {primary ? fileName(primary.path) : "No output"}
            {many && ` and ${files.length - 1} more`}
          </p>
        </div>
      </header>

      {compression && <SavingsStrip {...compression} />}

      {/* The header already names a single output; only list when there are several. */}
      <ul
        className={cn(
          "max-h-56 list-none divide-y divide-border overflow-y-auto p-0",
          !many && "hidden",
        )}
      >
        {files.map((f) => (
          <li key={f.path} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text" title={f.path} data-selectable>
                {fileName(f.path)}
              </p>
              <p className="text-xs tabular-nums text-muted">
                {formatBytes(f.bytes)}
                {f.pages !== undefined && ` · ${f.pages} ${f.pages === 1 ? "page" : "pages"}`}
                {f.width !== undefined && f.height !== undefined && ` · ${f.width}×${f.height}`}
              </p>
            </div>
            <OpenButton path={f.path} kind="file" compact />
          </li>
        ))}
      </ul>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/60 px-4 py-3">
        {primary && (
          <>
            <OpenButton path={primary.path} kind="file" primary />
            <OpenButton path={primary.path} kind="folder" />
          </>
        )}
        {onAgain && (
          <button
            type="button"
            onClick={onAgain}
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5",
              "text-sm font-medium text-muted transition-colors hover:text-text",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {againLabel}
          </button>
        )}
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------------------
// before -> after
// ---------------------------------------------------------------------------

function SavingsStrip({ originalBytes, bytes, engine }: CompressionSummary) {
  const saved = Math.max(0, originalBytes - bytes);
  const pct = originalBytes > 0 ? Math.round((saved / originalBytes) * 100) : 0;
  const remaining = originalBytes > 0 ? Math.max(2, 100 - pct) : 100;

  return (
    <div className="border-b border-border bg-accent-soft/50 px-4 py-4">
      <div className="flex items-end gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-wide text-muted">Before</p>
          <p className="text-lg font-semibold tabular-nums text-muted line-through decoration-text-muted/40">
            {formatBytes(originalBytes)}
          </p>
        </div>
        <ArrowRight className="mb-2 h-4 w-4 shrink-0 text-muted" />
        <div>
          <p className="text-[12px] uppercase tracking-wide text-muted">After</p>
          <p className="text-lg font-semibold tabular-nums text-text">{formatBytes(bytes)}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-2xl font-bold leading-none tabular-nums text-success">−{pct}%</p>
          <p className="text-[12px] text-muted">{formatBytes(saved)} saved</p>
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-success transition-[width] duration-700 ease-out"
          style={{ width: `${remaining}%` }}
        />
      </div>
      {engine && (
        <p className="mt-1.5 text-[12px] text-muted">Compressed with {engine}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open file / open folder
// ---------------------------------------------------------------------------

function OpenButton({
  path,
  kind,
  primary,
  compact,
}: {
  path: string;
  kind: "file" | "folder";
  primary?: boolean;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const available = isTauri();
  const label = kind === "file" ? "Open file" : "Open folder";

  const open = async () => {
    if (!available) return;
    try {
      const opener = await import("@tauri-apps/plugin-opener");
      if (kind === "file") await opener.openPath(path);
      else await opener.revealItemInDir(path);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  const Icon = kind === "file" ? ExternalLink : FolderOpen;

  return (
    <button
      type="button"
      onClick={open}
      disabled={!available}
      title={
        available
          ? failed
            ? `Could not open ${path}`
            : path
          : "Opening files needs the desktop app — this is the browser preview"
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        compact ? "px-2 py-1 text-xs" : "px-3 py-1.5",
        primary
          ? "border-transparent bg-accent text-accent-fg hover:opacity-90"
          : "border-border bg-surface text-text hover:bg-surface-2",
        !available && "cursor-not-allowed opacity-50",
        failed && "border-danger text-danger",
      )}
    >
      <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {compact ? "Open" : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Failure state
// ---------------------------------------------------------------------------

interface ErrorCopy {
  title: string;
  body: string;
  hint?: string;
  tone: "danger" | "muted";
}

/** Human copy per protocol error code. Never show the raw code. */
export function describeJobError(error: JobError): ErrorCopy {
  switch (error.code) {
    case "ENCRYPTED_PDF":
      return {
        title: "This PDF is password protected",
        body:
          "It is locked, so its pages cannot be read or changed. Open it in your PDF reader, " +
          "enter the password and save an unlocked copy, then try again with that copy.",
        tone: "danger",
      };
    case "CORRUPT_PDF":
      return {
        title: "This PDF could not be read",
        body:
          "The file looks damaged or is not really a PDF. If it was downloaded or emailed, " +
          "try getting a fresh copy.",
        tone: "danger",
      };
    case "FILE_NOT_FOUND":
      return {
        title: "That file has gone missing",
        body: "It was moved, renamed or deleted since you picked it. Choose it again.",
        tone: "danger",
      };
    case "UNSUPPORTED_FORMAT":
      return {
        title: "That format isn't supported",
        body: "Convert the file to PDF, JPG, PNG or WebP first, then bring it back here.",
        tone: "danger",
      };
    case "GHOSTSCRIPT_MISSING":
      return {
        title: "Strong compression isn't available",
        body:
          "The stronger levels need Ghostscript, which isn't installed on this machine. " +
          "Lossless compression still works and never touches image quality.",
        hint: "Try again with the Lossless level.",
        tone: "danger",
      };
    case "OUTPUT_WRITE_FAILED":
      return {
        title: "Couldn't save the result",
        body:
          "The destination folder may be read-only, full, or the file may be open in another " +
          "program. Close it or pick a different folder.",
        tone: "danger",
      };
    case "CANCELLED":
      return {
        title: "Cancelled",
        body: "Nothing was written. Your original files are untouched.",
        tone: "muted",
      };
    case "BAD_PARAMS":
      return {
        title: "Those settings don't work",
        body: error.message || "Check the page ranges and options, then try again.",
        tone: "danger",
      };
    default:
      return {
        title: "Something went wrong",
        body: error.message || "The operation failed unexpectedly. Nothing was overwritten.",
        tone: "danger",
      };
  }
}

export interface ErrorCardProps {
  error: JobError;
  onRetry?: () => void;
  onAgain?: () => void;
  className?: string;
}

export function ErrorCard({ error, onRetry, onAgain, className }: ErrorCardProps) {
  const [showDetail, setShowDetail] = useState(false);
  const copy = describeJobError(error);
  const danger = copy.tone === "danger";
  const Icon = error.code === "ENCRYPTED_PDF" ? Lock : AlertTriangle;

  return (
    <section
      role="alert"
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border bg-surface shadow-[var(--shadow-card)]",
        danger ? "border-[oklch(0.58_0.2_25/0.4)]" : "border-border",
        className,
      )}
    >
      <div className="flex items-start gap-3 px-4 py-4">
        <span
          className={cn(
            "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
            danger ? "bg-[oklch(0.58_0.2_25/0.12)]" : "bg-surface-2",
          )}
        >
          <Icon
            className={cn("h-4 w-4", danger ? "text-danger" : "text-muted")}
            strokeWidth={2.25}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text">{copy.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{copy.body}</p>
          {copy.hint && <p className="mt-1.5 text-sm font-medium text-text">{copy.hint}</p>}

          {error.detail && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                className="text-xs font-medium text-muted underline-offset-2 hover:text-text hover:underline"
              >
                {showDetail ? "Hide technical details" : "Technical details"}
              </button>
              {showDetail && (
                <pre
                  data-selectable
                  className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-2 p-2.5 text-[12px] leading-relaxed text-muted"
                >
                  {error.code}: {error.detail}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {(onRetry || onAgain) && (
        <footer className="flex items-center gap-2 border-t border-border bg-surface-2/60 px-4 py-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </button>
          )}
          {onAgain && (
            <button
              type="button"
              onClick={onAgain}
              className="ml-auto rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Start over
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

/** One component for both outcomes, when the caller just has a union. */
export function JobOutcome(
  props: ({ error: JobError } & ErrorCardProps) | ({ error?: undefined } & ResultCardProps),
) {
  return props.error ? <ErrorCard {...props} /> : <ResultCard {...props} />;
}

export default ResultCard;
