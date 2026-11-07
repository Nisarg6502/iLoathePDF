import { useEffect, useState } from "react";
import { PreviewBadge } from "./PreviewBadge";
import type { EngineResult } from "@/engines/types";
import { formatBytes } from "@/lib/formatBytes";

export function ResultCard({
  result,
  onReset,
}: {
  result: EngineResult;
  onReset: () => void;
}) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const created = result.files.map((f) => URL.createObjectURL(f.blob));
    setUrls(created);
    return () => {
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [result.files]);

  return (
    <div className="flex min-h-[400px] flex-col justify-center rounded-2xl border border-border bg-surface p-8">
      <div className="flex items-center gap-2">
        <span className="size-1.75 rounded-full bg-ok" />
        <span className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-ok">DONE · ON THIS MACHINE</span>
        {result.isPreview && <PreviewBadge />}
      </div>
      <div className="mt-5 text-lg font-semibold">{result.summary}</div>
      {result.files.length > 1 && (
        <div className="mt-1 font-mono text-[12px] text-muted" data-testid="result-total">
          {result.files.length} files · {formatBytes(result.files.reduce((sum, f) => sum + f.blob.size, 0))} total
        </div>
      )}
      <div className="mt-5 flex flex-col gap-2.5">
        {result.files.map((f, i) => (
          <div
            key={f.name}
            className="page-in flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 p-3.5"
            style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium">{f.name}</div>
              <div className="mt-0.5 font-mono text-[11.5px] text-muted">{f.detail ?? formatBytes(f.blob.size)}</div>
            </div>
            <a
              href={urls[i]}
              download={f.name}
              className="rounded-[9px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-on-accent transition-transform duration-100 hover:bg-accent-hi active:scale-[0.97]"
            >
              Download
            </a>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-5 w-fit rounded-[11px] border border-border px-4 py-2 text-sm text-muted transition-transform duration-100 hover:bg-surface-2 hover:text-text active:scale-[0.97]"
      >
        Start over
      </button>
    </div>
  );
}
