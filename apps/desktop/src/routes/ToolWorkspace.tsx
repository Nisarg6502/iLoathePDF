/**
 * The screen every tool shares: header, canvas, options.
 *
 * Two things here are deliberate departures from the first version:
 *
 *  - The canvas is `flex-1`. The drop target fills the window instead of
 *    sitting in a fixed-height box with dead space under it, and the run and
 *    result states take over that same area rather than being squeezed into
 *    the sidebar.
 *  - The destination is pinned directly above Run. Where a file will be
 *    written is a decision, not a footnote; burying it in grey text is how a
 *    result once appeared to vanish.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Loader2, Play, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { JobProgress } from "@/components/JobProgress";
import { ToolOptions } from "@/components/OptionsPanel";
import { JobOutcome } from "@/components/ResultCard";
import { useFilePicker, type PickedFile } from "@/components/FileDropZone";
import type { PdfPageItem } from "@/components/PageThumbnailGrid";
import { Button } from "@/components/ui/button";
import { SignOptionsPanel } from "@/components/SignOptionsPanel";
import { SignatureCapture } from "@/components/SignatureCapture";
import { JobError, isTauri, type Progress } from "@/lib/jobs";
import { execute, type JobResult } from "@/lib/run";
import { takePendingFiles } from "@/lib/handoff";
import { useOutputDir } from "@/lib/settings";
import { panelVariants } from "@/lib/motion";
import type { OptionValues, Tool } from "@/lib/tools";
import { cn, formatBytes } from "@/lib/utils";
import type { SavedSignKind } from "@/lib/signatureStore";
import type { SignElement } from "@/lib/signTypes";

const OrganizeCanvas = lazy(() =>
  import("@/components/OrganizeCanvas").then((m) => ({ default: m.OrganizeCanvas })),
);
const SignCanvas = lazy(() =>
  import("@/components/SignCanvas").then((m) => ({ default: m.SignCanvas })),
);

function newSignId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayFormatted(): string {
  return new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type RunState =
  | { phase: "idle" }
  | { phase: "running"; pct: number; note: string }
  | { phase: "done"; result: JobResult }
  | { phase: "error"; error: JobError };

export default function ToolWorkspace({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [values, setValues] = useState<OptionValues>(tool.defaults);
  const [pages, setPages] = useState<PdfPageItem[]>([]);
  const [state, setState] = useState<RunState>({ phase: "idle" });
  const [startedAt, setStartedAt] = useState(0);
  const abort = useRef<AbortController | null>(null);

  const [signElements, setSignElements] = useState<SignElement[]>([]);
  const [signSelectedId, setSignSelectedId] = useState<string | null>(null);
  const [signActivePage, setSignActivePage] = useState(0);
  const [signCaptureKind, setSignCaptureKind] = useState<SavedSignKind | null>(null);

  const { browse, dragging, rejected, picking } = useFilePicker({
    accept: tool.accepts,
    multiple: tool.multiple,
    files,
    onChange: (next) => {
      setFiles(next);
      setState({ phase: "idle" });
    },
  });

  // Switching tools resets the workspace, but a drop made on the home screen
  // is handed over rather than thrown away.
  useEffect(() => {
    const handed = takePendingFiles().filter((f) =>
      tool.accepts.includes((f.name.split(".").pop() ?? "").toLowerCase()),
    );
    setFiles(tool.multiple ? handed : handed.slice(0, 1));
    setValues(tool.defaults);
    setPages([]);
    setSignElements([]);
    setSignSelectedId(null);
    setSignActivePage(0);
    setSignCaptureKind(null);
    setState({ phase: "idle" });
  }, [tool]);

  const blocker = useMemo(() => {
    if (files.length === 0) return `Add ${tool.acceptsLabel} to continue.`;
    if (tool.id === "merge" && files.length < 2) return "Merging needs at least two PDFs.";
    if (tool.id === "sign" && signElements.length === 0) {
      return "Add a signature, text, date or initials to continue.";
    }
    return null;
  }, [files.length, tool, signElements.length]);

  const running = state.phase === "running";

  const run = useCallback(async () => {
    if (blocker || running) return;
    const controller = new AbortController();
    abort.current = controller;
    setStartedAt(Date.now());
    setState({ phase: "running", pct: 0, note: "Starting…" });

    const onProgress = (p: Progress) => setState({ phase: "running", pct: p.pct, note: p.note });

    try {
      const result = await execute(tool, files, values, pages, onProgress, controller.signal, signElements);
      setState({ phase: "done", result });
    } catch (err) {
      setState({
        phase: "error",
        error: err instanceof JobError ? err : new JobError("INTERNAL", String(err)),
      });
    } finally {
      abort.current = null;
    }
  }, [blocker, running, tool, files, values, pages, signElements]);

  function addImageSignElement(kind: SavedSignKind, imageDataUrl: string) {
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight || 2.4;
      const wPct = kind === "signature" ? 0.28 : 0.12;
      const hPct = wPct / aspect;
      const el: SignElement = {
        id: newSignId(),
        kind,
        pageIndex: signActivePage,
        xPct: 0.35,
        yPct: 0.45,
        wPct,
        hPct,
        imageDataUrl,
      };
      setSignElements((prev) => [...prev, el]);
      setSignSelectedId(el.id);
    };
    img.src = imageDataUrl;
  }

  function addTextSignElement(kind: "text" | "date") {
    const el: SignElement = {
      id: newSignId(),
      kind,
      pageIndex: signActivePage,
      xPct: 0.35,
      yPct: 0.45,
      wPct: 0.25,
      hPct: 0.045,
      text: kind === "date" ? todayFormatted() : "Text",
      fontSize: 16,
      color: "#000000",
    };
    setSignElements((prev) => [...prev, el]);
    setSignSelectedId(el.id);
  }

  function updateSignElement(id: string, patch: Partial<SignElement>) {
    setSignElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as SignElement) : e)));
  }

  function deleteSignElement(id: string) {
    setSignElements((prev) => prev.filter((e) => e.id !== id));
    setSignSelectedId((cur) => (cur === id ? null : cur));
  }

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
          <tool.icon className="size-4" style={{ color: `var(--tint-${tool.tint})` }} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.005em] text-text">{tool.title}</div>
          <div className="truncate text-[12.5px] text-muted">{tool.description}</div>
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
                setPages([]);
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
                    title={tool.action}
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
                    againLabel="Back to options"
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
                    {picking ? "Opening the file picker…" : `Drop ${tool.acceptsLabel} here`}
                  </span>
                  <span className="mt-1 block text-[13.5px] text-muted">
                    {picking
                      ? "Windows can take a moment the first time."
                      : "or click anywhere in this box to browse"}
                  </span>
                </span>
                <span className="font-mono text-[11.5px] tracking-[0.13em] text-faint uppercase">
                  {tool.accepts.slice(0, 6).join(" · ")}
                </span>
                {rejected > 0 ? (
                  <span className="text-[13px] text-danger">
                    {rejected} file{rejected === 1 ? "" : "s"} skipped — wrong format for this tool.
                  </span>
                ) : null}
              </motion.button>
            ) : tool.id === "organize" ? (
              <motion.div
                key="canvas"
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="min-h-0 flex-1 overflow-auto p-4"
              >
                <Suspense
                  fallback={
                    <div className="grid h-full place-items-center text-[14px] text-muted">
                      Loading the page canvas…
                    </div>
                  }
                >
                  <OrganizeCanvas file={files[0]} pages={pages} onChange={setPages} />
                </Suspense>
              </motion.div>
            ) : tool.id === "sign" ? (
              <motion.div
                key="sign-canvas"
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="min-h-0 flex-1 overflow-auto p-4"
              >
                <Suspense
                  fallback={
                    <div className="grid h-full place-items-center text-[14px] text-muted">
                      Loading the page canvas…
                    </div>
                  }
                >
                  <SignCanvas
                    file={files[0]}
                    elements={signElements}
                    activePageIndex={signActivePage}
                    onActivePageChange={setSignActivePage}
                    selectedId={signSelectedId}
                    onSelect={setSignSelectedId}
                    onUpdate={updateSignElement}
                    onDelete={deleteSignElement}
                  />
                </Suspense>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="min-h-0 flex-1 overflow-auto px-5 py-4"
              >
                <FileList files={files} onChange={setFiles} ordered={tool.ordered} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── options ──────────────────────────────────────────────────── */}
        <aside className="flex w-[344px] flex-none flex-col border-l border-border bg-surface">
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-2.5 font-mono text-[12px] font-bold tracking-[0.13em] text-faint">
              OPTIONS
            </div>
            {tool.id === "sign" ? (
              <SignOptionsPanel
                elements={signElements}
                selectedId={signSelectedId}
                activePageIndex={signActivePage}
                onAddCapture={setSignCaptureKind}
                onAddText={addTextSignElement}
                onSelect={setSignSelectedId}
                onUpdate={updateSignElement}
                onDelete={deleteSignElement}
              />
            ) : (
              <ToolOptions tool={tool} values={values} onChange={setValues} />
            )}
          </div>

          <RunFooter
            tool={tool}
            blocker={blocker}
            running={running}
            onRun={() => void run()}
            fileCount={files.length}
          />
        </aside>
      </div>

      {signCaptureKind && (
        <SignatureCapture
          kind={signCaptureKind}
          onClose={() => setSignCaptureKind(null)}
          onPick={(dataUrl) => {
            addImageSignElement(signCaptureKind, dataUrl);
            setSignCaptureKind(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function RunFooter({
  tool,
  blocker,
  running,
  onRun,
  fileCount,
}: {
  tool: Tool;
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
          ? `Writes new files. Your ${fileCount} input file${fileCount === 1 ? " is" : "s are"} untouched.`
          : "Inputs are never modified — every tool writes new files."}
      </p>

      <Button
        variant="primary"
        onClick={onRun}
        disabled={!!blocker || running}
        className="mt-2.5 h-[38px] w-full text-[14.5px] font-semibold"
      >
        {running ? <Loader2 className="animate-spin" /> : <Play />}
        <span>{running ? "Working…" : tool.action}</span>
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
