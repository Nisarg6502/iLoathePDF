import { Fragment } from "react";
import { toolById } from "@/lib/tools";
import type { RecipeStep } from "@/lib/chain";

/** A tool's icon in its tinted tile. */
export function StepIcon({ tool, size = 30, muted = false }: { tool: string; size?: number; muted?: boolean }) {
  const t = toolById(tool);
  if (!t) return null;
  const Icon = t.icon;
  return (
    <span
      aria-hidden
      className="grid flex-none place-items-center rounded-[9px] transition-[filter] duration-200"
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklab, var(--tint-${t.tint}) 16%, transparent)`,
        color: `var(--tint-${t.tint})`,
        filter: muted ? "grayscale(1)" : undefined,
      }}
    >
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={1.6} />
    </span>
  );
}

/** The recipe at a glance: step icons joined by arrows. */
export function ChainStrip({ steps, size = 26 }: { steps: RecipeStep[]; size?: number }) {
  return (
    <span className="flex flex-wrap items-center gap-1" aria-label={steps.map((s) => toolById(s.tool)?.title ?? s.tool).join(", then ")}>
      {steps.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <svg width="12" height="10" viewBox="0 0 12 10" className="flex-none text-faint" aria-hidden>
              <path d="M1 5h9M7 2l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <span title={toolById(s.tool)?.title}>
            <StepIcon tool={s.tool} size={size} />
          </span>
        </Fragment>
      ))}
    </span>
  );
}
