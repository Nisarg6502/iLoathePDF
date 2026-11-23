import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { deleteCustomRecipe, encodeShare, saveCustomRecipe } from "@/recipes/customRecipes";
import { CATEGORIES, getRecipe, recipeHasPreviewStep, type RecipeConfig } from "@/recipes/registry";
import { analyzeChain, describeOutput, diffOptions, sanitizeOptions, type Options } from "@/recipes/chain";
import { getTool } from "@/tools/registry";
import { useCustomRecipes } from "@/recipes/useCustomRecipes";
import { runRecipe, type StepEvent } from "@/recipes/runRecipe";
import { FileDropZone } from "@/components/FileDropZone";
import { ResultCard } from "@/components/ResultCard";
import { DesktopOnlyBadge } from "@/components/DesktopOnlyBadge";
import { PreviewBadge } from "@/components/PreviewBadge";
import { LargeFileWarning, LARGE_FILE_WARNING_BYTES } from "@/components/LargeFileWarning";
import { ChainStrip, StepIcon } from "@/components/recipes/ChainStrip";
import { IssueIcon, IssueList } from "@/components/recipes/IssueList";
import { stepSummary } from "@/components/recipes/stepSummary";
import { formatBytes } from "@/lib/formatBytes";
import type { EngineResult } from "@/engines/types";
import { tr, useTranslation } from "@iloathepdf/i18n";

type Phase = "empty" | "ready" | "running" | "done" | "error";
type StepState = { status: "waiting" | "running" | "done" | "failed"; event?: StepEvent };

const label = (slug: string) => tr(getTool(slug)?.name ?? slug);
const defaultsOf = (slug: string) => getTool(slug)?.defaultOptions ?? {};
const ease = [0.23, 1, 0.32, 1] as const;

const stepFade = {
  initial: { opacity: 0, transform: "translateY(6px)" },
  animate: { opacity: 1, transform: "translateY(0px)" },
  exit: { opacity: 0, transform: "translateY(-6px)" },
  transition: { duration: 0.18, ease },
};

export function RecipeDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  useCustomRecipes(); // re-render when a saved recipe changes
  const recipe = slug ? getRecipe(slug) : undefined;

  if (!recipe) {
    return (
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14">
        <h1 className="text-2xl font-semibold">{t("Recipe not found")}</h1>
        <Link to="/recipes" className="mt-4 inline-block font-mono text-[12px] text-accent">{t("← All recipes")}</Link>
      </div>
    );
  }

  if (recipe.status === "desktop-only") {
    return (
      <div>
        <div className="mx-auto flex max-w-6xl items-start gap-3.5 px-5 sm:px-8 pt-8">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{tr(recipe.title)}</h1>
              <DesktopOnlyBadge />
            </div>
            <p className="mt-1 text-sm text-muted">{tr(recipe.description)}</p>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10">
          <p className="max-w-[58ch] text-[14px] leading-relaxed text-muted">
            {t("This recipe needs a local table-extraction engine that isn't available in a browser yet — it's desktop-only for now.")}
          </p>
          <Link to="/download" className="mt-4 inline-block font-mono text-[12px] text-accent">
            {t("Get the desktop app →")}
          </Link>
        </div>
      </div>
    );
  }

  return <RecipeRunner key={recipe.slug} recipe={recipe} />;
}

