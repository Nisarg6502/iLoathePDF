import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { TOOLS } from "@/tools/registry";
import { tintColor, tintWash } from "@/tools/tint";

/**
 * A looping, illustrative run of the "Scan to Searchable PDF" recipe: three
 * photos go in, each step lights up in turn, and the file shrinks and gains a
 * text layer on the way out. The numbers are made up for the demo; they are
 * not output from a real run.
 *
 * Stages (`stage`):
 *   0 files waiting · 1..3 that step is running · 4 all done (held longer)
 */
const STEPS = ["images-to-pdf", "compress", "ocr"] as const;
const STAGE_MS = [1000, 1300, 1300, 1300, 3400];
const FINAL_STAGE = STAGE_MS.length - 1;

const NOTES = ["3 photos → 1 PDF", "8.4 MB → 1.1 MB", "text layer added"];

function outputLabel(stage: number): { name: string; size: string; note: string } {
  if (stage <= 1) return { name: "3 photos", size: "8.4 MB", note: "ready to start" };
  if (stage === 2) return { name: "scan.pdf", size: "8.4 MB", note: "one PDF" };
  if (stage === 3) return { name: "scan.pdf", size: "1.1 MB", note: "−87% smaller" };
  return { name: "scan.pdf", size: "1.1 MB", note: "searchable" };
}

export function RecipeDemo() {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(reduce ? FINAL_STAGE : 0);

  useEffect(() => {
    if (reduce) {
      setStage(FINAL_STAGE);
      return;
    }
    const id = window.setTimeout(() => setStage((s) => (s + 1) % STAGE_MS.length), STAGE_MS[stage]);
    return () => window.clearTimeout(id);
  }, [stage, reduce]);

  const out = outputLabel(stage);
  const done = stage === FINAL_STAGE;

  return (
    <div
      role="img"
      aria-label="Animated example of the Scan to Searchable PDF recipe: three photos become one PDF, are compressed from 8.4 MB to 1.1 MB, then made searchable."
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]"
    >
      <div aria-hidden className="flex h-[38px] items-center gap-2 border-b border-border bg-surface-2 px-3.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border-hi" />
          <span className="size-2.5 rounded-full bg-border-hi" />
          <span className="size-2.5 rounded-full bg-border-hi" />
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] text-faint">Recipe · Scan to Searchable PDF</span>
      </div>

      <div aria-hidden className="p-5">
        <ol className="flex flex-col">
          {STEPS.map((slug, i) => {
            const tool = TOOLS.find((t) => t.slug === slug);
            if (!tool) return null;
            const status = stage > i + 1 ? "done" : stage === i + 1 ? "running" : "waiting";
            return (
              <li key={slug} className="relative flex items-center gap-3 py-2.5">
                {i < STEPS.length - 1 && (
                  <span className="absolute left-[15px] top-[38px] h-[calc(100%-18px)] w-px bg-border">
                    <motion.span
                      className="block w-px origin-top bg-accent"
                      style={{ height: "100%" }}
                      initial={false}
                      animate={{ scaleY: stage > i + 1 ? 1 : 0 }}
                      transition={{ duration: reduce ? 0 : 0.35, ease: [0.23, 1, 0.32, 1] }}
                    />
                  </span>
                )}
                <span
                  className="relative grid size-[31px] flex-none place-items-center rounded-[10px] border transition-colors duration-200"
                  style={{
                    background: status === "waiting" ? "var(--surface-2)" : tintWash(tool.tint, 14),
                    borderColor: status === "waiting" ? "var(--border)" : tintColor(tool.tint),
                  }}
                >
                  <tool.Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold">{tool.name}</span>
                  <span className="block font-mono text-[11px] text-muted">
                    {status === "done" ? NOTES[i] : status === "running" ? "working…" : "waiting"}
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
              </li>
            );
          })}
        </ol>

        <div className="mt-3 rounded-xl border border-border bg-surface-2 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">
              {done ? "RESULT" : "FILE"}
            </span>
            <span className={`font-mono text-[10.5px] ${done ? "text-ok" : "text-accent"}`}>
              {done ? "DONE · ON THIS MACHINE" : stage === 0 ? "READY" : "PROCESSING"}
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
              animate={{ width: `${(Math.min(stage, FINAL_STAGE) / FINAL_STAGE) * 100}%` }}
              transition={{ duration: reduce ? 0 : 0.5, ease: [0.23, 1, 0.32, 1] }}
            />
          </div>
          <div className="mt-2 font-mono text-[11px] text-muted">{out.note}</div>
        </div>
      </div>
    </div>
  );
}
