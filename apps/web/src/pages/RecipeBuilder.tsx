/**
 * The recipe builder: a visual chain of tools.
 *
 * Tools come from the palette (click to add at the end, or drag onto any gap
 * in the chain). Each step is a card with its tool's own settings panel, and
 * the gaps between cards show what flows from one step to the next. The rules
 * in recipes/chain.ts run on every change: a step that can't work turns red
 * and says why, with a one-click fix; one that works but probably not as
 * intended turns amber. While a tool is being dragged, every gap shows
 * whether it would fit there.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, LayoutGroup, MotionConfig, Reorder, motion, useAnimate, useDragControls } from "motion/react";
import { getTool } from "@/tools/registry";
import { getCustomRecipe, saveCustomRecipe, decodeShare } from "@/recipes/customRecipes";
import { RECIPES, getRecipe } from "@/recipes/registry";
import {
  GROUP_LABEL,
  MAX_STEPS,
  RECIPE_TOOLS,
  UNAVAILABLE_TOOLS,
  analyzeChain,
  applyFix,
  canInsert,
  defaultTitle,
  describeOutput,
  diffOptions,
  flowLabel,
  kindLabel,
  type ChainAnalysis,
  type Fix,
  type RecipeStep,
  type StepAnalysis,
} from "@/recipes/chain";
import { StepIcon, ChainStrip } from "@/components/recipes/ChainStrip";
import { IssueIcon, IssueList } from "@/components/recipes/IssueList";
import { stepSummary } from "@/components/recipes/stepSummary";
import { tr, useTranslation } from "@iloathepdf/i18n";

const label = (slug: string) => tr(getTool(slug)?.name ?? slug);
const defaultsOf = (slug: string) => getTool(slug)?.defaultOptions ?? {};

interface Draft extends RecipeStep {
  id: string;
}

let nextId = 0;
const newId = () => `s${++nextId}`;
const toDrafts = (steps: RecipeStep[]): Draft[] => steps.map((s) => ({ ...s, options: s.options ? structuredClone(s.options) : undefined, id: newId() }));
const plain = (drafts: Draft[]): RecipeStep[] => drafts.map(({ tool, options }) => ({ tool, options }));

const ease = [0.23, 1, 0.32, 1] as const;
const DRAG_TYPE = "application/x-ilp-tool";

/** Where the builder starts: an existing recipe, a copy of one, a shared link, or empty. */
function useInitial() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const location = useLocation();
  return useMemo(() => {
    if (slug) {
      const existing = getCustomRecipe(slug);
      return existing ? { mode: "edit" as const, existing, title: existing.title, description: existing.description, steps: existing.steps } : null;
    }
    const from = params.get("from");
    if (from) {
      const src = getRecipe(from);
      if (src && src.status === "live") {
        return { mode: "copy" as const, title: `${src.title} (my version)`, description: src.description, steps: src.steps, source: src.title };
      }
    }
    const hash = location.hash.startsWith("#r=") ? location.hash.slice(3) : "";
    if (hash) {
      const shared = decodeShare(hash);
      if (shared) return { mode: "shared" as const, ...shared };
    }
    return { mode: "new" as const, title: "", description: "", steps: [] as RecipeStep[] };
    // Read once on mount; later URL changes don't reset the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function RecipeBuilder() {
  const { t } = useTranslation();
  const initial = useInitial();
  const navigate = useNavigate();

  const [steps, setSteps] = useState<Draft[]>(() => toDrafts(initial?.steps ?? []));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragTool, setDragTool] = useState<string | null>(null);
  const [pickerAt, setPickerAt] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ tool: string; reason: string } | null>(null);

  const chain = plain(steps);
  const analysis = analyzeChain(chain, label, defaultsOf, false, tr);
  const canSave = steps.length > 0 && analysis.errors === 0;

  if (!initial) {
    return (
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14">
        <h1 className="text-2xl font-semibold">{t("Recipe not found")}</h1>
        <Link to="/recipes" className="mt-4 inline-block font-mono text-[12px] text-accent">{t("← All recipes")}</Link>
      </div>
    );
  }

  function insert(tool: string, at: number) {
    const check = canInsert(chain, at, tool, label, defaultsOf, tr);
    if (!check.ok) {
      setFlash({ tool, reason: check.reason });
      return;
    }
    const draft: Draft = { tool, id: newId() };
    const next = [...steps];
    next.splice(at, 0, draft);
    setSteps(next);
    setPickerAt(null);
    setFlash(null);
    // Open the new step's settings when it has something to set.
    if (["protect", "split", "watermark", "crop"].includes(tool)) setOpenId(draft.id);
  }

  function fix(f: Fix) {
    const plainNext = applyFix(chain, f);
    // Keep ids stable for steps that survive, so cards animate instead of remounting.
    const pool = [...steps];
    const next = plainNext.map((s) => {
      const at = pool.findIndex((d) => d.tool === s.tool && d.options === s.options);
      if (at !== -1) return pool.splice(at, 1)[0];
      return { ...s, id: newId() };
    });
    setSteps(next);
  }

  function update(id: string, options: Record<string, unknown>) {
    setSteps((list) => list.map((d) => (d.id === id ? { ...d, options: diffOptions(options, defaultsOf(d.tool)) } : d)));
  }

  function move(i: number, by: -1 | 1) {
    const next = [...steps];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setSteps(next);
  }

  function duplicate(i: number) {
    const next = [...steps];
    next.splice(i + 1, 0, { ...steps[i], options: steps[i].options ? structuredClone(steps[i].options) : undefined, id: newId() });
    setSteps(next);
  }

  function save() {
    if (!canSave) return;
    const saved = saveCustomRecipe({
      id: initial?.mode === "edit" ? initial.existing.slug : undefined,
      title: title.trim() || defaultTitle(chain, label),
      description: description.trim() || defaultTitle(chain, label),
      steps: chain,
    });
    navigate(`/recipes/${saved.slug}`);
  }

  const heading = initial.mode === "edit" ? tr("Edit recipe") : initial.mode === "copy" ? tr("Customize recipe") : initial.mode === "shared" ? tr("Shared recipe") : tr("New recipe");

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10">
        <Link to="/recipes" className="font-mono text-[12px] text-accent">{t("← All recipes")}</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{heading}</h1>
            <p className="mt-1.5 max-w-[62ch] text-sm text-muted">
              {initial.mode === "copy"
                ? t("Starting from “{{source}}”. Change any step's settings, add or remove steps, then save it as your own.", { source: initial.source })
                : initial.mode === "shared"
                  ? t("Someone shared this recipe with you. Check the steps, then save it to use it.")
                  : t("Chain tools together and set each one up the way you want. Saved in this browser only; nothing is uploaded.")}
            </p>
          </div>
          <StatusPill analysis={analysis} empty={steps.length === 0} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold">{t("Name")}</span>
            <input
              id="recipe-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              placeholder={steps.length > 0 ? defaultTitle(chain, label) : t("e.g. Exam form photo")}
              className="h-10 w-full rounded-[11px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold">
              {t("What it's for")}{" "}<span className="font-normal text-faint">{t("(optional)")}</span>
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder={t("e.g. Photos of marksheets into one PDF under 300 KB")}
              className="h-10 w-full rounded-[11px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
          <div className="order-2 lg:order-1">
          <ToolPalette
            chain={chain}
            analysis={analysis}
            onAdd={(tool) => insert(tool, steps.length)}
            onDragTool={setDragTool}
            flash={flash}
          />
          </div>

          <section aria-label={t("Recipe steps")} className="order-1 min-w-0 lg:order-2">
            <InputNode chain={chain} analysis={analysis} />

            {steps.length === 0 ? (
              <EmptyChain
                dragTool={dragTool}
                onDropTool={(tool) => insert(tool, 0)}
                onTemplate={(s) => setSteps(toDrafts(s.steps))}
              />
            ) : (
              <LayoutGroup>
                <Reorder.Group axis="y" values={steps} onReorder={setSteps} as="ol" className="m-0 list-none p-0">
                  <AnimatePresence initial={false}>
                    {steps.map((d, i) => (
                      <StepItem
                        key={d.id}
                        draft={d}
                        index={i}
                        count={steps.length}
                        chain={chain}
                        analysis={analysis.steps[i]}
                        open={openId === d.id}
                        onToggle={() => setOpenId(openId === d.id ? null : d.id)}
                        onChange={(o) => update(d.id, o)}
                        onRemove={() => setSteps(steps.filter((x) => x.id !== d.id))}
                        onMove={(by) => move(i, by)}
                        onDuplicate={() => duplicate(i)}
                        onFix={fix}
                        dragTool={dragTool}
                        onDropTool={(tool) => insert(tool, i)}
                        pickerOpen={pickerAt === i}
                        onPicker={() => setPickerAt(pickerAt === i ? null : i)}
                        onPick={(tool) => insert(tool, i)}
                        prev={i > 0 ? analysis.steps[i - 1] : undefined}
                      />
                    ))}
                  </AnimatePresence>
                </Reorder.Group>
                <motion.div layout>
                  <Connector
                    slot={steps.length}
                    chain={chain}
                    flow={analysis.output ? flowLabel(analysis.output.kind, analysis.output.count, tr) : undefined}
                    broken={false}
                    dragTool={dragTool}
                    onDropTool={(tool) => insert(tool, steps.length)}
                    pickerOpen={pickerAt === steps.length}
                    onPicker={() => setPickerAt(pickerAt === steps.length ? null : steps.length)}
                    onPick={(tool) => insert(tool, steps.length)}
                  />
                  <OutputNode analysis={analysis} />
                </motion.div>
              </LayoutGroup>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <motion.button
                type="button"
                onClick={save}
                disabled={!canSave}
                whileTap={canSave ? { scale: 0.97 } : undefined}
                className="h-10 rounded-[11px] bg-accent px-5 text-sm font-semibold text-on-tint disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
              >
                {initial.mode === "edit" ? t("Save changes") : t("Save recipe")}
              </motion.button>
              <Link to="/recipes" className="text-sm text-muted hover:text-text">{t("Cancel")}</Link>
              {!canSave && steps.length > 0 && (
                <span className="text-[12.5px] text-danger">
                  {t("Fix the {{count}} problems marked in red to save.", { count: analysis.errors })}
                </span>
              )}
            </div>
          </section>
        </div>
      </div>
    </MotionConfig>
  );
}

