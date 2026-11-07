/**
 * Custom recipes: user-built chains, saved on this machine (localStorage).
 *
 * A custom recipe is the same ordered list of tool ids a built-in recipe is,
 * so it runs through the same `runRecipe()`. This module holds the rules for
 * which tools may be chained and in what order, plus persistence. Mirrors the
 * web app's recipes/customRecipes.ts.
 *
 * Deliberately free of runtime imports (type-only below) so
 * scripts/check-custom-recipes.ts can load it under plain Node, the same way
 * check-recipe-steps.ts loads recipes.ts.
 */
import type { Recipe } from "./recipes";

/** What a step consumes / produces; a chain is valid when each `out` is the next `in`. */
type Kind = "pdf" | "images" | "sheet";

/**
 * Tools a recipe may use: those that run end-to-end on their own defaults with
 * only the input files. Sign, Redact and Organize need canvas interaction;
 * Watermark and Protect need a required field; Split's default range is empty.
 * PDF to Excel produces a spreadsheet no other tool accepts, so it can only
 * end a chain.
 */
export const BUILDER_TOOLS: Record<string, { in: Kind; out: Kind }> = {
  merge: { in: "pdf", out: "pdf" },
  compress: { in: "pdf", out: "pdf" },
  ocr: { in: "pdf", out: "pdf" },
  "pdf-to-excel": { in: "pdf", out: "sheet" },
  "pdf-to-image": { in: "pdf", out: "images" },
  "image-to-pdf": { in: "images", out: "pdf" },
  "convert-image": { in: "images", out: "images" },
};

export const MIN_STEPS = 2;
export const MAX_STEPS = 8;

// A4 + 8 mm margin pages -- identical to the built-in recipes' override in recipes.ts.
const A4_PAGES = { "image-to-pdf": { page_size: "a4", margin_mm: 8 } };

const STORAGE_KEY = "iloathepdf.customRecipes";
const CHANGE_EVENT = "iloathepdf:customrecipes";
const ID_PREFIX = "custom-";

export function isBuilderTool(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILDER_TOOLS, id);
}

/** Tools that may be appended to `steps`. Merge only ever opens a chain: later steps take a single file. */
export function allowedNext(steps: string[]): string[] {
  const all = Object.keys(BUILDER_TOOLS);
  if (steps.length === 0) return all;
  if (steps.length >= MAX_STEPS) return [];
  const last = BUILDER_TOOLS[steps[steps.length - 1]];
  if (!last) return [];
  return all.filter((id) => id !== "merge" && BUILDER_TOOLS[id].in === last.out);
}

const KIND_LABEL: Record<Kind, string> = { pdf: "a PDF", images: "images", sheet: "a spreadsheet" };

/** A user-facing problem with the chain, or null when it is runnable. */
export function validateSteps(steps: string[], label: (id: string) => string): string | null {
  if (steps.length < MIN_STEPS) return `Add at least ${MIN_STEPS} steps — a single step is just a tool.`;
  if (steps.length > MAX_STEPS) return `A recipe can have at most ${MAX_STEPS} steps.`;
  for (let i = 0; i < steps.length; i++) {
    if (!isBuilderTool(steps[i])) return `${label(steps[i])} can't be used in a recipe.`;
    if (steps[i] === "merge" && i > 0) return "Merge PDF can only be the first step.";
    if (i > 0) {
      const prev = BUILDER_TOOLS[steps[i - 1]];
      const cur = BUILDER_TOOLS[steps[i]];
      if (prev.out !== cur.in) {
        return `Step ${i} (${label(steps[i - 1])}) produces ${KIND_LABEL[prev.out]}, but step ${i + 1} (${label(steps[i])}) needs ${KIND_LABEL[cur.in]}.`;
      }
    }
  }
  return null;
}

export function defaultTitle(steps: string[], label: (id: string) => string): string {
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
    /* storage unavailable: the recipe lasts this session only */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function toRecipe(s: Stored): Recipe {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    steps: s.steps,
    stepOptions: s.steps.includes("image-to-pdf") ? A4_PAGES : undefined,
    custom: true,
  };
}

/** Saved recipes still runnable today (a tool dropped from the builder later hides its recipes rather than crashing). */
export function loadCustomRecipes(): Recipe[] {
  return readStored()
    .filter((s) => s.steps.length >= MIN_STEPS && s.steps.every(isBuilderTool))
    .map(toRecipe);
}

export function saveCustomRecipe(input: {
  id?: string;
  title: string;
  description: string;
  steps: string[];
}): Recipe {
  const list = readStored();
  const id = input.id ?? `${ID_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const entry: Stored = { id, title: input.title.trim(), description: input.description, steps: input.steps };
  const at = list.findIndex((r) => r.id === id);
  if (at === -1) list.push(entry);
  else list[at] = entry;
  writeStored(list);
  return toRecipe(entry);
}

export function deleteCustomRecipe(id: string): void {
  writeStored(readStored().filter((r) => r.id !== id));
}

/** Subscribe to changes made in this window or another; returns an unsubscribe. */
export function subscribeCustomRecipes(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
