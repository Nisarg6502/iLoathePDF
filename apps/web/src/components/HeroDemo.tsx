import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const START_KB = 3140; // matches the displayed "3.14 MB"
const END_KB = 812;
const DURATION_MS = 1400;

function formatSize(kb: number): string {
  return kb >= 1000 ? `${(kb / 1000).toFixed(2)} MB` : `${kb} KB`;
}

export function HeroDemo() {
  const [played, setPlayed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sizeKb, setSizeKb] = useState(START_KB);
  const rafRef = useRef<number | undefined>(undefined);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!played) return;

    if (prefersReducedMotion) {
      setProgress(100);
      setSizeKb(END_KB);
      return;
    }

    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const pct = Math.min(1, elapsed / DURATION_MS);
      setProgress(pct * 100);
      setSizeKb(Math.round(START_KB - (START_KB - END_KB) * pct));
      if (pct < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [played, prefersReducedMotion]);

  const done = played && progress >= 100;
  const label = !played ? "READY" : done ? "DONE" : "PROCESSING";

  return (
    <motion.div
      onViewportEnter={() => setPlayed(true)}
      viewport={{ once: true, amount: 0.6 }}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]"
    >
      <div className="flex h-[38px] items-center gap-2 border-b border-border bg-surface-2 px-3.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border-hi" />
          <span className="size-2.5 rounded-full bg-border-hi" />
          <span className="size-2.5 rounded-full bg-border-hi" />
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] text-faint">iloathepdf.app/compress</span>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-6.5 place-items-center rounded-lg bg-surface-2">
            <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="var(--tint-d)" strokeWidth="1.5">
              <rect x="2.5" y="2.5" width="13" height="13" rx="1.2" />
              <path d="M5.5 5.5L8 8M8 8V5.6M8 8H5.6M12.5 12.5L10 10M10 10v2.4M10 10h2.4" />
            </svg>
          </span>
          <span className="text-[13.5px] font-semibold">Compress PDF</span>
          <span className="flex-1" />
          <span className="flex items-center gap-1.5">
            {done && (
              <motion.svg
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="var(--ok)"
                strokeWidth="2"
              >
                <path d="M2.5 8.4l3.2 3.2L13.5 4" strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
            )}
            <span className={`font-mono text-[10.5px] ${done ? "text-ok" : "text-accent"}`}>{label}</span>
          </span>
        </div>
        <div className="mt-4.5 rounded-xl border border-border bg-surface-2 p-5">
          <div className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">RESULT</div>
          <div className="mt-3 flex items-baseline gap-3 font-mono">
            <span className="text-[22px] text-faint line-through">3.14 MB</span>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--faint)" strokeWidth="1.5">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
            <span className="text-[38px] font-bold tracking-[-0.03em]">{formatSize(sizeKb)}</span>
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-3">
            <span className="bg-ok" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
            <span>{done ? "−75% smaller" : played ? "compressing…" : "waiting to start"}</span>
            <span>quality: balanced</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