// ---------------------------------------------------------------------------

function StatusPill({ analysis, empty }: { analysis: ChainAnalysis; empty: boolean }) {
  const state = empty ? "empty" : analysis.errors > 0 ? "error" : analysis.warnings > 0 ? "warning" : "ok";
  const text =
    state === "empty"
      ? tr("No steps yet")
      : state === "error"
        ? tr("{{count}} problems to fix", { count: analysis.errors })
        : state === "warning"
          ? tr("Works · {{count}} things to check", { count: analysis.warnings })
          : tr("Ready · {{count}} steps", { count: analysis.steps.length });
  const tone =
    state === "error"
      ? "border-danger/40 bg-danger-soft text-danger"
      : state === "warning"
        ? "border-warn/40 bg-warn-soft text-warn"
        : state === "ok"
          ? "border-ok/40 bg-ok-soft text-ok"
          : "border-border bg-surface text-muted";
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={text}
        role="status"
        initial={{ opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.96 }}
        transition={{ duration: 0.2, ease }}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11.5px] font-bold ${tone}`}
      >
        {state === "ok" && (
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
            <motion.path
              d="M3.5 8.5l3 3 6-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, ease }}
            />
          </svg>
        )}
        {(state === "error" || state === "warning") && <IssueIcon level={state} />}
        {text}
      </motion.span>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Palette

const GROUP_ORDER = ["pdf", "convert", "image", "security"] as const;

function ToolPalette({
  chain,
  analysis,
  onAdd,
  onDragTool,
  flash,
}: {
  chain: RecipeStep[];
  analysis: ChainAnalysis;
  onAdd: (tool: string) => void;
  onDragTool: (tool: string | null) => void;
  flash: { tool: string; reason: string } | null;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // On wide screens there's room to show what doesn't fit (and why); on phones it starts folded away.
  const [wide] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches);
  const matches = (slug: string) => {
    if (!q) return true;
    const tool = getTool(slug);
    return `${label(slug)} ${tr(tool?.description ?? "")} ${tr(RECIPE_TOOLS[slug]?.blurb ?? "")}`.toLowerCase().includes(q);
  };
  const shortReason = (slug: string): string => {
    const spec = RECIPE_TOOLS[slug];
    if (chain.length >= MAX_STEPS) return tr("Recipe is full");
    if (analysis.output && spec.in !== analysis.output.kind) return tr("Needs {{kind}}", { kind: spec.in === "pdf" ? tr("a PDF") : kindLabel(spec.in, true, tr) });
    return tr("Doesn't fit at the end");
  };

  return (
    <aside aria-label={t("Tools")} className="rounded-2xl border border-border bg-surface lg:sticky lg:top-[82px]">
      <div className="border-b border-border p-3.5">
        <div className="text-[12.5px] font-semibold">{t("Tools")}</div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
          {t("Tap to add at the end, or drag into any gap in the chain. Each tool says why when it can't go somewhere.")}
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Find a tool")}
          aria-label={t("Find a tool")}
          className="mt-2.5 h-8 w-full rounded-lg border border-border bg-surface-2 px-2.5 text-[12.5px] outline-none focus:border-accent"
        />
      </div>
      <div className="max-h-none overflow-y-auto p-2 lg:max-h-[calc(100vh-240px)]">
        {(() => {
          const all = Object.keys(RECIPE_TOOLS).filter(matches);
          const fits = new Map(all.map((slug) => [slug, canInsert(chain, chain.length, slug, label, defaultsOf, tr)]));
          const item = (slug: string) => {
            const fit = fits.get(slug)!;
            return (
              <PaletteItem
                key={slug}
                slug={slug}
                ok={fit.ok}
                reason={fit.ok ? undefined : fit.reason}
                short={fit.ok ? undefined : shortReason(slug)}
                flashing={flash?.tool === slug}
                onAdd={() => onAdd(slug)}
                onDragTool={onDragTool}
              />
            );
          };
          const groups = (slugs: string[]) =>
            GROUP_ORDER.map((g) => {
              const inGroup = slugs.filter((s) => RECIPE_TOOLS[s].group === g);
              if (inGroup.length === 0) return null;
              return (
                <div key={g} className="mb-2">
                  <div className="px-1.5 pb-1 pt-2 font-mono text-[10px] font-bold tracking-[0.13em] text-faint">{tr(GROUP_LABEL[g]).toUpperCase()}</div>
                  <div className="flex flex-col gap-1">{inGroup.map(item)}</div>
                </div>
              );
            });
          // An empty chain: everything fits, so show the plain catalogue.
          if (chain.length === 0) return groups(all);
          const ok = all.filter((s) => fits.get(s)!.ok);
          const no = all.filter((s) => !fits.get(s)!.ok);
          return (
            <>
              <div className="px-1.5 pb-1 pt-2 font-mono text-[10px] font-bold tracking-[0.13em] text-ok">
                {t("FITS AFTER STEP {{step}} · {{count}}", { step: chain.length, count: ok.length })}
              </div>
              {ok.length === 0 ? (
                <p className="px-1.5 pb-2 text-[12px] text-muted">{t("Nothing can follow the last step.")}</p>
              ) : (
                <div className="mb-2 flex flex-col gap-1">{ok.map(item)}</div>
              )}
              {no.length > 0 && (
                <details className="group/no border-t border-border pt-1" open={wide}>
                  <summary className="cursor-pointer list-none px-1.5 py-1.5 font-mono text-[10px] font-bold tracking-[0.13em] text-faint">
                    <span className="inline-block transition-transform group-open/no:rotate-90">›</span>{" "}{t("DOESN'T FIT THERE · {{count}}", { count: no.length })}
                  </summary>
                  {groups(no)}
                </details>
              )}
            </>
          );
        })()}
        {Object.keys(UNAVAILABLE_TOOLS).some(matches) && (
          <details className="group mt-1 px-1.5 pb-1.5">
            <summary className="cursor-pointer list-none py-1.5 font-mono text-[10px] font-bold tracking-[0.13em] text-faint">
              <span className="inline-block transition-transform group-open:rotate-90">›</span>{" "}{t("NOT AVAILABLE IN RECIPES")}
            </summary>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {Object.entries(UNAVAILABLE_TOOLS)
                .filter(([s]) => matches(s) && getTool(s))
                .map(([slug, why]) => (
                  <li key={slug} className="flex items-start gap-2 rounded-lg px-1.5 py-1 opacity-70">
                    <span className="grayscale">
                      <StepIcon tool={slug} size={24} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px]">{label(slug)}</span>
                      <span className="block text-[11px] leading-snug text-muted">{tr(why)}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>
    </aside>
  );
}

function PaletteItem({
  slug,
  ok,
  reason,
  short,
  flashing,
  onAdd,
  onDragTool,
}: {
  slug: string;
  ok: boolean;
  reason?: string;
  short?: string;
  flashing: boolean;
  onAdd: () => void;
  onDragTool: (tool: string | null) => void;
}) {
  const { t } = useTranslation();
  const [scope, animate] = useAnimate<HTMLButtonElement>();
  useEffect(() => {
    if (flashing && scope.current) animate(scope.current, { x: [0, -5, 5, -3, 3, 0] }, { duration: 0.35 });
  }, [flashing, animate, scope]);

  return (
    <div>
      <button
        ref={scope}
        type="button"
        draggable
        onDragStart={(e: DragEvent<HTMLButtonElement>) => {
          e.dataTransfer.setData(DRAG_TYPE, slug);
          e.dataTransfer.setData("text/plain", label(slug));
          e.dataTransfer.effectAllowed = "copy";
          onDragTool(slug);
        }}
        onDragEnd={() => onDragTool(null)}
        onClick={onAdd}
        aria-label={t("Add {{label}}", { label: label(slug) })}
        aria-description={reason}
        title={reason}
        className={`group flex w-full items-center gap-2.5 rounded-[10px] border px-2 py-1.5 text-left transition-[border-color,background-color,opacity,transform] duration-150 ${
          ok
            ? "cursor-grab border-transparent hover:-translate-y-px hover:border-border hover:bg-surface-2 active:cursor-grabbing"
            : "border-transparent opacity-55 hover:opacity-80"
        }`}
      >
        <span className={ok ? "" : "grayscale"}>
          <StepIcon tool={slug} size={28} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{label(slug)}</span>
          <span className={`block truncate text-[11px] ${ok ? "text-muted" : "text-danger"}`}>{ok ? tr(RECIPE_TOOLS[slug].blurb) : short}</span>
        </span>
        {ok ? (
          <span className="grid size-5 place-items-center rounded-full bg-surface-2 text-[13px] text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden>
            +
          </span>
        ) : (
          <svg viewBox="0 0 16 16" className="size-3.5 flex-none text-faint" aria-hidden>
            <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        )}
      </button>
      <AnimatePresence>
        {flashing && reason && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-2 text-[11.5px] leading-snug text-danger"
          >
            <span className="block pb-1.5 pt-0.5">{reason}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The chain

function InputNode({ chain, analysis }: { chain: RecipeStep[]; analysis: ChainAnalysis }) {
  const { t } = useTranslation();
  const first = chain[0] ? getTool(chain[0].tool) : undefined;
  const accept = first?.accept.filter((a) => a !== ".jpeg").map((a) => a.slice(1).toUpperCase()) ?? [];
  const batch = first && !first.multiple;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border-hi bg-surface-2 px-4 py-3">
      <span className="grid size-8 flex-none place-items-center rounded-full bg-surface text-muted" aria-hidden>
        <svg viewBox="0 0 16 16" className="size-4">
          <path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold">{t("Your files")}</div>
        <div className="text-[12px] text-muted">
          {!first
            ? t("The first step decides what files the recipe takes.")
            : analysis.needsTwoFiles
              ? t("Two or more {{accept}} files, joined in the order you add them", { accept: accept.join(", ") })
              : batch
                ? t("One or more {{accept}} files. Each one goes through the recipe on its own.", { accept: accept.join(", ") })
                : t("One or more {{accept}} files", { accept: accept.join(", ") })}
        </div>
      </div>
    </div>
  );
}

function OutputNode({ analysis }: { analysis: ChainAnalysis }) {
  const { t } = useTranslation();
  const ok = analysis.errors === 0;
  return (
    <motion.div
      layout
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors duration-200 ${
        ok ? "border-ok/40 bg-ok-soft" : "border-danger/40 bg-danger-soft"
      }`}
    >
      <span className={`grid size-8 flex-none place-items-center rounded-full bg-surface ${ok ? "text-ok" : "text-danger"}`} aria-hidden>
        {ok ? (
          <svg viewBox="0 0 16 16" className="size-4">
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <IssueIcon level="error" />
        )}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold">{ok ? t("You get") : t("Can't finish yet")}</div>
        <div className="text-[12px] text-muted">
          {ok ? describeOutput(analysis.output, tr) : t("Fix the steps marked in red and the result shows up here.")}
        </div>
      </div>
    </motion.div>
  );
}

