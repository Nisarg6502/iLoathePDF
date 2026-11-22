import { useLayoutEffect, useRef, useState, useEffect, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { getTool } from "@/tools/registry";
import { tintColor, tintWash } from "@/tools/tint";
import { canInsert } from "@/recipes/chain";

/**
 * A looping, illustrative glimpse of the recipe builder, driven by a pretend
 * cursor: drag three tools into the chain, trip a chaining rule (Compress
 * after OCR would wipe OCR's text), fix it with one click, turn a setting
 * down, then run the recipe on three photos. The palette's greyed-out tools
 * come from the real chaining rules; the file sizes are made up for the demo.
 */

type ChainSlug = "images-to-pdf" | "ocr" | "compress";

interface Stage {
  ms: number;
  /** Where the cursor goes during this stage. */
  cursor: string;
  chain: ChainSlug[];
  /** Tool being dragged (a ghost tile follows the cursor). */
  drag?: ChainSlug;
  /** The cursor is pressing. */
  press?: boolean;
  warn?: boolean;
  settings?: boolean;
  dpi?: number;
  /** 0 not started, 1..3 that step running, 4 done. */
  run?: number;
}

const A: ChainSlug[] = ["images-to-pdf"];
const B: ChainSlug[] = ["images-to-pdf", "ocr"];
const C: ChainSlug[] = ["images-to-pdf", "ocr", "compress"];
const D: ChainSlug[] = ["images-to-pdf", "compress", "ocr"];

export const STAGES: Stage[] = [
  /* 0 */ { ms: 900, cursor: "rest", chain: [] },
  /* 1 */ { ms: 650, cursor: "tool:images-to-pdf", chain: [], press: true },
  /* 2 */ { ms: 750, cursor: "slot", chain: [], drag: "images-to-pdf", press: true },
  /* 3 */ { ms: 550, cursor: "slot", chain: A },
  /* 4 */ { ms: 650, cursor: "tool:ocr", chain: A, press: true },
  /* 5 */ { ms: 700, cursor: "slot", chain: A, drag: "ocr", press: true },
  /* 6 */ { ms: 500, cursor: "slot", chain: B },
  /* 7 */ { ms: 650, cursor: "tool:compress", chain: B, press: true },
  /* 8 */ { ms: 700, cursor: "slot", chain: B, drag: "compress", press: true },
  /* 9 */ { ms: 1700, cursor: "slot", chain: C, warn: true },
  /* 10 */ { ms: 700, cursor: "fix", chain: C, warn: true, press: true },
  /* 11 */ { ms: 1000, cursor: "fix", chain: D },
  /* 12 */ { ms: 600, cursor: "card:compress", chain: D, press: true },
  /* 13 */ { ms: 1500, cursor: "slider", chain: D, settings: true, dpi: 96, press: true },
  /* 14 */ { ms: 700, cursor: "run", chain: D, dpi: 96, press: true },
  /* 15 */ { ms: 900, cursor: "run", chain: D, dpi: 96, run: 1 },
  /* 16 */ { ms: 900, cursor: "run", chain: D, dpi: 96, run: 2 },
  /* 17 */ { ms: 1000, cursor: "run", chain: D, dpi: 96, run: 3 },
  /* 18 */ { ms: 3400, cursor: "rest", chain: D, dpi: 96, run: 4 },
];
const FINAL = STAGES.length - 1;

const PALETTE = ["images-to-pdf", "ocr", "compress", "merge", "compress-images", "watermark"];
const SHORT: Record<string, string> = {
  "images-to-pdf": "Images to PDF",
  ocr: "OCR",
  compress: "Compress",
  merge: "Merge",
  "compress-images": "Shrink images",
  watermark: "Page numbers",
};
const DONE_NOTE: Record<ChainSlug, string> = {
  "images-to-pdf": "3 photos → 1 PDF",
  compress: "8.4 MB → 1.1 MB",
  ocr: "text layer added",
};
const ease = [0.23, 1, 0.32, 1] as const;
const name = (slug: string) => getTool(slug)?.name ?? slug;

function Icon({ slug, size = 26, lit = true }: { slug: string; size?: number; lit?: boolean }) {
  const t = getTool(slug);
  if (!t) return null;
  return (
    <span
      className="grid flex-none place-items-center rounded-[8px] transition-[filter,background-color] duration-200"
      style={{ width: size, height: size, background: tintWash(t.tint, 16), filter: lit ? "none" : "grayscale(1)" }}
    >
      <t.Icon width={size * 0.58} height={size * 0.58} />
    </span>
  );
}

export function RecipeDemo() {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(reduce ? FINAL : 0);

  useEffect(() => {
    if (reduce) {
      setStage(FINAL);
      return;
    }
    const t = window.setTimeout(() => setStage((s) => (s + 1) % STAGES.length), STAGES[stage].ms);
    return () => window.clearTimeout(t);
  }, [stage, reduce]);

  const s = STAGES[stage];
  const run = s.run ?? 0;
  const done = run === 4;
  const chainSteps = s.chain.map((tool) => ({ tool }));

  // The pretend cursor: measure the element it should point at and glide there.
  const box = useRef<HTMLDivElement>(null);
  const targets = useRef(new Map<string, HTMLElement>());
  const reg = (key: string) => (el: HTMLElement | null) => {
    if (el) targets.current.set(key, el);
    else targets.current.delete(key);
  };
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const root = box.current?.getBoundingClientRect();
    const el = targets.current.get(s.cursor);
    if (!root) return;
    if (!el) {
      setCursor({ x: root.width * 0.78, y: root.height * 0.82 });
      return;
    }
    const r = el.getBoundingClientRect();
    setCursor({ x: r.left - root.left + Math.min(r.width * 0.5, 60), y: r.top - root.top + r.height * 0.55 });
  }, [stage, s.cursor]);

  const status = s.chain.length === 0 ? "No steps yet" : s.warn ? "1 thing to check" : `Ready · ${s.chain.length} step${s.chain.length === 1 ? "" : "s"}`;
  const tone = s.chain.length === 0 ? "border-border text-faint" : s.warn ? "border-warn/50 bg-warn-soft text-warn" : "border-ok/40 bg-ok-soft text-ok";

  return (
    <div
      role="img"
      aria-label="Animated example of building a recipe: drag Images to PDF, OCR and Compress into a chain, get warned that Compress after OCR would wipe the searchable text, fix the order with one click, lower Compress's DPI, then run it to turn three photos into one small, searchable PDF."
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]"
    >
      <div aria-hidden className="flex h-[38px] items-center gap-2 border-b border-border bg-surface-2 px-3.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border-hi" />
          <span className="size-2.5 rounded-full bg-border-hi" />
          <span className="size-2.5 rounded-full bg-border-hi" />
        </span>
        <span className="flex-1 truncate text-center font-mono text-[10.5px] text-faint">
          {stage >= 14 ? "Scan to searchable PDF" : "New recipe"}
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={status}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2, ease }}
            className={`rounded-full border px-2 py-px font-mono text-[9.5px] font-bold ${tone}`}
          >
            {status}
          </motion.span>
        </AnimatePresence>
      </div>

      <div aria-hidden ref={box} className="relative grid min-h-[460px] grid-cols-[96px_1fr] gap-3 p-3.5 sm:grid-cols-[118px_1fr] sm:gap-4 sm:p-4">
        {/* palette */}
        <div className="flex flex-col gap-1">
          <div className="px-1 pb-1 font-mono text-[9px] font-bold tracking-[0.13em] text-faint">TOOLS</div>
          {PALETTE.map((slug) => {
            const fits = canInsert(chainSteps, chainSteps.length, slug, name).ok;
            const grabbed = s.cursor === `tool:${slug}` && s.press;
            return (
              <div
                key={slug}
                ref={reg(`tool:${slug}`)}
                className="flex items-center gap-1.5 rounded-[9px] border px-1.5 py-1 transition-[opacity,transform,border-color,background-color] duration-200"
                style={{
                  opacity: fits ? 1 : 0.45,
                  transform: grabbed ? "scale(0.94)" : "scale(1)",
                  borderColor: grabbed ? "var(--accent)" : "transparent",
                  background: grabbed ? "var(--accent-soft)" : "transparent",
                }}
              >
                <Icon slug={slug} size={22} lit={fits} />
                <span className="min-w-0 flex-1 truncate text-[11px]">{SHORT[slug]}</span>
                {!fits && (
                  <svg viewBox="0 0 16 16" className="size-2.5 flex-none text-faint">
                    <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                )}
              </div>
            );
          })}
          <AnimatePresence>
            {s.chain.length > 0 && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-1 px-1 text-[9.5px] leading-snug text-faint">
                Greyed tools can't follow the last step.
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* chain */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border-hi bg-surface-2 px-2.5 py-1.5">
            <div className="flex -space-x-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="block h-5 w-4 rounded-[3px] border border-border-hi bg-paper"
                  animate={{ y: run === 1 ? [0, 4, 0] : 0, opacity: run >= 2 ? 0.45 : 1 }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                />
              ))}
            </div>
            <span className="text-[11px] text-muted">3 photos</span>
          </div>

          <LayoutGroup>
            <ol className="m-0 list-none p-0">
              <AnimatePresence initial={false}>
                {s.chain.map((slug, i) => {
                  const st = run === 0 ? "idle" : run > i + 1 ? "done" : run === i + 1 ? "running" : "waiting";
                  const warn = s.warn && slug === "compress";
                  const t = getTool(slug)!;
                  return (
                    <motion.li
                      key={slug}
                      layout="position"
                      initial={{ opacity: 0, scale: 0.9, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                      transition={{ type: "spring", stiffness: 520, damping: 34 }}
                    >
                      <Wire flowing={st === "running" || (run === 0 && !warn)} broken={false} label={i === 0 ? "photos" : "1 PDF"} />
                      <motion.div
                        ref={reg(`card:${slug}`)}
                        animate={warn ? { x: [0, -5, 5, -3, 3, 0] } : { x: 0 }}
                        transition={{ duration: 0.4 }}
                        className="rounded-xl border bg-surface transition-[border-color,background-color] duration-200"
                        style={{
                          borderColor: warn ? "var(--warn)" : st === "running" ? tintColor(t.tint) : st === "done" ? "var(--ok)" : "var(--border)",
                        }}
                      >
                        <div className="flex items-center gap-2 px-2.5 py-2">
                          <Icon slug={slug} size={26} lit={st !== "waiting"} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12.5px] font-semibold">{t.name}</div>
                            <div className="truncate font-mono text-[10px] text-muted">
                              {st === "done" ? DONE_NOTE[slug] : st === "running" ? "working…" : st === "waiting" ? "waiting" : slug === "compress" ? `${s.dpi ?? 144} DPI · ${(s.dpi ?? 144) <= 110 ? "small file" : "sharp"}` : slug === "ocr" ? "English text layer" : "A4 · 8 mm margin"}
                            </div>
                          </div>
                          <StepMark state={st} />
                        </div>

                        <AnimatePresence initial={false}>
                          {warn && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease }} className="overflow-hidden">
                              <div className="mx-2 mb-2 rounded-lg border border-warn/40 bg-warn-soft px-2 py-1.5 text-[10.5px] leading-snug">
                                <span className="text-text">Compress turns pages into pictures and wipes OCR's text.</span>{" "}
                                <span
                                  ref={reg("fix")}
                                  className="mt-1 inline-block rounded border border-warn px-1.5 py-px font-semibold text-warn transition-transform duration-100"
                                  style={{ transform: stage === 10 ? "scale(0.93)" : "scale(1)" }}
                                >
                                  Move OCR to the end
                                </span>
                              </div>
                            </motion.div>
                          )}
                          {s.settings && slug === "compress" && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease }} className="overflow-hidden">
                              <div className="border-t border-border px-2.5 py-2">
                                <div className="flex justify-between text-[10.5px]">
                                  <span className="font-semibold">Image DPI</span>
                                  <DpiCounter />
                                </div>
                                <div ref={reg("slider")} className="relative mt-1.5 h-1.5 rounded-full bg-surface-3">
                                  <motion.span className="absolute inset-y-0 left-0 rounded-full bg-accent" initial={{ width: "32%" }} animate={{ width: "11%" }} transition={{ delay: 0.25, duration: 0.8, ease }} />
                                  <motion.span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border-hi bg-surface" initial={{ left: "32%" }} animate={{ left: "11%" }} transition={{ delay: 0.25, duration: 0.8, ease }} />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>

            <motion.div layout="position">
              <Wire flowing={run === 3 || done} broken={false} label={s.chain.length ? "1 PDF" : undefined} />
              {s.chain.length < 3 || s.drag ? (
                <div
                  ref={reg("slot")}
                  className="rounded-xl border-2 border-dashed px-2 py-2.5 text-center text-[10.5px] transition-colors duration-200"
                  style={{
                    borderColor: s.drag ? "var(--ok)" : "var(--border)",
                    background: s.drag ? "var(--ok-soft)" : "transparent",
                    color: s.drag ? "var(--ok)" : "var(--faint)",
                  }}
                >
                  {s.drag ? `Drop to add ${SHORT[s.drag]}` : s.chain.length === 0 ? "Drag a tool here" : "Drag the next tool here"}
                </div>
              ) : (
                <Result done={done} run={run} slotRef={reg("slot")} />
              )}
            </motion.div>
          </LayoutGroup>

          <div className="mt-3 flex justify-end">
            <span
              ref={reg("run")}
              className="inline-flex h-8 items-center rounded-[9px] px-3.5 text-[12px] font-semibold transition-[transform,background-color,color] duration-150"
              style={{
                background: s.chain.length === 3 && !s.warn ? "var(--accent)" : "var(--surface-3)",
                color: s.chain.length === 3 && !s.warn ? "var(--on-accent)" : "var(--faint)",
                transform: stage === 14 ? "scale(0.94)" : "scale(1)",
              }}
            >
              {run > 0 && run < 4 ? "Working…" : done ? "Run again" : "Run"}
            </span>
          </div>
        </div>

        {/* the dragged tile */}
        <AnimatePresence>
          {s.drag && (
            <motion.div
              key={s.drag}
              className="pointer-events-none absolute left-0 top-0 z-10 flex items-center gap-1.5 rounded-[9px] border border-accent bg-surface px-1.5 py-1 shadow-[var(--shadow-card)]"
              initial={{ opacity: 0, scale: 0.9, x: cursor.x - 30, y: cursor.y - 14 }}
              animate={{ opacity: 1, scale: 1, rotate: -3, x: cursor.x - 30, y: cursor.y - 14 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.6, ease }}
            >
              <Icon slug={s.drag} size={22} />
              <span className="text-[11px] font-medium">{SHORT[s.drag]}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* the cursor */}
        {!reduce && (
          <motion.svg
            className="pointer-events-none absolute left-0 top-0 z-20 drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.35)]"
            width="18"
            height="20"
            viewBox="0 0 18 20"
            initial={false}
            animate={{ x: cursor.x, y: cursor.y, scale: s.press ? 0.86 : 1 }}
            transition={{ x: { duration: 0.55, ease }, y: { duration: 0.55, ease }, scale: { duration: 0.15 } }}
          >
            <path d="M2 1.5l13 8.2-5.6 1.3 3.2 6.4-2.6 1.3-3.2-6.4L2.6 16z" fill="var(--text)" stroke="var(--surface)" strokeWidth="1.3" strokeLinejoin="round" />
          </motion.svg>
        )}
      </div>
    </div>
  );
}

