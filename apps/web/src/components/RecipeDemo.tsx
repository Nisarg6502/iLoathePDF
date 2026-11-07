import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TOOLS } from "@/tools/registry";
import { tintColor, tintWash } from "@/tools/tint";
import { allowedNext } from "@/recipes/customRecipes";

/**
 * A looping, illustrative walk through the recipe feature, start to finish:
 * pick tools one by one in the builder (the picker only offers tools that fit
 * what came before, like the real one), save the chain, then run it on three
 * photos. The sizes are made up for the demo; they are not from a real run.
 *
 * Stages:
 *   0 empty builder · 1..3 tapping tool N (it joins the chain a moment later)
 *   4 saved · 5..7 running step 1..3 · 8 all done (held longer)
 */
const CHAIN = ["images-to-pdf", "compress", "ocr"] as const;
const STAGE_MS = [1100, 1000, 1000, 1000, 1200, 1000, 1300, 1300, 3600];
const SAVED = 4;
const FINAL_STAGE = STAGE_MS.length - 1;
const TAP_DELAY_MS = 380;
const RECIPE_NAME = "Scan to Searchable PDF";

const NOTES = ["3 photos → 1 PDF", "8.4 MB → 1.1 MB", "text layer added"];

function outputLabel(run: number): { name: string; size: string; note: string } {
  if (run <= 1) return { name: "3 photos", size: "8.4 MB", note: "ready to start" };
  if (run === 2) return { name: "scan.pdf", size: "8.4 MB", note: "one PDF" };
  if (run === 3) return { name: "scan.pdf", size: "1.1 MB", note: "−87% smaller" };
  return { name: "scan.pdf", size: "1.1 MB", note: "searchable" };
}

