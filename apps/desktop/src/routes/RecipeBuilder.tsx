/**
 * Build or edit a custom recipe: pick tools one after another; the picker only
 * offers tools that can accept what the previous step produces (see
 * lib/customRecipes.ts for the rules).
 */
import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  MAX_STEPS,
  allowedNext,
  defaultTitle,
  saveCustomRecipe,
  validateSteps,
} from "@/lib/customRecipes";
import { toolById } from "@/lib/tools";
import { useCustomRecipes } from "@/lib/useCustomRecipes";

const label = (id: string) => toolById(id)?.title ?? id;

export default function RecipeBuilder() {
  const { id } = useParams<{ id: string }>();
  const existing = useCustomRecipes().find((r) => r.id === id);
  const navigate = useNavigate();

  const [steps, setSteps] = useState<string[]>(existing?.steps ?? []);
  const [title, setTitle] = useState(existing?.title ?? "");

  if (id && !existing) {
    return (
      <div className="mx-auto max-w-md px-8 py-24 text-center">
        <h1 className="text-lg font-semibold text-text">That recipe isn’t here</h1>
        <p className="mt-2 text-[14px] text-muted">It may have been deleted.</p>
        <Link
          to="/"
          className="mt-5 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          Back to home
        </Link>
      </div>
    );
  }

  // With one step the "add one more" hint is guidance, not an error.
  const problem = steps.length >= 2 ? validateSteps(steps, label) : null;
  const canSave = validateSteps(steps, label) === null;
  const options = allowedNext(steps);

  function save() {
    if (!canSave) return;
    const saved = saveCustomRecipe({
      id: existing?.id,
      title: title.trim() || defaultTitle(steps, label),
      description: defaultTitle(steps, label),
      steps,
    });
    navigate(`/r/${saved.id}`);
  }

  function move(i: number, by: -1 | 1) {
    const next = [...steps];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setSteps(next);
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-[680px] px-8 py-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text">
          <ArrowLeft className="size-3.5" /> Home
        </Link>
        <h1 className="mt-3 text-[22px] font-semibold tracking-[-0.01em] text-text">
          {existing ? "Edit recipe" : "New recipe"}
        </h1>
        <p className="mt-1.5 text-[14px] text-muted">
          Chain tools into your own recipe. Each step runs on the previous step’s result, with that tool’s default
          settings.
        </p>

        <label htmlFor="recipe-title" className="mt-6 block font-mono text-[11.5px] font-bold tracking-[0.13em] text-faint">
          NAME
        </label>
        <input
          id="recipe-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          placeholder={steps.length > 0 ? defaultTitle(steps, label) : "e.g. Scan → Compact"}
          className="mt-1.5 h-9 w-full rounded-lg border border-border-hi bg-surface px-3 text-[14px] text-text outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent"
        />

        <div className="mt-6 font-mono text-[11.5px] font-bold tracking-[0.13em] text-faint">STEPS</div>
        {steps.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-border px-4 py-5 text-[13.5px] text-muted">
            No steps yet — pick the first tool below.
          </p>
        ) : (
          <ol className="mt-2 grid gap-1.5">
            {steps.map((s, i) => {
              const tool = toolById(s);
              return (
                <li
                  key={`${s}-${i}`}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <span className="grid size-6 flex-none place-items-center rounded-full bg-surface-2 font-mono text-[11px] font-bold text-muted">
                    {i + 1}
                  </span>
                  {tool ? (
                    <tool.icon className="size-4 flex-none" style={{ color: `var(--tint-${tool.tint})` }} strokeWidth={1.5} />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-text">{label(s)}</span>
                  <Button variant="secondary" size="iconSm" aria-label={`Move ${label(s)} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="secondary" size="iconSm" aria-label={`Move ${label(s)} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button variant="danger" size="iconSm" aria-label={`Remove ${label(s)}`} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-5 font-mono text-[11.5px] font-bold tracking-[0.13em] text-faint">
          {steps.length === 0 ? "START WITH" : "THEN"}
        </div>
        {options.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-muted">
            {steps.length >= MAX_STEPS ? "That’s the maximum number of steps." : "Nothing can follow this step."}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {options.map((s) => (
              <Button key={s} variant="secondary" size="sm" onClick={() => setSteps([...steps, s])}>
                <Plus />
                {label(s)}
              </Button>
            ))}
          </div>
        )}

        {problem ? (
          <p role="alert" className="mt-5 text-[13.5px] text-danger">
            {problem}
          </p>
        ) : null}
        {!problem && steps.length === 1 ? (
          <p className="mt-5 text-[13.5px] text-muted">Add at least one more step.</p>
        ) : null}

        <div className="mt-8 flex items-center gap-3">
          <Button variant="primary" onClick={save} disabled={!canSave} className="h-[38px] px-5 font-semibold">
            {existing ? "Save changes" : "Save recipe"}
          </Button>
          <Link to={existing ? `/r/${existing.id}` : "/"} className="text-[13.5px] text-muted hover:text-text">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
