import { Fragment } from "react";
import { getTool } from "@/tools/registry";
import { tintWash } from "@/tools/tint";
import type { RecipeStep } from "@/recipes/chain";
import { tr } from "@iloathepdf/i18n";

/** A tool's icon in its tinted tile. */
export function StepIcon({ tool, size = 30 }: { tool: string; size?: number }) {
  const t = getTool(tool);
  if (!t) return null;
  const Icon = t.Icon;
  return (
    <span
      className="grid flex-none place-items-center rounded-[9px]"
      style={{ width: size, height: size, background: tintWash(t.tint, 16) }}
      aria-hidden
    >
      <Icon width={size * 0.58} height={size * 0.58} />
    </span>
  );
}

/** The recipe at a glance: step icons joined by arrows. */
export function ChainStrip({ steps, size = 26 }: { steps: RecipeStep[]; size?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label={steps.map((s) => getTool(s.tool)?.name ?? s.tool).join(tr(", then "))}>
      {steps.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <svg width="12" height="10" viewBox="0 0 12 10" className="flex-none text-faint" aria-hidden>
              <path d="M1 5h9M7 2l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <span title={getTool(s.tool)?.name}>
            <StepIcon tool={s.tool} size={size} />
          </span>
        </Fragment>
      ))}
    </div>
  );
}
