import { Link } from "react-router-dom";
import { RECIPES } from "@/recipes/registry";
import { DesktopOnlyBadge } from "@/components/DesktopOnlyBadge";

export function RecipesIndex() {
  return (
    <div className="mx-auto max-w-6xl px-8 py-13">
      <h1 className="m-0 text-4xl font-semibold tracking-[-0.032em]">Recipes</h1>
      <p className="mt-2.5 max-w-[58ch] text-[15.5px] text-muted">
        Curated multi-step chains over the tools in this app — drop your
        files once, run every step in order, get one final result.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {RECIPES.map((recipe) => (
          <Link
            key={recipe.slug}
            to={recipe.status === "desktop-only" ? "/download" : `/recipes/${recipe.slug}`}
            className="rounded-[14px] border border-border bg-surface p-5 transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] hover:border-accent"
          >
            <div className="flex items-start justify-between">
              <span className="font-mono text-[11px] text-faint">{recipe.steps.length} steps</span>
              {recipe.status === "desktop-only" && <DesktopOnlyBadge />}
            </div>
            <div className="mt-3 text-[15px] font-semibold">{recipe.title}</div>
            <div className="mt-1 text-[13px] leading-relaxed text-muted">{recipe.description}</div>
            <div className="mt-3 font-mono text-[11px] text-faint">{recipe.steps.join(" → ")}</div>
            <div className="mt-3 font-mono text-[11px] text-accent">
              {recipe.status === "desktop-only" ? "Desktop only →" : "Open →"}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