function EmptyChain({
  dragTool,
  onDropTool,
  onTemplate,
}: {
  dragTool: string | null;
  onDropTool: (tool: string) => void;
  onTemplate: (r: (typeof RECIPES)[number]) => void;
}) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const templates = RECIPES.filter((r) => r.popular && r.status === "live").slice(0, 6);
  return (
    <>
      <Wire state="idle" />
      <div
        onDragOver={(e) => {
          if (!dragTool) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const tool = e.dataTransfer.getData(DRAG_TYPE) || dragTool;
          if (tool) onDropTool(tool);
        }}
        className={`rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-[border-color,background-color,transform] duration-150 ${
          over ? "scale-[1.01] border-ok bg-ok-soft" : dragTool ? "border-accent bg-accent-soft" : "border-border bg-surface"
        }`}
      >
        <div className="text-[14px] font-semibold">{dragTool ? t("Drop {{label}} here", { label: label(dragTool) }) : t("Add your first step")}</div>
        <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] text-muted">
          {t("Pick a tool on the left, or start from a ready-made recipe and change it to suit you.")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {templates.map((r) => (
            <button
              key={r.slug}
              type="button"
              onClick={() => onTemplate(r)}
              className="flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1 pl-1.5 pr-3 text-[12.5px] transition-[transform,border-color] duration-150 hover:-translate-y-px hover:border-accent active:scale-[0.97]"
            >
              <ChainStrip steps={r.steps} size={20} />
              {tr(r.title)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** The vertical wire between two nodes. */
function Wire({ state, height = 28 }: { state: "ok" | "error" | "idle"; height?: number }) {
  const color = state === "error" ? "var(--danger)" : state === "ok" ? "var(--accent)" : "var(--border-hi)";
  return (
    <svg width="14" height={height} viewBox={`0 0 14 ${height}`} className="mx-auto block" aria-hidden>
      {state === "error" ? (
        <>
          <path d={`M7 0v${height / 2 - 5}M7 ${height / 2 + 5}v${height / 2 - 5}`} stroke={color} strokeWidth="2" strokeLinecap="round" />
          <path d={`M3.5 ${height / 2 - 3.5}l7 7M10.5 ${height / 2 - 3.5}l-7 7`} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : (
        <path d={`M7 0v${height}`} stroke={color} strokeWidth="2" strokeLinecap="round" className={state === "ok" ? "recipe-flow" : undefined} />
      )}
    </svg>
  );
}

function Connector({
  slot,
  chain,
  flow,
  broken,
  dragTool,
  onDropTool,
  pickerOpen,
  onPicker,
  onPick,
}: {
  slot: number;
  chain: RecipeStep[];
  flow?: string;
  broken: boolean;
  dragTool: string | null;
  onDropTool: (tool: string) => void;
  pickerOpen: boolean;
  onPicker: () => void;
  onPick: (tool: string) => void;
}) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const fit = dragTool ? canInsert(chain, slot, dragTool, label, defaultsOf, tr) : null;
  const where = slot === 0 ? tr("at the start") : slot >= chain.length ? tr("at the end") : `before step ${slot + 1}`;

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        if (!dragTool) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = fit?.ok ? "copy" : "none";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const tool = e.dataTransfer.getData(DRAG_TYPE) || dragTool;
        if (tool && fit?.ok) onDropTool(tool);
      }}
    >
      <AnimatePresence initial={false} mode="wait">
        {dragTool && fit ? (
          <motion.div
            key="drop"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease }}
            className="overflow-hidden"
          >
            <div className="py-2">
              <div
                className={`rounded-xl border-2 border-dashed px-3 py-2 text-center text-[12px] transition-[transform,background-color] duration-150 ${
                  fit.ok
                    ? `border-ok text-ok ${over ? "scale-[1.02] bg-ok-soft" : "bg-surface"}`
                    : `border-danger/60 text-danger ${over ? "bg-danger-soft" : "bg-surface"}`
                }`}
              >
                {fit.ok ? t("Drop to add {{where}}", { where }) : t("Can't go {{where}}: {{reason}}", { where, reason: fit.reason })}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="wire" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative flex items-center justify-center">
            <Wire state={broken ? "error" : flow ? "ok" : "idle"} height={44} />
            <div className="absolute left-1/2 top-1/2 flex -translate-y-1/2 translate-x-3 items-center gap-1.5">
              {flow && (
                <span
                  className={`whitespace-nowrap rounded-full border px-2 py-px font-mono text-[10.5px] ${
                    broken ? "border-danger/50 bg-danger-soft text-danger" : "border-border bg-surface text-muted"
                  }`}
                >
                  {flow}
                </span>
              )}
              {chain.length < MAX_STEPS && (
                <button
                  type="button"
                  onClick={onPicker}
                  aria-label={t("Insert a step {{where}}", { where })}
                  aria-expanded={pickerOpen}
                  className={`grid size-6 place-items-center rounded-full border text-[14px] leading-none transition-[transform,background-color,border-color] duration-150 hover:scale-110 active:scale-95 ${
                    pickerOpen ? "rotate-45 border-accent bg-accent text-on-tint" : "border-border bg-surface text-muted hover:border-accent hover:text-text"
                  }`}
                >
                  +
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            transition={{ duration: 0.2, ease }}
            className="overflow-hidden"
          >
            <InsertPicker chain={chain} slot={slot} onPick={onPick} where={where} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InsertPicker({ chain, slot, onPick, where }: { chain: RecipeStep[]; slot: number; onPick: (tool: string) => void; where: string }) {
  const { t } = useTranslation();
  const all = Object.keys(RECIPE_TOOLS).map((slug) => ({ slug, fit: canInsert(chain, slot, slug, label, defaultsOf, tr) }));
  const fits = all.filter((x) => x.fit.ok);
  const rest = all.filter((x) => !x.fit.ok);
  return (
    <div className="mb-2 rounded-2xl border border-accent/50 bg-surface p-3 shadow-[var(--shadow-card)]">
      <div className="text-[12px] font-semibold">{t("Add a step {{where}}", { where })}</div>
      {fits.length === 0 ? (
        <p className="mt-1 text-[12px] text-muted">{t("No tool fits here.")}</p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {fits.map(({ slug }, i) => (
            <motion.button
              key={slug}
              type="button"
              onClick={() => onPick(slug)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.015, duration: 0.18, ease }}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-left text-[12.5px] hover:border-accent"
            >
              <StepIcon tool={slug} size={22} />
              <span className="min-w-0 truncate">{label(slug)}</span>
            </motion.button>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <p className="mt-2 text-[11.5px] leading-snug text-faint">
          {t("Doesn't fit here: {{tools}}.", { tools: rest.map((x) => label(x.slug)).join(", ") })}
        </p>
      )}
    </div>
  );
}

function StepItem({
  draft,
  index,
  count,
  chain,
  analysis,
  prev,
  open,
  onToggle,
  onChange,
  onRemove,
  onMove,
  onDuplicate,
  onFix,
  dragTool,
  onDropTool,
  pickerOpen,
  onPicker,
  onPick,
}: {
  draft: Draft;
  index: number;
  count: number;
  chain: RecipeStep[];
  analysis: StepAnalysis;
  prev?: StepAnalysis;
  open: boolean;
  onToggle: () => void;
  onChange: (o: Record<string, unknown>) => void;
  onRemove: () => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onFix: (f: Fix) => void;
  dragTool: string | null;
  onDropTool: (tool: string) => void;
  pickerOpen: boolean;
  onPicker: () => void;
  onPick: (tool: string) => void;
}) {
  const { t } = useTranslation();
  const tool = getTool(draft.tool);
  const controls = useDragControls();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const errors = analysis.issues.filter((x) => x.level === "error");
  const warnings = analysis.issues.filter((x) => x.level === "warning");
  const errorKey = errors.map((e) => e.message).join("|");
  const seen = useRef(errorKey);

  // A step that just broke gives a little shake, so the eye goes to it.
  useEffect(() => {
    if (errorKey && errorKey !== seen.current && scope.current) {
      animate(scope.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.4 });
    }
    seen.current = errorKey;
  }, [errorKey, animate, scope]);

  if (!tool) return null;
  const options = { ...tool.defaultOptions, ...draft.options };
  const broken = errors.some((e) => e.fix?.type === "insert" || /hands over|reaches Merge/.test(e.message));
  const flow = index === 0 ? undefined : prev ? flowLabel(prev.outKind, prev.outCount, tr) : undefined;
  const tone = errors.length > 0 ? "border-danger bg-danger-soft/40" : warnings.length > 0 ? "border-warn/60" : open ? "border-accent" : "border-border";

  return (
    <Reorder.Item
      value={draft}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, scale: 0.96, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 500, damping: 38 }}
      className="relative list-none"
    >
      <Connector
        slot={index}
        chain={chain}
        flow={flow}
        broken={broken}
        dragTool={dragTool}
        onDropTool={onDropTool}
        pickerOpen={pickerOpen}
        onPicker={onPicker}
        onPick={onPick}
      />
      <div ref={scope} className={`rounded-2xl border bg-surface transition-[border-color,box-shadow,background-color] duration-200 ${tone} ${open ? "shadow-[var(--shadow-card)]" : ""}`}>
        <div className="flex items-center gap-2.5 p-3">
          <button
            type="button"
            onPointerDown={(e) => controls.start(e)}
            aria-label={t("Drag {{name}} to reorder", { name: tool.name })}
            className="hidden cursor-grab touch-none px-0.5 text-faint hover:text-text active:cursor-grabbing sm:block"
          >
            <svg viewBox="0 0 10 16" className="h-4 w-2.5" aria-hidden>
              {[3, 8, 13].map((y) => (
                <g key={y} fill="currentColor">
                  <circle cx="2.5" cy={y} r="1.2" />
                  <circle cx="7.5" cy={y} r="1.2" />
                </g>
              ))}
            </svg>
          </button>
          <span className="grid size-5 flex-none place-items-center rounded-full bg-surface-2 font-mono text-[10.5px] text-muted">{index + 1}</span>
          <StepIcon tool={draft.tool} size={32} />
          <button type="button" onClick={onToggle} aria-expanded={open} aria-label={t("Settings for {{name}}", { name: tool.name })} className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-semibold">{tr(tool.name)}</span>
              {errors.length > 0 && (
                <span className="text-danger">
                  <IssueIcon level="error" />
                </span>
              )}
              {errors.length === 0 && warnings.length > 0 && (
                <span className="text-warn">
                  <IssueIcon level="warning" />
                </span>
              )}
            </span>
            <span className="block truncate text-[12px] text-muted">{stepSummary(draft, tool.defaultOptions)}</span>
          </button>
          <div className="flex flex-none items-center">
            <button
              type="button"
              onClick={onToggle}
              aria-hidden
              tabIndex={-1}
              className={`hidden size-7 place-items-center rounded-lg text-muted transition-[transform,color] duration-200 hover:text-text sm:grid ${open ? "rotate-180" : ""}`}
            >
              <svg viewBox="0 0 16 16" className="size-3.5">
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <IconButton label={t("Move {{name}} up", { name: tool.name })} disabled={index === 0} onClick={() => onMove(-1)}>↑</IconButton>
            <IconButton label={t("Move {{name}} down", { name: tool.name })} disabled={index === count - 1} onClick={() => onMove(1)}>↓</IconButton>
            <IconButton label={t("Duplicate {{name}}", { name: tool.name })} disabled={count >= MAX_STEPS} onClick={onDuplicate} className="hidden sm:grid">
              <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </IconButton>
            <IconButton label={t("Remove {{name}}", { name: tool.name })} danger onClick={onRemove}>✕</IconButton>
          </div>
        </div>

        {(analysis.issues.length > 0 || analysis.needs) && (
          <div className="px-3 pb-3 -mt-1">
            <IssueList issues={analysis.issues} needs={analysis.needs} onFix={onFix} />
          </div>
        )}

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease }}
              className="overflow-hidden"
            >
              <div className="border-t border-border bg-surface-2/50 p-4">
                <div className="mb-3 font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">{t("SETTINGS")}</div>
                {draft.tool === "protect" && (
                  <p className="mb-3 rounded-lg border border-border bg-surface px-3 py-2 text-[12px] text-muted">
                    {t("Passwords are never saved with the recipe. You type it each time you run it.")}
                  </p>
                )}
                <tool.OptionsPanel options={options} onChange={onChange} disabled={false} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reorder.Item>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  className = "grid",
  children,
}: {
  className?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`${className} size-7 place-items-center rounded-lg text-[13px] text-muted transition-[background-color,color,transform] duration-100 hover:bg-surface-2 active:scale-90 disabled:pointer-events-none disabled:opacity-30 ${
        danger ? "hover:text-danger" : "hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
