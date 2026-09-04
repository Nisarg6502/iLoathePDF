import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ToolConfig } from "@/tools/ToolConfig";
import type { EngineResult } from "@/engines/types";
import { tintButtonBg } from "@/tools/tint";
import { FileDropZone } from "./FileDropZone";
import { ResultCard } from "./ResultCard";

type Step = "empty" | "ready" | "running" | "done" | "error";

const LARGE_FILE_WARNING_BYTES = 150 * 1024 * 1024; // ~150 MB, per spec's browser-memory ceiling

const stepFade = {
  initial: { opacity: 0, transform: "translateY(6px)" },
  animate: { opacity: 1, transform: "translateY(0px)" },
  exit: { opacity: 0, transform: "translateY(-6px)" },
  transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] as const },
};

export function ToolPage({ tool }: { tool: ToolConfig }) {
  const [step, setStep] = useState<Step>("empty");
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<Record<string, unknown>>(tool.defaultOptions);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedSizeWarning, setDismissedSizeWarning] = useState(false);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const showSizeWarning = totalBytes > LARGE_FILE_WARNING_BYTES && !dismissedSizeWarning;

  function handleFiles(newFiles: File[]) {
    setFiles(newFiles);
    setDismissedSizeWarning(false);
    setStep("ready");
  }

  function reset() {
    setFiles([]);
    setResult(null);
    setError(null);
    setOptions(tool.defaultOptions);
    setStep("empty");
  }

  async function run() {
    setStep("running");
    setError(null);
    try {
      const engineResult = await tool.engine({ files, options });
      setResult(engineResult);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mt-3.5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_344px]">
        <div>
          <AnimatePresence mode="wait">
            {step === "empty" && (
              <motion.div key="empty" {...stepFade}>
                <FileDropZone accept={tool.accept} multiple={tool.multiple} onFiles={handleFiles} />
              </motion.div>
            )}

            {(step === "ready" || step === "running") && (
              <motion.div key="files" {...stepFade} className="min-h-[400px] rounded-2xl border border-border bg-surface p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">INPUT</span>
                  <button
                    type="button"
                    onClick={reset}
                    disabled={step === "running"}
                    className="text-[12.5px] text-muted hover:text-danger disabled:pointer-events-none disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
                <ul className="flex flex-col gap-2">
                  {files.map((f) => (
                    <li key={f.name} className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 p-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{f.name}</div>
                        <div className="mt-0.5 font-mono text-[11.5px] text-muted">
                          {(f.size / 1024).toFixed(0)} KB
                        </div>
                      </div>
                      {step === "running" && (
                        <svg className="spinner size-4 flex-none text-accent" viewBox="0 0 20 20" fill="none">
                          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                          <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      )}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {step === "error" && (
              <motion.div key="error" {...stepFade} className="min-h-[400px] rounded-2xl border border-danger bg-danger-soft p-8">
                <div className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-danger">ERROR</div>
                <p className="mt-3 text-sm text-text">{error}</p>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-5 rounded-[11px] border border-border px-4 py-2 text-sm text-muted transition-transform duration-100 hover:bg-surface-2 active:scale-[0.97]"
                >
                  Start over
                </button>
              </motion.div>
            )}

            {step === "done" && result && (
              <motion.div key="done" {...stepFade}>
                <ResultCard result={result} onReset={reset} />
              </motion.div>
            )}
          </AnimatePresence>

          {showSizeWarning && (
            <div className="page-in mt-3 flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3.5">
              <span className="mt-0.5 flex-none text-[13px]">⚠</span>
              <div className="flex-1 text-[12.5px] leading-relaxed text-muted">
                {(totalBytes / (1024 * 1024)).toFixed(0)} MB is a lot for one browser tab — this may
                run slowly or the tab may run out of memory. The desktop app has no such limit.
              </div>
              <button
                type="button"
                onClick={() => setDismissedSizeWarning(true)}
                className="flex-none text-[12.5px] text-muted hover:text-text"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        <div className="sticky top-[82px] overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-3.5 text-[12.5px] font-semibold">Options</div>
          <div className="p-4">
            <tool.OptionsPanel
              options={options}
              onChange={setOptions}
              disabled={step === "running" || step === "done"}
              files={files}
            />
          </div>
          <div className="border-t border-border bg-surface-2 px-4 py-3.5">
            <button
              type="button"
              onClick={run}
              disabled={step === "empty" || step === "running"}
              style={step === "empty" || step === "running" ? undefined : { background: tintButtonBg(tool.tint) }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-accent text-sm font-semibold text-on-tint transition-transform duration-100 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint active:enabled:scale-[0.97]"
            >
              {step === "running" && (
                <svg className="spinner size-3.5" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                  <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              {step === "running" ? "Working…" : step === "done" ? "Run again" : "Run"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
