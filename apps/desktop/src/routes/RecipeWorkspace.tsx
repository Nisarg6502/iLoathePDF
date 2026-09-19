/**
 * The screen a Recipe runs in: same shell as ToolWorkspace (header, canvas,
 * sidebar with a destination and Run button), but driving `runRecipe()`
 * across a fixed chain of tools instead of `execute()` for one tool.
 *
 * A recipe has no `Tool` entry of its own -- no options, no per-tool canvas
 * -- so wherever ToolWorkspace would read `tool.accepts`/`tool.multiple`/
 * etc. directly, this reads them from `toolById(recipe.steps[0])`: the
 * recipe's accepted-file constraints are always the first step's. There is
 * no OptionsPanel; recipes are zero-input by design, so the sidebar shows
 * the fixed step list instead.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FolderOpen, Loader2, Play, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { JobProgress } from "@/components/JobProgress";
import { JobOutcome } from "@/components/ResultCard";
import { useFilePicker, type PickedFile } from "@/components/FileDropZone";
import { Button } from "@/components/ui/button";
import { JobError, isTauri, type Progress } from "@/lib/jobs";
import { runRecipe } from "@/lib/recipeRun";
import type { JobResult } from "@/lib/run";
import { takePendingFiles } from "@/lib/handoff";
import { useOutputDir } from "@/lib/settings";
import { panelVariants } from "@/lib/motion";
import { toolById } from "@/lib/tools";
import { cn, formatBytes } from "@/lib/utils";
import type { Recipe } from "@/lib/recipes";

type RunState =
  | { phase: "idle" }
  | { phase: "running"; pct: number; note: string }
  | { phase: "done"; result: JobResult }
  | { phase: "error"; error: JobError };

export default function RecipeWorkspace({ recipe }: { recipe: Recipe }) {
  const firstTool = toolById(recipe.steps[0]);

  const [files, setFiles] = useState<PickedFile[]>([]);
  const [state, setState] = useState<RunState>({ phase: "idle" });
  const [startedAt, setStartedAt] = useState(0);
  const abort = useRef<AbortController | null>(null);

  const { browse, dragging, rejected, picking } = useFilePicker({
    accept: firstTool?.accepts ?? [],
    multiple: firstTool?.multiple ?? false,
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
    setFiles(firstTool.multiple ? handed : handed.slice(0, 1));
    setState({ phase: "idle" });
  }, [recipe, firstTool]);

  const blocker = useMemo(() => {
    if (!firstTool) return "This recipe is misconfigured.";
    if (files.length === 0) return `Add ${firstTool.acceptsLabel} to continue.`;
    if (recipe.steps[0] === "merge" && files.length < 2) {
      return "Merging needs at least two PDFs.";
    }
    return null;
  }, [files.length, firstTool, recipe]);

  const running = state.phase === "running";

  const run = useCallback(async () => {
    if (blocker || running) return;
    const controller = new AbortController();
    abort.current = controller;
    setStartedAt(Date.now());
    setState({ phase: "running", pct: 0, note: "Starting…" });

    const onProgress = (p: Progress) =>
      setState((prev) =>
        prev.phase === "running" ? { ...prev, pct: p.pct, note: p.note } : prev,
      );

    try {
      const result = await runRecipe(recipe, files, onProgress, controller.signal);
      setState({ phase: "done", result });
    } catch (err) {
      setState({
        phase: "error",
        error: err instanceof JobError ? err : new JobError("INTERNAL", String(err)),
      });
    } finally {
      abort.current = null;
    }
  }, [blocker, running, recipe, files]);

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
        This recipe references a tool that no longer exists.
      </div>
    );
  }

  const totalBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const inputSummary =
    files.length === 0
      ? null
      : `${files.length} file${files.length === 1 ? "" : "s"}${
          totalBytes ? ` · ${formatBytes(totalBytes)}` : ""
        }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <header className="flex h-[54px] flex-none items-center gap-3 border-b border-border bg-surface px-5">
        <span className="grid size-7 flex-none place-items-center rounded-[9px] bg-surface-2">
          <firstTool.icon className="size-4" style={{ color: `var(--tint-${firstTool.tint})` }} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.005em] text-text">{recipe.title}</div>
          <div className="truncate text-[12.5px] text-muted">{recipe.description}</div>
        </div>

        <div className="flex-1" />

        {files.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted">{inputSummary}</span>
            <Button variant="secondary" size="sm" onClick={browse} disabled={!isTauri()}>
              <Plus />
              Add files
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setFiles([]);
                setState({ phase: "idle" });
              }}
            >
              Clear
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
                    title={recipe.title}
                    progress={{ id: "current", pct: state.pct, note: state.note }}
                    phase="running"
                    startedAt={startedAt}
                    onCancel={() => abort.current?.abort()}
                  />
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
                    againLabel="Back to start"
                  />
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
                  <JobOutcome
                    error={state.error}
                    onRetry={() => void run()}
                    onAgain={() => setState({ phase: "idle" })}
                  />
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
                    {picking ? "Opening the file picker…" : `Drop ${firstTool.acceptsLabel} here`}
                  </span>
                  <span className="mt-1 block text-[13.5px] text-muted">
                    {picking
                      ? "Windows can take a moment the first time."
                      : "or click anywhere in this box to browse"}
                  </span>
                </span>
                <span className="font-mono text-[11.5px] tracking-[0.13em] text-faint uppercase">
                  {firstTool.accepts.slice(0, 6).join(" · ")}
                </span>
                {rejected > 0 ? (
                  <span className="text-[13px] text-danger">
                    {rejected} file{rejected === 1 ? "" : "s"} skipped — wrong format for this recipe.
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
            <div className="mb-2.5 font-mono text-[12px] font-bold tracking-[0.13em] text-faint">
              STEPS
            </div>
            <StepList recipe={recipe} />
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

function StepList({ recipe }: { recipe: Recipe }) {
  return (
    <ol className="grid gap-1.5">
      {recipe.steps.map((toolId, i) => {
        const tool = toolById(toolId);
        return (
          <li
            key={`${toolId}-${i}`}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2.5"
          >
            <span className="grid size-6 flex-none place-items-center rounded-full bg-surface font-mono text-[11px] font-bold text-muted">
              {i + 1}
            </span>
            {tool ? (
              <>
                <tool.icon className="size-4 flex-none" style={{ color: `var(--tint-${tool.tint})` }} strokeWidth={1.5} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-text">{tool.title}</span>
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-danger">
                Unknown tool “{toolId}”
              </span>
            )}
            {i < recipe.steps.length - 1 ? (
              <ArrowRight className="size-3.5 flex-none text-faint" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
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
  const { outputDir, choose } = useOutputDir();

  return (
    <div className="flex-none border-t border-border bg-surface-2 px-4 pt-3 pb-3.5">
      <div className="mb-1.5 font-mono text-[11.5px] font-bold tracking-[0.13em] text-faint">
        SAVE TO
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void choose()}
          disabled={!isTauri()}
          title={outputDir ?? "Beside each input file"}
          className={cn(
            "flex h-[30px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-hi bg-surface px-2.5",
            "outline-none transition-colors duration-150 hover:border-accent",
            "focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60",
          )}
        >
          <FolderOpen className="size-3.5 flex-none" style={{ color: "var(--tint-e)" }} />
          <span className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-text">
            {outputDir ?? "Beside each input file"}
          </span>
        </button>
        <Button variant="secondary" size="sm" onClick={() => void choose()} disabled={!isTauri()}>
          Change
        </Button>
      </div>

      <p className="mt-1.5 text-[12px] text-muted">
        {fileCount > 0
          ? `Writes new files at every step. Your ${fileCount} input file${fileCount === 1 ? " is" : "s are"} untouched.`
          : "Inputs are never modified — every step writes new files."}
      </p>

      <Button
        variant="primary"
        onClick={onRun}
        disabled={!!blocker || running}
        className="mt-2.5 h-[38px] w-full text-[14.5px] font-semibold"
      >
        {running ? <Loader2 className="animate-spin" /> : <Play />}
        <span>{running ? "Working…" : `Run ${recipe.steps.length} steps`}</span>
        <span className="font-mono text-[12px] font-normal opacity-70">Ctrl+Enter</span>
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
            aria-label={`Remove ${file.name}`}
            onClick={() => onChange(files.filter((f) => f.id !== file.id))}
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}
