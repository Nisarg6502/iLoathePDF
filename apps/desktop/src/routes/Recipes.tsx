/**
 * All recipes: the ready-made ones by category, the user's own, search, and a
 * way in to the builder (blank, or from a pasted recipe code).
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowRight, Plus } from "lucide-react";

import { CATEGORIES, RECIPES, type Recipe, type RecipeCategory } from "@/lib/recipes";
import { useCustomRecipes } from "@/lib/useCustomRecipes";
import { decodeShare } from "@/lib/customRecipes";
import { toolById } from "@/lib/tools";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ChainStrip } from "@/components/recipes/ChainStrip";
import { Button } from "@/components/ui/button";
import { tr, useTranslation } from "@iloathepdf/i18n";

type Filter = "all" | "popular" | "mine" | RecipeCategory;

function matches(recipe: Recipe, q: string): boolean {
  if (!q) return true;
  const hay = [tr(recipe.title), tr(recipe.description), tr(recipe.goodFor ?? ""), ...recipe.steps.map((s) => tr(toolById(s.tool)?.title ?? s.tool))]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function RecipeCard({ recipe, index }: { recipe: Recipe; index: number }) {
  const { t } = useTranslation();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      transition={{ duration: 0.24, ease: EASE_OUT, delay: Math.min(index, 12) * 0.025 }}
    >
      <Link
        to={`/r/${recipe.id}`}
        className={cn(
          "group relative flex h-full flex-col gap-2.5 rounded-card border border-border bg-surface p-4",
          "shadow-[var(--shadow-card)] outline-none",
          "transition-[transform,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
          "hover:-translate-y-0.5 hover:border-accent",
          "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "active:translate-y-0 active:scale-[0.99]",
        )}
      >
        <ChainStrip steps={recipe.steps} size={26} />
        <span className="flex-1">
          <span className="block text-[15.5px] font-semibold tracking-[-0.01em] text-text">{tr(recipe.title)}</span>
          <span className="mt-1 block text-[13.5px] leading-relaxed text-muted">{tr(recipe.description)}</span>
          {recipe.goodFor ? <span className="mt-1.5 block text-[12.5px] text-faint">{t("Good for: {{goodFor}}", { goodFor: recipe.goodFor })}</span> : null}
        </span>
        <span className="font-mono text-[11px] text-faint">
          {t("{{count}} STEPS", { count: recipe.steps.length })}
        </span>
        <ArrowRight
          aria-hidden
          className="absolute right-4 top-4 size-4 -translate-x-1 text-muted opacity-0 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0 group-hover:opacity-100"
        />
      </Link>
    </motion.div>
  );
}

export default function Recipes() {
  const { t } = useTranslation();
  const custom = useCustomRecipes();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const q = query.trim().toLowerCase();

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: tr("All"), count: RECIPES.length + custom.length },
    { id: "popular", label: tr("Most used"), count: RECIPES.filter((r) => r.popular).length },
    ...CATEGORIES.map((c) => ({ id: c.id as Filter, label: c.label, count: RECIPES.filter((r) => r.category === c.id).length })),
    ...(custom.length > 0 ? [{ id: "mine" as Filter, label: tr("Your recipes"), count: custom.length }] : []),
  ];

  const builtIns = filter === "mine" ? [] : RECIPES.filter((r) => (filter === "all" || (filter === "popular" ? r.popular : r.category === filter)) && matches(r, q));
  const mine = filter === "all" || filter === "mine" ? custom.filter((r) => matches(r, q)) : [];
  const category = CATEGORIES.find((c) => c.id === filter);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-10 pt-[30px] pb-10">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="m-0 text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-text">{t("Recipes")}</h1>
            <p className="mt-2 max-w-[640px] text-[14.5px] text-muted">
              {t("Several tools in a row, in one go. Drop your files once and get the finished result: a form-ready PDF, a photo under 50 KB, a numbered and stamped document. Use one as it is, adjust its settings, or build your own.")}
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate("/r/new")} className="h-[38px] flex-none px-4 font-semibold">
            <Plus />
            {t("Build a recipe")}
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <LayoutGroup id="recipe-tabs">
            <div role="tablist" aria-label={t("Recipe categories")} className="flex flex-wrap gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={filter === tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={cn(
                    "relative rounded-full px-3.5 py-1.5 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent",
                    filter === tab.id ? "text-on-accent" : "text-muted hover:text-text",
                  )}
                >
                  {filter === tab.id ? (
                    <motion.span layoutId="recipe-tab-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                  ) : null}
                  <span className="relative">
                    {tab.label} <span className="font-mono text-[10.5px] opacity-70">{tab.count}</span>
                  </span>
                </button>
              ))}
            </div>
          </LayoutGroup>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search: photo, aadhaar, password…")}
            aria-label={t("Search recipes")}
            className="h-8 w-[260px] flex-none rounded-lg border border-border-hi bg-surface px-3 text-[13px] text-text outline-none focus:border-accent"
          />
        </div>
        {category ? <p className="mt-2.5 text-[13px] text-muted">{tr(category.blurb)}</p> : null}

        {mine.length > 0 ? (
          <section className="mt-6">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[11.5px] font-bold tracking-[0.13em] text-faint">{t("YOUR RECIPES")}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {mine.map((r, i) => (
                  <RecipeCard key={r.id} recipe={r} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </section>
        ) : null}

        {builtIns.length > 0 ? (
          <section className="mt-6">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[11.5px] font-bold tracking-[0.13em] text-faint">{t("READY-MADE")}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {builtIns.map((r, i) => (
                  <RecipeCard key={r.id} recipe={r} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </section>
        ) : null}

        {builtIns.length === 0 && mine.length === 0 ? (
          <div className="mt-8 rounded-card border border-dashed border-border-hi px-6 py-10 text-center">
            <p className="text-[15px] font-semibold text-text">{t("No recipe matches “{{query}}”", { query })}</p>
            <p className="mt-1 text-[13.5px] text-muted">{t("Build one that does exactly what you need.")}</p>
            <Link to="/r/new" className="mt-3 inline-block text-[13.5px] text-accent">
              {t("Build a recipe →")}
            </Link>
          </div>
        ) : null}

        <section className="mt-8 flex items-center gap-4 rounded-card border border-border bg-surface-2 p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold text-text">{t("Got a recipe code?")}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {t("Every recipe has a Copy code button. Paste a code from another computer to set the same recipe up here.")}
            </p>
          </div>
          <form
            className="flex flex-none items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!decodeShare(code.trim())) {
                setCodeError(true);
                return;
              }
              navigate(`/r/new?code=${encodeURIComponent(code.trim())}`);
            }}
          >
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError(false);
              }}
              placeholder={t("Paste a recipe code")}
              aria-label={t("Recipe code")}
              aria-invalid={codeError}
              className={cn(
                "h-8 w-[240px] rounded-lg border bg-surface px-2.5 font-mono text-[12px] text-text outline-none focus:border-accent",
                codeError ? "border-danger" : "border-border-hi",
              )}
            />
            <Button type="submit" size="sm" disabled={!code.trim()}>
              {t("Open")}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
