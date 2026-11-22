import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { CATEGORIES, RECIPES, recipeHasPreviewStep, type RecipeCategory, type RecipeConfig } from "@/recipes/registry";
import { DesktopOnlyBadge } from "@/components/DesktopOnlyBadge";
import { PreviewBadge } from "@/components/PreviewBadge";
import { ChainStrip } from "@/components/recipes/ChainStrip";
import { useCustomRecipes } from "@/recipes/useCustomRecipes";
import { getTool } from "@/tools/registry";

type Filter = "all" | "popular" | "mine" | RecipeCategory;

const ease = [0.23, 1, 0.32, 1] as const;

function matches(recipe: RecipeConfig, q: string): boolean {
  if (!q) return true;
  const hay = [recipe.title, recipe.description, recipe.goodFor ?? "", ...recipe.steps.map((s) => getTool(s.tool)?.name ?? s.tool)]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

function RecipeCard({ recipe, index }: { recipe: RecipeConfig; index: number }) {
  const desktopOnly = recipe.status === "desktop-only";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      transition={{ duration: 0.25, ease, delay: Math.min(index, 12) * 0.025 }}
    >
      <Link
        to={desktopOnly ? "/download" : `/recipes/${recipe.slug}`}
        className="group flex h-full flex-col rounded-[14px] border border-border bg-surface p-5 transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-strong)] hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start justify-between gap-2">
          <ChainStrip steps={recipe.steps} size={26} />
          {!desktopOnly && recipeHasPreviewStep(recipe) && <PreviewBadge />}
          {desktopOnly && <DesktopOnlyBadge />}
        </div>
        <div className="mt-3.5 text-[15px] font-semibold">{recipe.title}</div>
        <div className="mt-1 flex-1 text-[13px] leading-relaxed text-muted">{recipe.description}</div>
        {recipe.goodFor && <div className="mt-2 text-[12px] text-faint">Good for: {recipe.goodFor}</div>}
        <div className="mt-3 flex items-center justify-between font-mono text-[11px]">
          <span className="text-faint">
            {recipe.steps.length} step{recipe.steps.length === 1 ? "" : "s"}
          </span>
          <span className="text-accent transition-transform duration-150 group-hover:translate-x-0.5">
            {desktopOnly ? "Desktop only →" : "Open →"}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

export function RecipesIndex() {
  const custom = useCustomRecipes();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: RECIPES.length + custom.length },
    { id: "popular", label: "Most used", count: RECIPES.filter((r) => r.popular).length },
    ...CATEGORIES.map((c) => ({ id: c.id as Filter, label: c.label, count: RECIPES.filter((r) => r.category === c.id).length })),
    ...(custom.length > 0 ? [{ id: "mine" as Filter, label: "Your recipes", count: custom.length }] : []),
  ];

  const builtIns = RECIPES.filter(
    (r) => (filter === "all" || (filter === "popular" ? r.popular : r.category === filter)) && matches(r, q),
  );
  const mine = filter === "all" || filter === "mine" ? custom.filter((r) => matches(r, q)) : [];
  const category = CATEGORIES.find((c) => c.id === filter);
  const nothing = builtIns.length === 0 && mine.length === 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-13">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="m-0 text-4xl font-semibold tracking-[-0.032em]">Recipes</h1>
            <p className="mt-2.5 max-w-[60ch] text-[15.5px] text-muted">
              Several tools in a row, in one go. Drop your files once and get the finished result: a form-ready PDF, a photo
              under 50 KB, a numbered and stamped document. Use one as it is, tweak its settings, or build your own.
            </p>
          </div>
          <Link
            to="/recipes/new"
            className="flex items-center gap-2 rounded-[11px] bg-accent px-4 py-2.5 text-sm font-semibold text-on-tint transition-transform duration-100 active:scale-[0.97]"
          >
            <span className="text-[16px] leading-none">+</span> Build a recipe
          </Link>
        </div>

        <div className="mt-7 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <LayoutGroup id="recipe-tabs">
            <div role="tablist" aria-label="Recipe categories" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={filter === t.id}
                  onClick={() => setFilter(t.id)}
                  className={`relative flex-none rounded-full px-3.5 py-1.5 text-[13px] transition-colors duration-150 ${
                    filter === t.id ? "text-on-tint" : "text-muted hover:text-text"
                  }`}
                >
                  {filter === t.id && (
                    <motion.span layoutId="recipe-tab-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                  )}
                  <span className="relative">
                    {t.label} <span className="font-mono text-[10.5px] opacity-70">{t.count}</span>
                  </span>
                </button>
              ))}
            </div>
          </LayoutGroup>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: photo, aadhaar, password, upload…"
            aria-label="Search recipes"
            className="h-9 w-full rounded-[11px] border border-border bg-surface px-3.5 text-[13px] outline-none focus:border-accent md:w-[300px]"
          />
        </div>

        <AnimatePresence mode="wait">
          {category && (
            <motion.p key={category.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 text-[13px] text-muted">
              {category.blurb}
            </motion.p>
          )}
        </AnimatePresence>

        {mine.length > 0 && (
          <section className="mt-7">
            <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-faint">Your recipes</h2>
            <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {mine.map((recipe, i) => (
                  <RecipeCard key={recipe.slug} recipe={recipe} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {builtIns.length > 0 && (
          <section className="mt-7">
            {mine.length > 0 && <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-faint">Ready-made</h2>}
            <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {builtIns.map((recipe, i) => (
                  <RecipeCard key={recipe.slug} recipe={recipe} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {nothing && (
          <div className="mt-10 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <div className="text-[15px] font-semibold">No recipe matches “{query}”</div>
            <p className="mt-1 text-[13px] text-muted">Build one that does exactly what you need. It takes a minute.</p>
            <Link to="/recipes/new" className="mt-4 inline-block font-mono text-[12px] text-accent">Build a recipe →</Link>
          </div>
        )}

        {custom.length === 0 && filter === "all" && !q && (
          <div className="mt-10 flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface-2 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[15px] font-semibold">Need something these don't do?</div>
              <p className="mt-1 max-w-[60ch] text-[13px] text-muted">
                Chain up to 10 tools with your own settings, like your counter's usual photo size or a stamp with your shop's name. It's
                saved in this browser and can be shared as a link.
              </p>
            </div>
            <Link to="/recipes/new" className="flex-none rounded-[11px] border border-border bg-surface px-4 py-2 text-sm font-semibold transition-transform duration-100 hover:border-accent active:scale-[0.97]">
              Build your own
            </Link>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
