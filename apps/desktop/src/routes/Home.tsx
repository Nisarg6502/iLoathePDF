import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { cn } from "../lib/utils";
import {
  GROUP_LABEL,
  suggestTools,
  toolsInGroup,
  type Tool,
  type ToolGroup,
} from "../lib/tools";
import { AnimatePresence, motion } from "motion/react";
import { useWindowFileDrop, type PickedFile } from "../components/FileDropZone";
import { scrimVariants, sheetVariants } from "../lib/motion";
import { setPendingFiles } from "../lib/handoff";
import { Button } from "../components/ui/button";

export default function Home() {
  const navigate = useNavigate();
  const [dropped, setDropped] = useState<PickedFile[] | null>(null);

  const onDrop = useCallback((files: PickedFile[]) => setDropped(files), []);
  const dragging = useWindowFileDrop(onDrop);

  // Escape dismisses the suggestion sheet.
  useEffect(() => {
    if (!dropped) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropped(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dropped]);

  const groups: ToolGroup[] = ["pdf", "image"];
  let cardIndex = 0;

  return (
    <div className="relative min-h-0 flex-1 overflow-auto">
      <div className="px-10 pt-[34px] pb-8">
        <div className="mb-3.5 flex items-center gap-2.5">
          <span className="size-1.5 rounded-[2px] bg-accent" />
          <span className="font-mono text-[11px] font-bold tracking-[0.16em] text-muted">
            EIGHT TOOLS · ZERO UPLOADS
          </span>
        </div>

        <h1 className="m-0 max-w-[16ch] text-[34px] leading-[1.08] font-semibold tracking-[-0.032em] text-text">
          What are we doing to your files today?
        </h1>

        <p className="mt-2 max-w-[640px] text-[14.5px] text-muted">
          Everything runs on this machine. There is no upload step, because there is nowhere to
          upload to — Aadhaar, PAN, contracts and anything else stay exactly where they are.
        </p>

        {/* The primary way in: the window itself is the drop target. */}
        <Link
          to="/t/merge"
          className={cn(
            "mt-5.5 flex h-14 items-center gap-3 rounded-card border border-border bg-surface px-4 outline-none",
            "transition-[background-color,border-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
            "hover:border-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent",
          )}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="1.5" className="flex-none">
            <path d="M10 13V4.5M10 4.5L7 7.5M10 4.5l3 3" />
            <path d="M3.5 12v3a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 16.5 15v-3" />
          </svg>
          <span className="flex-1">
            <span className="block text-[14.5px] font-semibold text-text">
              Drop files anywhere in this window
            </span>
            <span className="block text-[13px] text-muted">
              PDFs, JPG, PNG, WebP, HEIC — the right tools light up for what you drop.
            </span>
          </span>
          <span className="flex flex-none gap-1.5">
            {["Ctrl", "O"].map((k) => (
              <kbd
                key={k}
                className="rounded border border-border px-1.5 py-0.5 font-mono text-[12px] font-normal text-faint"
              >
                {k}
              </kbd>
            ))}
          </span>
        </Link>

        {groups.map((group) => (
          <section key={group} className="mt-6.5">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[11.5px] font-bold tracking-[0.13em] text-faint">
                {GROUP_LABEL[group].toUpperCase()}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {toolsInGroup(group).map((tool) => (
                <ToolCard key={tool.id} tool={tool} index={cardIndex++} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {dragging && !dropped ? <DragVeil /> : null}
      <AnimatePresence>
        {dropped ? (
          <SuggestionSheet
          names={dropped.map((f) => f.name)}
          onDismiss={() => setDropped(null)}
          onPick={(tool) => {
            // Carry the drop into the tool, otherwise the user has to find
            // and drag the same file a second time.
            setPendingFiles(dropped);
            setDropped(null);
            navigate(tool.path);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ToolCard({ tool, index }: { tool: Tool; index: number }) {
  const Icon = tool.icon;
  return (
    <Link
      to={tool.path}
      style={{
        ["--tool-tint" as string]: `var(--tint-${tool.tint})`,
        animationDelay: `${Math.min(index, 8) * 35}ms`,
      }}
      className={cn(
        "ihp-rise group relative flex flex-col gap-3 rounded-card border border-border bg-surface p-4",
        "shadow-[var(--shadow-card)] outline-none",
        "transition-[transform,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "hover:-translate-y-0.5 hover:border-[var(--tool-tint)]",
        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "active:translate-y-0 active:scale-[0.99]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-10 place-items-center rounded-xl",
          "bg-[color-mix(in_oklab,var(--tool-tint)_15%,transparent)] text-[var(--tool-tint)]",
          "transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
          "group-hover:scale-[1.06]",
        )}
      >
        <Icon className="size-5" />
      </span>

      <span className="flex-1">
        <span className="block text-[16px] font-semibold tracking-[-0.01em] text-text">
          {tool.title}
        </span>
        <span className="mt-1 block text-[14px] leading-relaxed text-muted">
          {tool.description}
        </span>
      </span>

      <ArrowRight
        aria-hidden
        className="absolute right-4 top-4 size-4 -translate-x-1 text-muted opacity-0 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0 group-hover:opacity-100"
      />
    </Link>
  );
}

// ---------------------------------------------------------------------------

function DragVeil() {
  return (
    <div className="ihp-fade pointer-events-none fixed inset-0 z-40 grid place-items-center bg-bg/70 backdrop-blur-[2px]">
      <div className="rounded-card border-2 border-dashed border-accent bg-surface px-8 py-6 text-center shadow-[var(--shadow-card)]">
        <p className="text-[17px] font-semibold text-text">Drop anywhere</p>
        <p className="mt-1 text-[14px] text-muted">
          We&rsquo;ll work out which tools fit these files.
        </p>
      </div>
    </div>
  );
}

function SuggestionSheet({
  names,
  onPick,
  onDismiss,
}: {
  names: string[];
  onPick: (tool: Tool) => void;
  onDismiss: () => void;
}) {
  const matches = suggestTools(names);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <motion.button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        variants={scrimVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="absolute inset-0 cursor-default bg-bg/60 backdrop-blur-[2px]"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a tool for the dropped files"
        variants={sheetVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="relative m-4 w-full max-w-2xl rounded-card border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Sparkles className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-text">
              {names.length} file{names.length === 1 ? "" : "s"} ready
            </h2>
            <p className="mt-0.5 truncate text-[14px] text-muted">{names.join(", ")}</p>
          </div>
          <Button variant="ghost" size="iconSm" onClick={onDismiss} aria-label="Dismiss">
            <X />
          </Button>
        </div>

        {matches.length ? (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Tools that fit
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {matches.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onPick(tool)}
                  style={{ ["--tool-tint" as string]: `var(--tint-${tool.tint})` }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left outline-none",
                    "transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                    "hover:border-[var(--tool-tint)] hover:bg-surface-2",
                    "focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.99]",
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--tool-tint)_15%,transparent)] text-[var(--tool-tint)]">
                    <tool.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-text">{tool.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {tool.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">
              Your files come with you. Press Escape to stay here.
            </p>
          </>
        ) : (
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4">
            <p className="text-[14px] font-medium text-text">No tool matches that mix of files.</p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              Each tool takes one kind of input — PDFs, or images. Try dropping them separately.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
