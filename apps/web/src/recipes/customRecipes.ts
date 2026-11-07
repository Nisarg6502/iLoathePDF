/**
 * Custom recipes: user-built chains, saved in this browser only.
 *
 * Nothing here is a new engine -- a custom recipe is the same ordered list of
 * tool slugs a built-in recipe is, so it runs through the exact same
 * `runRecipe()`. What this module adds is (1) the rules for which tools may be
 * chained and in what order, and (2) localStorage persistence.
 *
 * Kept free of any value import from ./registry (type-only) so registry.tsx
 * can import this file without a cycle.
 */
import type { RecipeConfig } from "./registry";

/** What a step consumes / produces. A chain is valid when each step's `out`
 *  is the next step's `in`. */
type Kind = "pdf" | "images";

/**
 * The tools a recipe may use: those that run end-to-end on their own defaults
 * with just the input files (see the original recipes spec). Sign, Redact and
 * Organize need canvas interaction; Watermark and Protect need a required
 * field; Split's default range is empty. PDF to Excel has no web engine.
 */
export const BUILDER_TOOLS: Record<string, { in: Kind; out: Kind }> = {
  merge: { in: "pdf", out: "pdf" },
  compress: { in: "pdf", out: "pdf" },
  ocr: { in: "pdf", out: "pdf" },
  "pdf-to-images": { in: "pdf", out: "images" },
  "images-to-pdf": { in: "images", out: "pdf" },
  "convert-images": { in: "images", out: "images" },
};

export const MIN_STEPS = 2;
export const MAX_STEPS = 8;

/** The A4 + ~8 mm margin layout Images to PDF uses inside a recipe. */
export const A4_PAGES = { "images-to-pdf": { page_size: "a4", margin_mm: 8 } };

const STORAGE_KEY = "iloathepdf.customRecipes";
const CHANGE_EVENT = "iloathepdf:customrecipes";
const ID_PREFIX = "custom-";

export function isBuilderTool(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILDER_TOOLS, slug);
}

/**
 * Tools that may be appended to `steps`. Merge only ever opens a chain: the
 * steps after the first take a single file, so merging mid-chain would be a
 * no-op that only looks meaningful.
 */
export function allowedNext(steps: string[]): string[] {
  const all = Object.keys(BUILDER_TOOLS);
  if (steps.length === 0) return all;
  if (steps.length >= MAX_STEPS) return [];
  const last = BUILDER_TOOLS[steps[steps.length - 1]];
  if (!last) return [];
  return all.filter((slug) => slug !== "merge" && BUILDER_TOOLS[slug].in === last.out);
}

/** Returns a user-facing problem with the chain, or null when it is runnable. */
export function validateSteps(steps: string[], label: (slug: string) => string): string | null {
  if (steps.length < MIN_STEPS) return `Add at least ${MIN_STEPS} steps — a single step is just a tool.`;
  if (steps.length > MAX_STEPS) return `A recipe can have at most ${MAX_STEPS} steps.`;
  for (let i = 0; i < steps.length; i++) {
    if (!isBuilderTool(steps[i])) return `${label(steps[i])} can't be used in a recipe.`;
    if (steps[i] === "merge" && i > 0) return "Merge PDF can only be the first step.";
    if (i > 0) {
      const prev = BUILDER_TOOLS[steps[i - 1]];
      const cur = BUILDER_TOOLS[steps[i]];
      if (prev.out !== cur.in) {
        const have = prev.out === "pdf" ? "a PDF" : "images";
        const need = cur.in === "pdf" ? "a PDF" : "images";
        return `Step ${i} (${label(steps[i - 1])}) produces ${have}, but step ${i + 1} (${label(steps[i])}) needs ${need}.`;
      }
    }
  }
  return null;
}

/**
 * Non-blocking advice. On web, Compress rebuilds the PDF from page images, so
 * any step before it that added a text layer (OCR) is undone.
 */
export function chainWarning(steps: string[]): string | null {
  const ocr = steps.indexOf("ocr");
  if (ocr !== -1 && steps.indexOf("compress", ocr) !== -1) {
    return "Compress rebuilds the PDF from images, which removes OCR's text layer. Put OCR last to keep the result searchable.";
  }
  return null;
}

export function defaultTitle(steps: string[], label: (slug: string) => string): string {
  return steps.map(label).join(" → ");
}

// ---------------------------------------------------------------------------
// Storage

interface Stored {
  id: string;
  title: string;
  description: string;
  steps: string[];
}

function readStored(): Stored[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is Stored =>
        !!r &&
        typeof r.id === "string" &&
        r.id.startsWith(ID_PREFIX) &&
        typeof r.title === "string" &&
        typeof r.description === "string" &&
        Array.isArray(r.steps) &&
        r.steps.every((s: unknown) => typeof s === "string"),
    );
  } catch {
    return [];
  }
}

function writeStored(list: Stored[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable (private window, quota): the recipe lasts this session only */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function toConfig(s: Stored): RecipeConfig {
  return {
    slug: s.id,
    title: s.title,
    description: s.description,
    steps: s.steps,
    stepOptions: s.steps.includes("images-to-pdf") ? A4_PAGES : undefined,
    status: "live",
    custom: true,
  };
}

/** Saved recipes still runnable today (a tool dropped from the builder later hides its recipes rather than crashing). */
export function loadCustomRecipes(): RecipeConfig[] {
  return readStored()
    .filter((s) => s.steps.length >= MIN_STEPS && s.steps.every(isBuilderTool))
    .map(toConfig);
}

export function getCustomRecipe(slug: string): RecipeConfig | undefined {
  return loadCustomRecipes().find((r) => r.slug === slug);
}

export function saveCustomRecipe(input: {
  id?: string;
  title: string;
  description: string;
  steps: string[];
}): RecipeConfig {
  const list = readStored();
  const id = input.id ?? `${ID_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const entry: Stored = { id, title: input.title.trim(), description: input.description, steps: input.steps };
  const at = list.findIndex((r) => r.id === id);
  if (at === -1) list.push(entry);
  else list[at] = entry;
  writeStored(list);
  return toConfig(entry);
}

export function deleteCustomRecipe(id: string): void {
  writeStored(readStored().filter((r) => r.id !== id));
}

/** Subscribe to changes made in this tab or another; returns an unsubscribe. */
export function subscribeCustomRecipes(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