function RecipeRunner({ recipe }: { recipe: RecipeConfig }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("empty");
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [error, setError] = useState<{ message: string; step: number | null } | null>(null);
  const [progress, setProgress] = useState(0);
  const [dismissedSizeWarning, setDismissedSizeWarning] = useState(false);
  const [stepStates, setStepStates] = useState<StepState[]>(() => recipe.steps.map(() => ({ status: "waiting" })));
  const [runOpts, setRunOpts] = useState<Options[]>(() => recipe.steps.map((s) => ({ ...defaultsOf(s.tool), ...s.options })));
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const firstTool = getTool(recipe.steps[0].tool);
  const effectiveSteps = recipe.steps.map((s, i) => ({ tool: s.tool, options: runOpts[i] }));
  const analysis = analyzeChain(effectiveSteps, label, defaultsOf, true, tr);
  const firstNeed = analysis.steps.findIndex((s) => s.needs);
  const [openStep, setOpenStep] = useState<number | null>(firstNeed >= 0 ? firstNeed : null);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const showSizeWarning = totalBytes > LARGE_FILE_WARNING_BYTES && !dismissedSizeWarning;
  const mergeNeedsTwo = analysis.needsTwoFiles && files.length < 2;
  const blocker =
    analysis.errors > 0
      ? tr("Fix the problem in the steps first.")
      : firstNeed >= 0
        ? tr("Step {{step}}: {{needs}}.", { step: firstNeed + 1, needs: analysis.steps[firstNeed].needs ?? "" })
        : mergeNeedsTwo && phase !== "empty"
          ? tr("Merging needs at least two PDFs.")
          : null;
  const optsKey = JSON.stringify(runOpts);

  // Settings changed on this page, compared with what the recipe stores (passwords never count).
  const changed = recipe.steps.some((s, i) => {
    const now = sanitizeOptions(s.tool, diffOptions(runOpts[i], defaultsOf(s.tool)));
    const stored = sanitizeOptions(s.tool, diffOptions({ ...defaultsOf(s.tool), ...s.options }, defaultsOf(s.tool)));
    return JSON.stringify(now ?? {}) !== JSON.stringify(stored ?? {});
  });

  function handleFiles(newFiles: File[]) {
    setFiles(newFiles);
    setDismissedSizeWarning(false);
    setPhase("ready");
  }

  function reset() {
    setFiles([]);
    setResult(null);
    setError(null);
    setProgress(0);
    setStepStates(recipe.steps.map(() => ({ status: "waiting" })));
    setPhase("empty");
  }

  async function run() {
    setPhase("running");
    setError(null);
    setProgress(0);
    setStepStates(recipe.steps.map(() => ({ status: "waiting" })));
    let current = -1;
    try {
      const engineResult = await runRecipe(recipe, files, {
        onProgress: setProgress,
        overrides: Object.fromEntries(runOpts.map((o, i) => [i, o])),
        onStep: (ev) => {
          current = ev.index;
          setStepStates((list) => list.map((s, i) => (i === ev.index ? { status: ev.status === "done" ? "done" : "running", event: ev } : s)));
        },
      });
      setResult(engineResult);
      setResultKey(optsKey);
      setPhase("done");
    } catch (e) {
      const step = current >= 0 ? current : null;
      if (step !== null) setStepStates((list) => list.map((s, i) => (i === step ? { ...s, status: "failed" } : s)));
      setError({ message: e instanceof Error ? e.message : String(e), step });
      setPhase("error");
    }
  }

  function saveSettings() {
    const steps = recipe.steps.map((s, i) => ({ tool: s.tool, options: diffOptions(runOpts[i], defaultsOf(s.tool)) }));
    if (recipe.custom) {
      saveCustomRecipe({ id: recipe.slug, title: recipe.title, description: recipe.description, steps });
    } else {
      const saved = saveCustomRecipe({ title: `${tr(recipe.title)} (my version)`, description: recipe.description, steps });
      navigate(`/recipes/${saved.slug}`);
    }
  }

  async function share() {
    const url = `${window.location.origin}/recipes/new#r=${encodeShare(recipe)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(tr("Copy this link to share the recipe:"), url);
    }
  }

  const category = CATEGORIES.find((c) => c.id === recipe.category);
  const busy = phase === "running";

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-8">
        <Link to="/recipes" className="font-mono text-[12px] text-accent">{t("← All recipes")}</Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {category && <span className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">{tr(category.label).toUpperCase()}</span>}
              {recipe.custom && <span className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">{t("YOUR RECIPE")}</span>}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{tr(recipe.title)}</h1>
              {recipeHasPreviewStep(recipe) && <PreviewBadge />}
            </div>
            <p className="mt-1 max-w-[64ch] text-sm text-muted">{tr(recipe.description)}</p>
            {recipe.goodFor && <p className="mt-1 text-[12.5px] text-faint">{t("Good for: {{goodFor}}", { goodFor: recipe.goodFor })}</p>}
            <div className="mt-3">
              <ChainStrip steps={recipe.steps} size={28} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <Link
              to={recipe.custom ? `/recipes/${recipe.slug}/edit` : `/recipes/new?from=${recipe.slug}`}
              className="rounded-[10px] border border-border bg-surface px-3 py-1.5 font-medium transition-transform duration-100 hover:border-accent active:scale-[0.97]"
            >
              {recipe.custom ? t("Edit steps") : t("Customize")}
            </Link>
            <button
              type="button"
              onClick={share}
              className="rounded-[10px] border border-border bg-surface px-3 py-1.5 font-medium transition-transform duration-100 hover:border-accent active:scale-[0.97]"
            >
              {copied ? t("Link copied ✓") : t("Share")}
            </button>
            {recipe.custom && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(tr("Delete \"{{title}}\"? This can't be undone.", { title: tr(recipe.title) }))) {
                    deleteCustomRecipe(recipe.slug);
                    navigate("/recipes");
                  }
                }}
                className="rounded-[10px] px-3 py-1.5 text-muted hover:text-danger disabled:opacity-50"
              >
                {t("Delete")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8">
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {phase === "empty" && (
                <motion.div key="empty" {...stepFade}>
                  <FileDropZone accept={firstTool?.accept ?? []} multiple onFiles={handleFiles} />
                  <p className="mt-2.5 text-center text-[12px] text-muted">
                    {analysis.needsTwoFiles
                      ? t("Add two or more files. They're joined in the order you pick them.")
                      : firstTool && !firstTool.multiple
                        ? t("Add one file, or several to run the recipe on each of them.")
                        : t("Add one or more files.")}{" "}{t("You'll get: {{output}}.", { output: describeOutput(analysis.output, tr).replace(/^\w/, (c) => c.toLowerCase()) })}
                  </p>
                </motion.div>
              )}

              {(phase === "ready" || phase === "running") && (
                <motion.div key="files" {...stepFade} className="rounded-2xl border border-border bg-surface p-5 lg:min-h-[400px]">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">
                      {t("INPUT · {{count}} FILES", { count: files.length })} · {formatBytes(totalBytes)}
                    </span>
                    <button
                      type="button"
                      onClick={reset}
                      disabled={busy}
                      className="text-[12.5px] text-muted hover:text-danger disabled:pointer-events-none disabled:opacity-50"
                    >
                      {t("Remove")}
                    </button>
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {files.map((f, i) => (
                      <motion.li
                        key={`${f.name}-${i}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i, 10) * 0.03, duration: 0.2, ease }}
                        className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 p-3.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{f.name}</div>
                          <div className="mt-0.5 font-mono text-[11.5px] text-muted">{formatBytes(f.size)}</div>
                        </div>
                      </motion.li>
                    ))}
                  </ul>
                  {phase === "running" && (
                    <div className="mt-5">
                      <RunTimeline recipe={recipe} states={stepStates} progress={progress} />
                    </div>
                  )}
                </motion.div>
              )}

              {phase === "error" && error && (
                <motion.div key="error" {...stepFade} className="rounded-2xl border border-danger bg-danger-soft p-6 sm:p-8 lg:min-h-[400px]">
                  <div className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-danger">
                    {error.step !== null ? t("STOPPED AT STEP {{step}}", { step: error.step + 1 }) : t("ERROR")}
                  </div>
                  <p className="mt-3 text-sm text-text">{error.message}</p>
                  <div className="mt-5">
                    <RunTimeline recipe={recipe} states={stepStates} progress={progress} />
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    {error.step !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenStep(error.step);
                          setPhase("ready");
                        }}
                        className="rounded-[11px] bg-accent px-4 py-2 text-sm font-semibold text-on-tint transition-transform duration-100 active:scale-[0.97]"
                      >
                        {t("Adjust step {{step}} and retry", { step: error.step + 1 })}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={reset}
                      className="rounded-[11px] border border-border px-4 py-2 text-sm text-muted transition-transform duration-100 hover:bg-surface-2 active:scale-[0.97]"
                    >
                      {t("Start over")}
                    </button>
                  </div>
                </motion.div>
              )}

              {phase === "done" && result && (
                <motion.div key="done" {...stepFade} className="flex flex-col gap-4">
                  <ResultCard result={result} onReset={reset} outdated={resultKey !== optsKey} />
                  <div className="rounded-2xl border border-border bg-surface p-5">
                    <div className="mb-3 font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">{t("HOW IT WENT")}</div>
                    <RunTimeline recipe={recipe} states={stepStates} progress={1} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {showSizeWarning && <LargeFileWarning totalBytes={totalBytes} onDismiss={() => setDismissedSizeWarning(true)} />}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface lg:sticky lg:top-[82px]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <span className="text-[12.5px] font-semibold">{t("Steps")}</span>
              <span className="text-[11.5px] text-muted">{t("Tap a step to adjust it")}</span>
            </div>
            <ol className="m-0 list-none p-2">
              {recipe.steps.map((step, i) => {
                const tool = getTool(step.tool);
                if (!tool) return null;
                const a = analysis.steps[i];
                const open = openStep === i;
                const st = stepStates[i];
                return (
                  <li key={i} className={`rounded-xl transition-colors duration-200 ${open ? "bg-surface-2" : ""}`}>
                    <button
                      type="button"
                      onClick={() => setOpenStep(open ? null : i)}
                      aria-expanded={open}
                      aria-label={t("Step {{step}}: {{name}}", { step: i + 1, name: tr(tool.name) })}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-surface-2"
                    >
                      <StepBadge index={i} state={st.status} />
                      <StepIcon tool={step.tool} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{tr(tool.name)}</span>
                        <span className={`block truncate text-[11.5px] ${a.needs ? "text-info" : "text-muted"}`}>
                          {a.needs ?? stepSummary({ tool: step.tool, options: runOpts[i] }, {})}
                        </span>
                      </span>
                      {a.needs && (
                        <span className="text-info">
                          <IssueIcon level="info" />
                        </span>
                      )}
                      <svg viewBox="0 0 16 16" className={`size-3.5 flex-none text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden>
                        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {a.issues.length > 0 && (
                      <div className="px-2 pb-2">
                        <IssueList issues={a.issues} />
                      </div>
                    )}
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease }}
                          className="overflow-hidden"
                        >
                          <div className="px-2.5 pb-3 pt-1">
                            <tool.OptionsPanel
                              options={runOpts[i]}
                              onChange={(o) => setRunOpts((list) => list.map((x, j) => (j === i ? o : x)))}
                              disabled={busy}
                              files={i === 0 && files.length > 0 ? files : undefined}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ol>
            <AnimatePresence initial={false}>
              {changed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mx-4 mb-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px]">
                    <span className="text-muted">{t("Changed settings apply to this run.")}</span>
                    <button type="button" onClick={saveSettings} className="flex-none font-semibold text-accent-deep hover:underline">
                      {recipe.custom ? t("Save to recipe") : t("Save as my recipe")}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="border-t border-border bg-surface-2 px-4 py-3.5">
              <motion.button
                type="button"
                onClick={run}
                disabled={phase === "empty" || busy || !!blocker}
                whileTap={{ scale: 0.97 }}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-accent text-sm font-semibold text-on-tint disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
              >
                {busy && (
                  <svg className="spinner size-3.5" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                    <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                {busy ? t("Working… {{Math}}%", { Math: Math.round(progress * 100) }) : phase === "done" ? t("Run again") : t("Run")}
              </motion.button>
              {phase !== "empty" && blocker && !busy && <p className="mt-2 text-center text-[12.5px] text-muted">{blocker}</p>}
              {phase === "empty" && <p className="mt-2 text-center text-[12px] text-faint">{t("Add files to start. Nothing leaves this device.")}</p>}
            </div>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

function StepBadge({ index, state }: { index: number; state: StepState["status"] }) {
  return (
    <span className="relative grid size-5 flex-none place-items-center">
      <AnimatePresence mode="popLayout" initial={false}>
        {state === "done" ? (
          <motion.span
            key="done"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 600, damping: 28 }}
            className="grid size-5 place-items-center rounded-full bg-ok text-on-tint"
          >
            <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
              <motion.path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, ease }} />
            </svg>
          </motion.span>
        ) : state === "failed" ? (
          <motion.span key="failed" initial={{ scale: 0.4 }} animate={{ scale: 1 }} className="grid size-5 place-items-center rounded-full bg-danger text-[11px] font-bold text-on-tint">
            !
          </motion.span>
        ) : state === "running" ? (
          <motion.span key="running" initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="grid size-5 place-items-center text-accent">
            <svg className="spinner size-5" viewBox="0 0 20 20" fill="none" aria-hidden>
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
              <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </motion.span>
        ) : (
          <motion.span key="wait" className="grid size-5 place-items-center rounded-full bg-surface-2 font-mono text-[10.5px] text-muted">
            {index + 1}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** The recipe's steps lighting up one after another, with what each one did. */
function RunTimeline({ recipe, states, progress }: { recipe: RecipeConfig; states: StepState[]; progress: number }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: `${Math.round(progress * 100)}%` }} transition={{ duration: 0.3, ease }} />
      </div>
      <ol className="m-0 list-none p-0">
        {recipe.steps.map((step, i) => {
          const st = states[i];
          const ev = st.event;
          const active = st.status === "running";
          return (
            <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
              {i < recipe.steps.length - 1 && (
                <span className="absolute left-[9.5px] top-6 h-[calc(100%-18px)] w-px overflow-hidden bg-border" aria-hidden>
                  <motion.span
                    className="block w-px bg-ok"
                    initial={false}
                    animate={{ height: st.status === "done" ? "100%" : "0%" }}
                    transition={{ duration: 0.35, ease }}
                  />
                </span>
              )}
              <StepBadge index={i} state={st.status} />
              <motion.div
                className="min-w-0 flex-1"
                animate={{ opacity: st.status === "waiting" ? 0.5 : 1, x: active ? 2 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 text-[13px]">
                  <StepIcon tool={step.tool} size={20} />
                  <span className="font-medium">{label(step.tool)}</span>
                  {active && <span className="font-mono text-[11px] text-accent-deep">{t("working…")}</span>}
                </div>
                {ev && st.status === "done" && (
                  <motion.div initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} className="mt-0.5 font-mono text-[11px] text-muted">
                    {t("{{filesIn}} → {{files}}", { filesIn: ev.filesIn, files: t("{{count}} files", { count: ev.filesOut }) })} · {formatBytes(ev.bytesIn)} → {formatBytes(ev.bytesOut ?? 0)}
                    {ev.ms !== undefined && ` · ${ev.ms < 1000 ? `${Math.round(ev.ms)} ms` : `${(ev.ms / 1000).toFixed(1)} s`}`}
                  </motion.div>
                )}
              </motion.div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