export function RecipeDemo() {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(reduce ? FINAL_STAGE : 0);
  // Within a build stage, the tool is tapped first and joins the chain a beat later.
  const [tapped, setTapped] = useState(false);

  useEffect(() => {
    if (reduce) {
      setStage(FINAL_STAGE);
      return;
    }
    setTapped(false);
    const tap = window.setTimeout(() => setTapped(true), TAP_DELAY_MS);
    const next = window.setTimeout(() => setStage((s) => (s + 1) % STAGE_MS.length), STAGE_MS[stage]);
    return () => {
      window.clearTimeout(tap);
      window.clearTimeout(next);
    };
  }, [stage, reduce]);

  const building = stage <= SAVED;
  const chainLength = stage >= SAVED ? CHAIN.length : stage === 0 ? 0 : stage - 1 + (tapped || reduce ? 1 : 0);
  const chain = CHAIN.slice(0, chainLength) as string[];
  const tapping = stage >= 1 && stage <= 3 && !tapped ? CHAIN[stage - 1] : null;
  const run = Math.max(0, stage - SAVED); // 0 = not started, 1..3 = that step running, 4 = done
  const done = stage === FINAL_STAGE;
  const out = outputLabel(run);
  const options = stage < SAVED ? allowedNext(chain) : [];

  return (
    <div
      role="img"
      aria-label="Animated example of building a recipe: you pick Images to PDF, Compress and OCR to chain them, save it as Scan to Searchable PDF, then run it to turn three photos into one small, searchable PDF."
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]"
    >
      <div aria-hidden className="flex h-[38px] items-center gap-2 border-b border-border bg-surface-2 px-3.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border-hi" />
          <span className="size-2.5 rounded-full bg-border-hi" />
          <span className="size-2.5 rounded-full bg-border-hi" />
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] text-faint">{building ? "New recipe" : "Your recipes"}</span>
      </div>

      <div aria-hidden className="min-h-[440px] p-5">
        {/* name: appears once the recipe is saved */}
        <div className="flex h-9 items-center justify-between rounded-[10px] border border-border bg-surface-2 px-3">
          {stage >= SAVED ? (
            <motion.span
              key="name"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="text-[13.5px] font-semibold"
            >
              {RECIPE_NAME}
            </motion.span>
          ) : (
            <span className="text-[13px] text-faint">Name your recipe…</span>
          )}
          <span className={`font-mono text-[10.5px] ${stage >= SAVED ? "text-ok" : "text-faint"}`}>
            {stage >= SAVED ? "SAVED" : `${chain.length} STEP${chain.length === 1 ? "" : "S"}`}
          </span>
        </div>

        {/* the chain */}
        <ol className="mt-3 flex min-h-[132px] flex-col">
          <AnimatePresence initial={false}>
            {chain.map((slug, i) => {
              const tool = TOOLS.find((t) => t.slug === slug);
              if (!tool) return null;
              const status = building ? "added" : run > i + 1 ? "done" : run === i + 1 ? "running" : "waiting";
              const lit = status !== "waiting";
              return (
                <motion.li
                  key={slug}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                  className="relative flex items-center gap-3 py-2"
                >
                  {i < CHAIN.length - 1 && i < chain.length - 1 && (
                    <span className="absolute left-[15px] top-[40px] h-[calc(100%-20px)] w-px bg-border">
                      <motion.span
                        className="block w-px origin-top bg-accent"
                        style={{ height: "100%" }}
                        initial={false}
                        animate={{ scaleY: building || run > i + 1 ? 1 : 0 }}
                        transition={{ duration: reduce ? 0 : 0.35, ease: [0.23, 1, 0.32, 1] }}
                      />
                    </span>
                  )}
                  <span
                    className="relative grid size-[31px] flex-none place-items-center rounded-[10px] border transition-colors duration-200"
                    style={{
                      background: lit ? tintWash(tool.tint, 14) : "var(--surface-2)",
                      borderColor: lit ? tintColor(tool.tint) : "var(--border)",
                    }}
                  >
                    <tool.Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold">
                      <span className="mr-1.5 font-mono text-[11px] text-faint">{i + 1}</span>
                      {tool.name}
                    </span>
                    <span className="block font-mono text-[11px] text-muted">
                      {status === "done" ? NOTES[i] : status === "running" ? "working…" : status === "waiting" ? "waiting" : "added"}
                    </span>
                  </span>
                  <span className="w-5 flex-none">
                    {status === "running" && (
                      <svg className="spinner size-4 text-accent" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                        <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                    {status === "done" && (
                      <motion.svg
                        key={`${slug}-done`}
                        initial={reduce ? false : { scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 20 }}
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="var(--ok)"
                        strokeWidth="2"
                      >
                        <path d="M2.5 8.4l3.2 3.2L13.5 4" strokeLinecap="round" strokeLinejoin="round" />
                      </motion.svg>
                    )}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {chain.length === 0 && (
            <li className="rounded-[10px] border border-dashed border-border px-3.5 py-5 text-[12.5px] text-faint">
              No steps yet — pick the first tool
            </li>
          )}
        </ol>

        {building ? (
          <div>
            <div className="mt-2 font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">
              {chain.length === 0 ? "START WITH" : "THEN"}
            </div>
            <div className="mt-2 flex min-h-[68px] flex-wrap content-start gap-1.5">
              {options.map((slug) => {
                const tool = TOOLS.find((t) => t.slug === slug);
                if (!tool) return null;
                const pressed = tapping === slug;
                return (
                  <span
                    key={slug}
                    className="rounded-full border px-3 py-1 text-[12px] transition-[transform,border-color,background-color] duration-150"
                    style={{
                      transform: pressed ? "scale(0.93)" : "scale(1)",
                      borderColor: pressed ? "var(--accent)" : "var(--border)",
                      background: pressed ? "var(--accent-soft)" : "var(--surface)",
                    }}
                  >
                    + {tool.name}
                  </span>
                );
              })}
            </div>
            <div className="mt-3">
              <span
                className="inline-flex h-9 items-center rounded-[10px] px-4 text-[13px] font-semibold transition-transform duration-150"
                style={{
                  background: chain.length === CHAIN.length ? "var(--accent)" : "var(--surface-3)",
                  color: chain.length === CHAIN.length ? "var(--on-accent)" : "var(--faint)",
                  transform: stage === SAVED && tapped ? "scale(0.95)" : "scale(1)",
                }}
              >
                {stage === SAVED ? "Saved ✓" : "Save recipe"}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-2 rounded-xl border border-border bg-surface-2 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">
                {done ? "RESULT" : "FILE"}
              </span>
              <span className={`font-mono text-[10.5px] ${done ? "text-ok" : "text-accent"}`}>
                {done ? "DONE · ON THIS MACHINE" : run === 0 ? "READY" : "PROCESSING"}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[14px] font-medium">{out.name}</span>
              <motion.span
                key={out.size}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className="font-mono text-[26px] font-bold tracking-[-0.03em]"
              >
                {out.size}
              </motion.span>
            </div>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-surface-3">
              <motion.span
                className="bg-ok"
                initial={false}
                animate={{ width: `${(Math.min(run, 4) / 4) * 100}%` }}
                transition={{ duration: reduce ? 0 : 0.5, ease: [0.23, 1, 0.32, 1] }}
              />
            </div>
            <div className="mt-2 font-mono text-[11px] text-muted">{out.note}</div>
          </div>
        )}
      </div>
    </div>
  );
}
