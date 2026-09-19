import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { getRecipe, recipeHasPreviewStep } from "@/recipes/registry";
import { getTool } from "@/tools/registry";
import { runRecipe } from "@/recipes/runRecipe";
import { FileDropZone } from "@/components/FileDropZone";
import { ResultCard } from "@/components/ResultCard";
import { DesktopOnlyBadge } from "@/components/DesktopOnlyBadge";
import { PreviewBadge } from "@/components/PreviewBadge";
import { LargeFileWarning, LARGE_FILE_WARNING_BYTES } from "@/components/LargeFileWarning";
import type { EngineResult } from "@/engines/types";

type Step = "empty" | "ready" | "running" | "done" | "error";

const stepFade = {
  initial: { opacity: 0, transform: "translateY(6px)" },
  animate: { opacity: 1, transform: "translateY(0px)" },
  exit: { opacity: 0, transform: "translateY(-6px)" },
  transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] as const },
};

export function RecipeDetail() {
  const { slug } = useParams<{ slug: string }>();
  const recipe = slug ? getRecipe(slug) : undefined;

  const [step, setStep] = useState<Step>("empty");
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dismissedSizeWarning, setDismissedSizeWarning] = useState(false);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const showSizeWarning = totalBytes > LARGE_FILE_WARNING_BYTES && !dismissedSizeWarning;

  if (!recipe) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-14">
        <h1 className="text-2xl font-semibold">Recipe not found</h1>
      </div>
    );
  }

  if (recipe.status === "desktop-only") {
    return (
      <div>
        <div className="mx-auto flex max-w-6xl items-start gap-3.5 px-8 pt-8">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{recipe.title}</h1>
              <DesktopOnlyBadge />
            </div>
            <p className="mt-1 text-sm text-muted">{recipe.description}</p>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-8 py-10">
          <p className="max-w-[58ch] text-[14px] leading-relaxed text-muted">
            This recipe needs a local table-extraction engine that isn't available in a browser yet — it's desktop-only for now.
          </p>
          <Link to="/download" className="mt-4 inline-block font-mono text-[12px] text-accent">
            Get the desktop app →
          </Link>
        </div>
      </div>
    );
  }

  const firstTool = getTool(recipe.steps[0]);

  function handleFiles(newFiles: File[]) {
    setFiles(newFiles);
    setDismissedSizeWarning(false);
    setStep("ready");
  }

  function reset() {
    setFiles([]);
    setResult(null);
    setError(null);
    setProgress(0);
    setStep("empty");
  }

  async function run() {
    setStep("running");
    setError(null);
    try {
      const engineResult = await runRecipe(recipe!, files, setProgress);
      setResult(engineResult);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }

  return (
    <div>
      <div className="mx-auto flex max-w-6xl items-start gap-3.5 px-8 pt-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{recipe.title}</h1>
            {recipeHasPreviewStep(recipe) && <PreviewBadge />}
          </div>
          <p className="mt-1 text-sm text-muted">{recipe.description}</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mt-3.5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_344px]">
          <div>
            <AnimatePresence mode="wait">
              {step === "empty" && (
                <motion.div key="empty" {...stepFade}>
                  <FileDropZone
                    accept={firstTool?.accept ?? []}
                    multiple={firstTool?.multiple ?? false}
                    onFiles={handleFiles}
                  />
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
                  {step === "running" && (
                    <div className="mt-3 font-mono text-[11px] text-faint">
                      {Math.round(progress * 100)}%
                    </div>
                  )}
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
              <LargeFileWarning totalBytes={totalBytes} onDismiss={() => setDismissedSizeWarning(true)} />
            )}
          </div>

          <div className="sticky top-[82px] overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="border-b border-border px-4 py-3.5 text-[12.5px] font-semibold">Steps</div>
            <div className="p-4">
              <ol className="flex flex-col gap-2.5">
                {recipe.steps.map((toolSlug, i) => {
                  const stepTool = getTool(toolSlug);
                  return (
                    <li key={toolSlug} className="flex items-center gap-2.5 text-[13px]">
                      <span className="grid size-5 flex-none place-items-center rounded-full bg-surface-2 font-mono text-[10.5px] text-muted">
                        {i + 1}
                      </span>
                      <span>{stepTool?.name ?? toolSlug}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="border-t border-border bg-surface-2 px-4 py-3.5">
              <button
                type="button"
                onClick={run}
                disabled={step === "empty" || step === "running"}
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
    </div>
  );
}