function DpiCounter() {
  const [n, setN] = useState(144);
  useEffect(() => {
    const steps = [144, 132, 120, 110, 102, 96];
    const timers = steps.map((v, i) => window.setTimeout(() => setN(v), 250 + i * 140));
    return () => timers.forEach(clearTimeout);
  }, []);
  return <span className="font-mono text-muted">{n}</span>;
}

function Wire({ flowing, broken, label }: { flowing: boolean; broken: boolean; label?: string }) {
  return (
    <div className="relative flex h-6 items-center justify-center">
      <svg width="10" height="24" viewBox="0 0 10 24">
        <path d="M5 0v24" stroke={broken ? "var(--danger)" : flowing ? "var(--accent)" : "var(--border-hi)"} strokeWidth="2" strokeLinecap="round" className={flowing ? "recipe-flow" : undefined} />
      </svg>
      {label && (
        <span className="absolute left-1/2 top-1/2 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-full border border-border bg-surface px-1.5 font-mono text-[9px] text-muted">
          {label}
        </span>
      )}
    </div>
  );
}

function StepMark({ state }: { state: "idle" | "waiting" | "running" | "done" }) {
  return (
    <span className="grid w-4 flex-none place-items-center">
      {state === "running" && (
        <svg className="spinner size-3.5 text-accent" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2.4" strokeOpacity="0.25" />
          <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      )}
      {state === "done" && (
        <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }} width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--ok)" strokeWidth="2.2">
          <motion.path d="M2.5 8.4l3.2 3.2L13.5 4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3 }} />
        </motion.svg>
      )}
    </span>
  );
}

function Result({ done, run, slotRef }: { done: boolean; run: number; slotRef: (el: HTMLElement | null) => void }): ReactNode {
  const size = run >= 3 || done ? "1.1 MB" : run === 2 ? "8.4 MB" : "—";
  return (
    <div
      ref={slotRef}
      className="rounded-xl border px-2.5 py-2 transition-[border-color,background-color] duration-300"
      style={{ borderColor: done ? "var(--ok)" : "var(--border)", background: done ? "var(--ok-soft)" : "var(--surface-2)" }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9.5px] font-bold tracking-[0.12em] text-faint">{done ? "RESULT" : "YOU GET"}</span>
        {done && <span className="font-mono text-[9.5px] font-bold text-ok">DONE · ON THIS DEVICE</span>}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="truncate text-[12.5px] font-medium">{done ? "scan.pdf" : "One PDF"}</span>
        <motion.span key={size} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease }} className="font-mono text-[18px] font-bold tracking-[-0.03em]">
          {size}
        </motion.span>
      </div>
      {done && <div className="font-mono text-[10px] text-muted">−87% · searchable</div>}
    </div>
  );
}
