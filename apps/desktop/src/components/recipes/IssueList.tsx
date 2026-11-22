import { AnimatePresence, motion } from "motion/react";
import type { Fix, Issue } from "@/lib/chain";

export function IssueIcon({ level }: { level: "error" | "warning" | "info" }) {
  if (level === "error") {
    return (
      <svg viewBox="0 0 16 16" className="size-3.5 flex-none" aria-hidden>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (level === "warning") {
    return (
      <svg viewBox="0 0 16 16" className="size-3.5 flex-none" aria-hidden>
        <path d="M8 2.2l6 10.6H2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6.6v3M8 11.4v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 flex-none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.2v4M8 4.8v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const TONE = {
  error: "border-danger/40 bg-danger-soft text-danger",
  warning: "border-warn/40 bg-warn-soft text-warn",
  info: "border-info/30 bg-info-soft text-info",
};

/** A step's problems, each with its one-click fix. */
export function IssueList({
  issues,
  needs,
  onFix,
}: {
  issues: Issue[];
  needs?: string | null;
  onFix?: (fix: Fix) => void;
}) {
  const rows: { level: "error" | "warning" | "info"; message: string; fix?: Fix }[] = [
    ...issues,
    ...(needs ? [{ level: "info" as const, message: needs }] : []),
  ];
  return (
    <AnimatePresence initial={false}>
      {rows.map((r) => (
        <motion.div
          key={r.message}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="overflow-hidden"
        >
          <div
            role={r.level === "error" ? "alert" : undefined}
            className={`mt-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[12.5px] leading-snug ${TONE[r.level]}`}
          >
            <span className="mt-px">
              <IssueIcon level={r.level} />
            </span>
            <span className="min-w-0 flex-1 text-text">{r.message}</span>
            {r.fix && onFix && (
              <button
                type="button"
                onClick={() => onFix(r.fix!)}
                className="flex-none rounded-md border border-current px-2 py-0.5 text-[11.5px] font-semibold transition-transform duration-100 hover:bg-surface active:scale-[0.96]"
              >
                {r.fix.label}
              </button>
            )}
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
