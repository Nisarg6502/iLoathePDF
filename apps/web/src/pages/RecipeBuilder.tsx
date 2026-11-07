import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getTool } from "@/tools/registry";
import { getCustomRecipe, saveCustomRecipe, allowedNext, validateSteps, chainWarning, defaultTitle, MAX_STEPS } from "@/recipes/customRecipes";

const label = (slug: string) => getTool(slug)?.name ?? slug;

export function RecipeBuilder() {
  const { slug } = useParams<{ slug: string }>();
  const existing = slug ? getCustomRecipe(slug) : undefined;
  const navigate = useNavigate();

  const [steps, setSteps] = useState<string[]>(existing?.steps ?? []);
  const [title, setTitle] = useState(existing?.title ?? "");

  if (slug && !existing) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-14">
        <h1 className="text-2xl font-semibold">Recipe not found</h1>
        <Link to="/recipes" className="mt-4 inline-block font-mono text-[12px] text-accent">← All recipes</Link>
      </div>
    );
  }

  // With one step the "add one more" hint below is guidance, not an error.
  const problem = steps.length >= 2 ? validateSteps(steps, label) : null;
  const canSave = validateSteps(steps, label) === null;
  const warning = chainWarning(steps);
  const options = allowedNext(steps);

  function save() {
    if (!canSave) return;
    const saved = saveCustomRecipe({
      id: existing?.slug,
      title: title.trim() || defaultTitle(steps, label),
      description: defaultTitle(steps, label),
      steps,
    });
    navigate(`/recipes/${saved.slug}`);
  }

  function move(i: number, by: -1 | 1) {
    const next = [...steps];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setSteps(next);
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-13">
      <Link to="/recipes" className="font-mono text-[12px] text-accent">← All recipes</Link>
      <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.028em]">
        {existing ? "Edit recipe" : "New recipe"}
      </h1>
      <p className="mt-1.5 max-w-[58ch] text-sm text-muted">
        Chain tools into your own recipe. Each step runs on the previous step's result, with that tool's default settings.
        It's saved in this browser only.
      </p>

      <label className="mt-7 block text-[12.5px] font-semibold" htmlFor="recipe-title">Name</label>
      <input
        id="recipe-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={60}
        placeholder={steps.length > 0 ? defaultTitle(steps, label) : "e.g. Scan → Compact"}
        className="mt-1.5 h-10 w-full rounded-[11px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent"
      />

      <div className="mt-7 text-[12.5px] font-semibold">Steps</div>
      {steps.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted">
          No steps yet — pick the first tool below.
        </p>
      ) : (
        <ol className="mt-2 flex flex-col gap-2">
          {steps.map((s, i) => (
            <li key={`${s}-${i}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5">
              <span className="grid size-5 flex-none place-items-center rounded-full bg-surface-2 font-mono text-[10.5px] text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 text-[13.5px]">{label(s)}</span>
              <button type="button" aria-label={`Move ${label(s)} up`} disabled={i === 0} onClick={() => move(i, -1)} className="px-1.5 text-muted hover:text-text disabled:opacity-30">↑</button>
              <button type="button" aria-label={`Move ${label(s)} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)} className="px-1.5 text-muted hover:text-text disabled:opacity-30">↓</button>
              <button type="button" aria-label={`Remove ${label(s)}`} onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="px-1.5 text-muted hover:text-danger">✕</button>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5 text-[12.5px] font-semibold">
        {steps.length === 0 ? "Start with" : "Then"}
      </div>
      {options.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">
          {steps.length >= MAX_STEPS ? "That's the maximum number of steps." : "Nothing can follow this step."}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSteps([...steps, s])}
              className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] transition-transform duration-100 hover:border-accent active:scale-[0.97]"
            >
              + {label(s)}
            </button>
          ))}
        </div>
      )}

      {problem && <p role="alert" className="mt-5 text-[13px] text-danger">{problem}</p>}
      {warning && <p className="mt-5 text-[13px] text-muted">{warning}</p>}
      {!problem && steps.length === 1 && <p className="mt-5 text-[13px] text-muted">Add at least one more step.</p>}

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="h-10 rounded-[11px] bg-accent px-5 text-sm font-semibold text-on-tint transition-transform duration-100 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint active:enabled:scale-[0.97]"
        >
          {existing ? "Save changes" : "Save recipe"}
        </button>
        <Link to="/recipes" className="text-sm text-muted hover:text-text">Cancel</Link>
      </div>
    </div>
  );
}
