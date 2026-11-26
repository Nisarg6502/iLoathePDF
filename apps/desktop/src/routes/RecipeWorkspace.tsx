/**
 * The screen a Recipe runs in: same shell as ToolWorkspace (header, canvas,
 * sidebar with a destination and Run button), but driving `runRecipe()`
 * across a chain of tools instead of `execute()` for one tool.
 *
 * The recipe's accepted files are the first step's (`toolById(steps[0])`),
 * but it always takes several: a one-file tool simply runs once per file.
 * The sidebar lists the steps; each opens its tool's own options form, so a
 * setting can be changed for this run (and saved back), and a step that needs
 * something typed in, like a password, is opened for you and blocks Run until
 * it's filled. While running, the canvas shows each step light up in turn.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, FolderOpen, Loader2, Pencil, Play, Plus, RotateCcw, SlidersHorizontal, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";

import { JobProgress } from "@/components/JobProgress";
import { JobOutcome } from "@/components/ResultCard";
import { useFilePicker, type PickedFile } from "@/components/FileDropZone";
import { Button } from "@/components/ui/button";
import { JobError, isTauri, type Progress } from "@/lib/jobs";
import { deleteCustomRecipe, encodeShare, saveCustomRecipe } from "@/lib/customRecipes";
import { runRecipe, STEPS_FOLDER, type StepEvent } from "@/lib/recipeRun";
import { analyzeChain, describeOutput, diffOptions, sanitizeOptions } from "@/lib/chain";
import { ToolOptions } from "@/components/OptionsPanel";
import { ChainStrip, StepIcon } from "@/components/recipes/ChainStrip";
import { IssueIcon, IssueList } from "@/components/recipes/IssueList";
import { stepSummary } from "@/components/recipes/stepSummary";
import type { JobResult } from "@/lib/run";
import { takePendingFiles } from "@/lib/handoff";
import { useOutputDir } from "@/lib/settings";
import { EASE_OUT, panelVariants } from "@/lib/motion";
import { toolById, type OptionValues } from "@/lib/tools";
import { cn, formatBytes, isMac } from "@/lib/utils";
import type { Recipe } from "@/lib/recipes";
import { tr, useTranslation } from "@iloathepdf/i18n";

type StepState = { status: "waiting" | "running" | "done" | "failed"; event?: StepEvent };
const label = (id: string) => tr(toolById(id)?.title ?? id);
const defaultsOf = (id: string) => (toolById(id)?.defaults ?? {}) as Record<string, unknown>;

type RunState =
  | { phase: "idle" }
  | { phase: "running"; pct: number; note: string }
  | { phase: "done"; result: JobResult }
  | { phase: "error"; error: JobError };

export default function RecipeWorkspace({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation();
  const firstTool = toolById(recipe.steps[0]?.tool);
  const navigate = useNavigate();

  const [files, setFiles] = useState<PickedFile[]>([]);
  const [state, setState] = useState<RunState>({ phase: "idle" });
  const [startedAt, setStartedAt] = useState(0);
  // Which step was in flight when the run ended -- the only way to tell,
  // from outside runRecipe(), which step a CANCELLED (or any other) error
  // interrupted. 0 means no step had started yet.
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStates, setStepStates] = useState<StepState[]>(() => recipe.steps.map(() => ({ status: "waiting" })));
  const [runOpts, setRunOpts] = useState<OptionValues[]>(() =>
    recipe.steps.map((s) => ({ ...toolById(s.tool)?.defaults, ...(s.options as OptionValues | undefined) })),
  );
  const effectiveSteps = recipe.steps.map((s, i) => ({ tool: s.tool, options: runOpts[i] as Record<string, unknown> }));
  const analysis = analyzeChain(effectiveSteps, label, defaultsOf, true, tr);
  const firstNeed = analysis.steps.findIndex((s) => s.needs);
  const [openStep, setOpenStep] = useState<number | null>(firstNeed >= 0 ? firstNeed : null);
  const changed = recipe.steps.some((s, i) => {
    const now = sanitizeOptions(s.tool, diffOptions(runOpts[i], defaultsOf(s.tool)));
    const stored = sanitizeOptions(s.tool, diffOptions({ ...defaultsOf(s.tool), ...s.options }, defaultsOf(s.tool)));
    return JSON.stringify(now ?? {}) !== JSON.stringify(stored ?? {});
  });
  const abort = useRef<AbortController | null>(null);
  const { outputDir } = useOutputDir();

  const { browse, dragging, rejected, picking } = useFilePicker({
    accept: firstTool?.accepts ?? [],
    // A one-file tool runs once per file, so a recipe always takes several.
    multiple: true,
    files,
    onChange: (next) => {
      setFiles(next);
      setState({ phase: "idle" });
    },
  });

  // Switching recipes resets the workspace, but a drop made on the home
  // screen is handed over rather than thrown away.
  useEffect(() => {
    if (!firstTool) return;
    const handed = takePendingFiles().filter((f) =>
      firstTool.accepts.includes((f.name.split(".").pop() ?? "").toLowerCase()),
    );
    setFiles(handed);
    setState({ phase: "idle" });
  }, [recipe, firstTool]);

  const blocker = useMemo(() => {
    if (!firstTool) return tr("This recipe is misconfigured.");
    if (files.length === 0) return tr("Add {{files}} to continue.", { files: tr(firstTool.acceptsLabel) });
    if (analysis.errors > 0) return tr("Fix the problem in the steps first.");
    if (firstNeed >= 0) return tr("Step {{step}}: {{needs}}.", { step: firstNeed + 1, needs: analysis.steps[firstNeed].needs ?? "" });
    if (analysis.needsTwoFiles && files.length < 2) {
      return tr("Merging needs at least two PDFs.");
    }
    return null;
  }, [files.length, firstTool, analysis, firstNeed]);

  const running = state.phase === "running";

  const run = useCallback(async () => {
    if (blocker || running) return;
    const controller = new AbortController();
    abort.current = controller;
    setStartedAt(Date.now());
    setCurrentStep(0);
    setStepStates(recipe.steps.map(() => ({ status: "waiting" })));
    setState({ phase: "running", pct: 0, note: tr("Starting…") });

    const onProgress = (p: Progress) =>
      setState((prev) =>
        prev.phase === "running" ? { ...prev, pct: p.pct, note: p.note } : prev,
      );

    try {
      const result = await runRecipe(recipe, files, {
        onProgress,
        signal: controller.signal,
        overrides: Object.fromEntries(runOpts.map((o, i) => [i, o])),
        onStep: (ev) => {
          if (ev.status === "running") setCurrentStep(ev.index + 1);
          setStepStates((list) => list.map((x, i) => (i === ev.index ? { status: ev.status, event: ev } : x)));
        },
      });
      setState({ phase: "done", result });
    } catch (err) {
      setStepStates((list) => list.map((x) => (x.status === "running" ? { ...x, status: "failed" } : x)));
      setState({
        phase: "error",
        error: err instanceof JobError ? err : new JobError("INTERNAL", String(err)),
      });
    } finally {
      abort.current = null;
    }
  }, [blocker, running, recipe, files, runOpts]);

  // Ctrl+Enter runs, matching the hint on the button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  if (!firstTool) {
    return (
      <div className="grid flex-1 place-items-center p-10 text-center text-[14px] text-muted">
        {t("This recipe references a tool that no longer exists.")}
      </div>
    );
  }

  const totalBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const inputSummary =
    files.length === 0
      ? null
      : `${tr("{{count}} files", { count: files.length })}${totalBytes ? ` · ${formatBytes(totalBytes)}` : ""}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <header className="flex h-[54px] flex-none items-center gap-3 border-b border-border bg-surface px-5">
        <ChainStrip steps={recipe.steps} size={24} />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.005em] text-text">{tr(recipe.title)}</div>
          <div className="truncate text-[12.5px] text-muted">{tr(recipe.description)}</div>
        </div>

        <div className="flex-1" />

        <ShareCode recipe={recipe} />
        {recipe.custom ? (
          <CustomRecipeActions recipe={recipe} disabled={running} />
        ) : (
          <Button variant="secondary" size="sm" className="mr-2" disabled={running} onClick={() => navigate(`/r/new?from=${recipe.id}`)}>
            <SlidersHorizontal />
            {t("Customize")}
          </Button>
        )}

        {files.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted">{inputSummary}</span>
            <Button variant="secondary" size="sm" onClick={browse} disabled={!isTauri()}>
              <Plus />
              {t("Add files")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setFiles([]);
                setState({ phase: "idle" });
              }}
            >
              {t("Clear")}
            </Button>
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── canvas ───────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            {state.phase === "running" ? (
              <motion.div
                key="running"
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="grid min-h-0 flex-1 place-items-center p-10"
              >
                <div className="w-full max-w-[560px]">
                  <JobProgress
                    title={tr(recipe.title)}
                    progress={{ id: "current", pct: state.pct, note: state.note }}
                    phase="running"
                    startedAt={startedAt}
                    onCancel={() => abort.current?.abort()}
                  />
                  <div className="mt-4 rounded-[var(--radius-card)] border border-border bg-surface p-4">
                    <RunTimeline recipe={recipe} states={stepStates} />
                  </div>
                </div>
              </motion.div>
            ) : state.phase === "done" ? (
              <motion.div
                key="done"
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="min-h-0 flex-1 overflow-auto p-6"
              >
                <div className="mx-auto max-w-[720px]">
                  <JobOutcome
                    files={state.result.outputs}
                    title={state.result.summary}
                    compression={state.result.compression}
                    onAgain={() => setState({ phase: "idle" })}
                    againLabel={tr("Back to start")}
                  />
                  <div className="mt-4 rounded-[var(--radius-card)] border border-border bg-surface p-4">
                    <div className="mb-3 font-mono text-[11.5px] font-bold tracking-[0.13em] text-faint">{t("HOW IT WENT")}</div>
                    <RunTimeline recipe={recipe} states={stepStates} />
                    {recipe.steps.length > 1 ? (
                      <p className="mt-3 text-[12.5px] text-muted">
                        {t("In-between files from the earlier steps are in the “{{STEPS_FOLDER}}” folder next to the result. You can delete it.", { STEPS_FOLDER })}
                      </p>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            ) : state.phase === "error" ? (
              <motion.div
                key="error"
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="min-h-0 flex-1 overflow-auto p-6"
              >
                <div className="mx-auto max-w-[720px]">
                  {state.error.code === "CANCELLED" ? (
                    <RecipeCancelledCard
                      recipe={recipe}
                      completedSteps={Math.max(0, currentStep - 1)}
                      outputDir={outputDir}
                      onRetry={() => void run()}
                      onAgain={() => setState({ phase: "idle" })}
                    />
                  ) : (
                    <>
                      <JobOutcome
                        error={state.error}
                        onRetry={() => void run()}
                        onAgain={() => setState({ phase: "idle" })}
                      />
                      <div className="mt-4 rounded-[var(--radius-card)] border border-border bg-surface p-4">
                        <RunTimeline recipe={recipe} states={stepStates} />
                        {currentStep > 0 ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="mt-3"
                            onClick={() => {
                              setOpenStep(currentStep - 1);
                              setState({ phase: "idle" });
                            }}
                          >
                            <SlidersHorizontal />
                            {t("Adjust step {{step}} and retry", { step: currentStep })}
                          </Button>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            ) : files.length === 0 ? (
              <motion.button
                key="empty"
                type="button"
                onClick={browse}
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className={cn(
                  "m-4 flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5 rounded-[14px]",
                  "border bg-surface outline-none transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  dragging
                    ? "border-accent bg-accent-soft"
                    : "border-border hover:border-accent hover:bg-accent-soft",
                  "focus-visible:ring-2 focus-visible:ring-accent",
                )}
              >
                <span
                  className={cn(
                    "grid size-[66px] place-items-center rounded-[20px] bg-accent-soft",
                    "shadow-[0_0_0_10px_color-mix(in_oklab,var(--accent-soft)_45%,transparent)]",
                    picking && "ihp-pulse",
                  )}
                >
                  <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="1.4">
                    <path d="M10 13.5V4M10 4L6.8 7.2M10 4l3.2 3.2" />
                    <path d="M3.5 12.5V15a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 16.5 15v-2.5" />
                  </svg>
                </span>
                <span className="text-center">
                  <span className="block text-[17px] font-semibold text-text">
                    {picking ? t("Opening the file picker…") : t("Drop {{acceptsLabel}} here", { acceptsLabel: firstTool.acceptsLabel })}
                  </span>
                  <span className="mt-1 block text-[13.5px] text-muted">
                    {picking
                      ? (isMac() ? t("This can take a moment the first time.") : t("Windows can take a moment the first time."))
                      : t("or click anywhere in this box to browse")}
                  </span>
                </span>
                <span className="font-mono text-[11.5px] tracking-[0.13em] text-faint uppercase">
                  {firstTool.accepts.slice(0, 6).join(" · ")}
                </span>
                <span className="max-w-[46ch] text-center text-[13px] text-muted">
                  {analysis.needsTwoFiles
                    ? t("Two or more files, joined in the order you add them.")
                    : firstTool.multiple
                      ? t("One or more files.")
                      : t("One file, or several to run the recipe on each.")}{" "}{t("You get: {{output}}.", { output: describeOutput(analysis.output, tr).replace(/^\w/, (c) => c.toLowerCase()) })}
                </span>
                {rejected > 0 ? (
                  <span className="text-[13px] text-danger">
                    {t("{{count}} files skipped: wrong format for this recipe.", { count: rejected })}
                  </span>
                ) : null}
              </motion.button>
            ) : (
              <motion.div
                key="list"
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="min-h-0 flex-1 overflow-auto px-5 py-4"
              >
                <FileList files={files} onChange={setFiles} ordered={firstTool.ordered} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── steps ────────────────────────────────────────────────────── */}
        <aside className="flex w-[344px] flex-none flex-col border-l border-border bg-surface">
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-2.5 flex items-baseline justify-between">
              <span className="font-mono text-[12px] font-bold tracking-[0.13em] text-faint">{t("STEPS")}</span>
              <span className="text-[12px] text-muted">{t("Click a step to adjust it")}</span>
            </div>
            <StepsPanel
              recipe={recipe}
              runOpts={runOpts}
              analysis={analysis}
              states={stepStates}
              open={openStep}
              onOpen={setOpenStep}
              disabled={running}
              onChange={(i, v) => setRunOpts((list) => list.map((x, j) => (j === i ? v : x)))}
            />
            <AnimatePresence initial={false}>
              {changed ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12.5px]">
                    <span className="text-muted">{t("Changed settings apply to this run.")}</span>
                    <button
                      type="button"
                      className="flex-none font-semibold text-accent hover:underline"
                      onClick={() => {
                        const steps = recipe.steps.map((s, i) => ({ tool: s.tool, options: diffOptions(runOpts[i], defaultsOf(s.tool)) }));
                        if (recipe.custom) {
                          saveCustomRecipe({ id: recipe.id, title: recipe.title, description: recipe.description, steps });
                        } else {
                          const saved = saveCustomRecipe({ title: `${tr(recipe.title)} (my version)`, description: recipe.description, steps });
                          navigate(`/r/${saved.id}`);
                        }
                      }}
                    >
                      {recipe.custom ? t("Save to recipe") : t("Save as my recipe")}
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <RunFooter
            recipe={recipe}
            blocker={blocker}
            running={running}
            onRun={() => void run()}
            fileCount={files.length}
          />
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Edit / delete for a user-built recipe. Delete asks for a second click rather than a native dialog. */
function CustomRecipeActions({ recipe, disabled }: { recipe: Recipe; disabled: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="mr-2 flex items-center gap-2">
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => navigate(`/r/${recipe.id}/edit`)}>
        <Pencil />
        {t("Edit")}
      </Button>
      {confirming ? (
        <>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              deleteCustomRecipe(recipe.id);
              navigate("/");
            }}
          >
            {t("Delete for good?")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
            {t("Keep")}
          </Button>
        </>
      ) : (
        <Button variant="danger" size="sm" disabled={disabled} onClick={() => setConfirming(true)}>
          <Trash2 />
          {t("Delete")}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * ResultCard's generic CANCELLED copy ("Nothing was written. Your original
 * files are untouched.") is correct for a standalone tool but false for a
 * cancelled recipe: earlier steps' outputs are already on disk by the time
 * a later step is cancelled, and this app has no file-deletion capability
 * to remove them even if it wanted to. This renders recipe-aware copy in
 * the same visual shape as ResultCard's ErrorCard, instead of changing
 * ErrorCard's generic (and, for a standalone tool, accurate) behavior.
 */
function RecipeCancelledCard({
  recipe,
  completedSteps,
  outputDir,
  onRetry,
  onAgain,
}: {
  recipe: Recipe;
  completedSteps: number;
  outputDir: string | null;
  onRetry: () => void;
  onAgain: () => void;
}) {
  const { t } = useTranslation();
  const total = recipe.steps.length;
  const dirLabel = outputDir ?? tr("the folder of the first input file");
  const body =
    completedSteps > 0
      ? tr("Stopped after step {{completed}} of {{total}}. Files written by the completed steps are in the “{{folder}}” folder inside {{dir}}; nothing was deleted.", { count: completedSteps, completed: completedSteps, total, folder: STEPS_FOLDER, dir: dirLabel })
      : tr("Stopped before any step finished. No recipe output was written.");

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3 px-4 py-4">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2">
          <AlertTriangle className="h-4 w-4 text-muted" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text">{t("Cancelled")}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
        </div>
      </div>
      <footer className="flex items-center gap-2 border-t border-border bg-surface-2/60 px-4 py-3">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("Try again")}
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="ml-auto rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("Start over")}
        </button>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------------------

function StepsPanel({
  recipe,
  runOpts,
  analysis,
  states,
  open,
  onOpen,
  disabled,
  onChange,
}: {
  recipe: Recipe;
  runOpts: OptionValues[];
  analysis: ReturnType<typeof analyzeChain>;
  states: StepState[];
  open: number | null;
  onOpen: (i: number | null) => void;
  disabled: boolean;
  onChange: (i: number, v: OptionValues) => void;
}) {
  const { t } = useTranslation();
  return (
    <ol className="grid gap-1.5">
      {recipe.steps.map((step, i) => {
        const tool = toolById(step.tool);
        const a = analysis.steps[i];
        const isOpen = open === i;
        if (!tool) {
          return (
            <li key={i} className="rounded-lg border border-danger/40 px-3 py-2.5 text-[13.5px] text-danger">
              {t("Unknown tool “{{tool}}”", { tool: step.tool })}
            </li>
          );
        }
        return (
          <li
            key={i}
            className={cn(
              "overflow-hidden rounded-lg border bg-surface-2/60 transition-colors duration-200",
              a.needs ? "border-info/50" : a.issues.length ? "border-danger/50" : isOpen ? "border-accent" : "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => onOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-label={t("Step {{step}}: {{title}}", { step: i + 1, title: tr(tool.title) })}
              className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <StepBadge index={i} state={states[i]?.status ?? "waiting"} />
              <StepIcon tool={step.tool} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-text">{tr(tool.title)}</span>
                <span className={cn("block truncate text-[12px]", a.needs ? "text-info" : "text-muted")}>
                  {a.needs ?? stepSummary({ tool: step.tool, options: runOpts[i] }, {})}
                </span>
              </span>
              {a.needs ? (
                <span className="text-info">
                  <IssueIcon level="info" />
                </span>
              ) : null}
              <ChevronDown className={cn("size-4 flex-none text-faint transition-transform duration-200", isOpen && "rotate-180")} />
            </button>
            {a.issues.length > 0 ? (
              <div className="px-2.5 pb-2.5">
                <IssueList issues={a.issues} />
              </div>
            ) : null}
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <fieldset disabled={disabled} className="border-t border-border bg-surface px-3 py-3">
                    {step.tool === "protect" ? (
                      <p className="mb-3 text-[12px] text-muted">{t("Passwords are never saved with a recipe.")}</p>
                    ) : null}
                    <ToolOptions tool={tool} values={runOpts[i]} onChange={(v) => onChange(i, v)} />
                  </fieldset>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </li>
        );
      })}
    </ol>
  );
}

function StepBadge({ index, state }: { index: number; state: StepState["status"] }) {
  return (
    <span className="relative grid size-6 flex-none place-items-center">
      <AnimatePresence mode="popLayout" initial={false}>
        {state === "done" ? (
          <motion.span
            key="done"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: "spring", stiffness: 600, damping: 28 }}
            className="grid size-6 place-items-center rounded-full bg-ok text-surface"
          >
            <Check className="size-3.5" strokeWidth={3} />
          </motion.span>
        ) : state === "failed" ? (
          <motion.span key="failed" initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="grid size-6 place-items-center rounded-full bg-danger text-[12px] font-bold text-surface">
            !
          </motion.span>
        ) : state === "running" ? (
          <motion.span key="running" initial={{ scale: 0.7 }} animate={{ scale: 1 }} className="grid size-6 place-items-center text-accent">
            <Loader2 className="size-5 animate-spin" />
          </motion.span>
        ) : (
          <motion.span key="wait" className="grid size-6 place-items-center rounded-full bg-surface font-mono text-[11px] font-bold text-muted">
            {index + 1}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** The recipe's steps lighting up one after another, with what each one did. */
function RunTimeline({ recipe, states }: { recipe: Recipe; states: StepState[] }) {
  const { t } = useTranslation();
  return (
    <ol className="grid">
      {recipe.steps.map((step, i) => {
        const st = states[i] ?? { status: "waiting" };
        const ev = st.event;
        return (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {i < recipe.steps.length - 1 ? (
              <span className="absolute left-[11.5px] top-7 h-[calc(100%-22px)] w-px overflow-hidden bg-border" aria-hidden>
                <motion.span
                  className="block w-px bg-ok"
                  initial={false}
                  animate={{ height: st.status === "done" ? "100%" : "0%" }}
                  transition={{ duration: 0.35, ease: EASE_OUT }}
                />
              </span>
            ) : null}
            <StepBadge index={i} state={st.status} />
            <motion.div
              className="min-w-0 flex-1"
              animate={{ opacity: st.status === "waiting" ? 0.5 : 1, x: st.status === "running" ? 2 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-2 text-[13.5px] text-text">
                <StepIcon tool={step.tool} size={20} />
                <span className="font-medium">{label(step.tool)}</span>
                {st.status === "running" ? <span className="font-mono text-[11.5px] text-accent">{t("working…")}</span> : null}
              </div>
              {ev && st.status === "done" ? (
                <motion.div initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} className="mt-0.5 font-mono text-[11.5px] text-muted">
                  {t("{{filesIn}} → {{files}}", { filesIn: ev.filesIn, files: t("{{count}} files", { count: ev.filesOut }) })} · {formatBytes(ev.bytesOut ?? 0)}
                  {ev.ms !== undefined ? ` · ${ev.ms < 1000 ? `${Math.round(ev.ms)} ms` : `${(ev.ms / 1000).toFixed(1)} s`}` : ""}
                </motion.div>
              ) : null}
            </motion.div>
          </li>
        );
      })}
    </ol>
  );
}

/** Copies a recipe code another copy of the app can paste into "New recipe". */
function ShareCode({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="mr-1"
      title={t("Copy a code that recreates this recipe on another computer")}
      onClick={() => {
        void navigator.clipboard
          .writeText(encodeShare(recipe))
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => undefined);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? t("Code copied") : t("Copy code")}
    </Button>
  );
}

// ---------------------------------------------------------------------------

function RunFooter({
  recipe,
  blocker,
  running,
  onRun,
  fileCount,
}: {
  recipe: Recipe;
  blocker: string | null;
  running: boolean;
  onRun: () => void;
  fileCount: number;
}) {
  const { t } = useTranslation();
  const { outputDir, choose } = useOutputDir();

  return (
    <div className="flex-none border-t border-border bg-surface-2 px-4 pt-3 pb-3.5">
      <div className="mb-1.5 font-mono text-[11.5px] font-bold tracking-[0.13em] text-faint">
        {t("SAVE TO")}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void choose()}
          disabled={!isTauri()}
          title={outputDir ?? t("Beside each input file")}
          className={cn(
            "flex h-[30px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-hi bg-surface px-2.5",
            "outline-none transition-colors duration-150 hover:border-accent",
            "focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60",
          )}
        >
          <FolderOpen className="size-3.5 flex-none" style={{ color: "var(--tint-e)" }} />
          <span className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-text">
            {outputDir ?? t("Beside each input file")}
          </span>
        </button>
        <Button variant="secondary" size="sm" onClick={() => void choose()} disabled={!isTauri()}>
          {t("Change")}
        </Button>
      </div>

      <p className="mt-1.5 text-[12px] text-muted">
        {fileCount > 0
          ? t("Your {{count}} input files are untouched. Only the final result lands here.", { count: fileCount })
          : t("Inputs are never modified. Only the final result lands here.")}
      </p>

      <Button
        variant="primary"
        onClick={onRun}
        disabled={!!blocker || running}
        className="mt-2.5 h-[38px] w-full text-[14.5px] font-semibold"
      >
        {running ? <Loader2 className="animate-spin" /> : <Play />}
        <span>{running ? t("Working…") : recipe.steps.length === 1 ? t("Run") : t("Run {{count}} steps", { count: recipe.steps.length })}</span>
        <span className="font-mono text-[12px] font-normal opacity-70">{isMac() ? "⌘ Enter" : t("Ctrl+Enter")}</span>
      </Button>

      {blocker ? <p className="mt-2 text-center text-[13px] text-muted">{blocker}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FileList({
  files,
  onChange,
  ordered,
}: {
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  ordered: boolean;
}) {
  const { t } = useTranslation();
  return (
    <ul className="grid gap-1.5">
      {files.map((file, i) => (
        <li
          key={file.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
        >
          {ordered ? (
            <span className="w-5 flex-none text-center font-mono text-[12px] text-faint tabular-nums">
              {i + 1}
            </span>
          ) : null}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.4" className="flex-none">
            <path d="M3.2 2h6l3.6 3.6V14H3.2z" />
            <path d="M9.2 2v3.8h3.6" />
          </svg>
          <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-text" title={file.path}>
            {file.name}
          </span>
          {file.size != null ? (
            <span className="flex-none text-[12.5px] text-muted tabular-nums">
              {formatBytes(file.size)}
            </span>
          ) : null}
          <Button
            variant="danger"
            size="iconSm"
            aria-label={t("Remove {{name}}", { name: file.name })}
            onClick={() => onChange(files.filter((f) => f.id !== file.id))}
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}
