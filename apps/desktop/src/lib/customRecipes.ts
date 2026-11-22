/**
 * Custom recipes: user-built chains, saved on this machine (localStorage).
 * Mirrors the web app's recipes/customRecipes.ts.
 *
 * A custom recipe is the same list of steps a built-in recipe is, so it runs
 * through the same `runRecipe()`. The chaining rules live in ./chain.ts; this
 * module is persistence, plus share links.
 *
 */
import type { Recipe } from "./recipes";
import { isRecipeTool, sanitizeOptions, MIN_STEPS, MAX_STEPS, type RecipeStep, type Options } from "./chain";

const STORAGE_KEY = "iloathepdf.customRecipes";
const CHANGE_EVENT = "iloathepdf:customrecipes";
const ID_PREFIX = "custom-";

/** The A4 layout older saved recipes got implicitly for Images to PDF. */
const LEGACY_A4 = { page_size: "a4", margin_mm: 8 };

interface Stored {
  id: string;
  title: string;
  description: string;
  /** Older versions stored bare tool slugs. */
  steps: (string | RecipeStep)[];
}

function isOptions(v: unknown): v is Options {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeStep(s: unknown): RecipeStep | null {
  if (typeof s === "string") return s === "image-to-pdf" ? { tool: s, options: { ...LEGACY_A4 } } : { tool: s };
  if (s && typeof s === "object" && typeof (s as RecipeStep).tool === "string") {
    const opts = (s as RecipeStep).options;
    return { tool: (s as RecipeStep).tool, options: isOptions(opts) ? opts : undefined };
  }
  return null;
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
        r.steps.every((s: unknown) => normalizeStep(s) !== null),
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

function toConfig(s: Stored): Recipe {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    steps: s.steps.map(normalizeStep).filter((x): x is RecipeStep => x !== null),
    custom: true,
  };
}

/** Saved recipes still runnable today (a tool dropped from recipes later hides its recipes rather than crashing). */
export function loadCustomRecipes(): Recipe[] {
  return readStored()
    .map(toConfig)
    .filter((r) => r.steps.length >= MIN_STEPS && r.steps.every((s) => isRecipeTool(s.tool)));
}

export function getCustomRecipe(id: string): Recipe | undefined {
  return loadCustomRecipes().find((r) => r.id === id);
}

function cleanSteps(steps: RecipeStep[]): RecipeStep[] {
  return steps.map((s) => {
    const options = sanitizeOptions(s.tool, s.options);
    return options && Object.keys(options).length > 0 ? { tool: s.tool, options } : { tool: s.tool };
  });
}

export function saveCustomRecipe(input: {
  id?: string;
  title: string;
  description: string;
  steps: RecipeStep[];
}): Recipe {
  const list = readStored();
  const id = input.id ?? `${ID_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const entry: Stored = { id, title: input.title.trim(), description: input.description.trim(), steps: cleanSteps(input.steps) };
  const at = list.findIndex((r) => r.id === id);
  if (at === -1) list.push(entry);
  else list[at] = entry;
  writeStored(list);
  return toConfig(entry);
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

// ---------------------------------------------------------------------------
// Share links: the recipe travels in the URL fragment, so it never reaches a
// server. Passwords are stripped; images (watermark logos) are dropped too,
// since they would make the link enormous.

interface Shared {
  t: string;
  d: string;
  s: RecipeStep[];
}

function stripImages(options: Options | undefined): Options | undefined {
  if (!options) return options;
  const out: Options = {};
  for (const [k, v] of Object.entries(options)) {
    if (/ImageDataUrl$/.test(k)) continue;
    out[k] = isOptions(v) ? stripImages(v) : v;
  }
  return out;
}

export function encodeShare(recipe: { title: string; description: string; steps: RecipeStep[] }): string {
  const payload: Shared = {
    t: recipe.title,
    d: recipe.description,
    s: cleanSteps(recipe.steps).map((s) => (s.options ? { tool: s.tool, options: stripImages(s.options) } : s)),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShare(code: string): { title: string; description: string; steps: RecipeStep[] } | null {
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Shared>;
    if (!parsed || !Array.isArray(parsed.s)) return null;
    const steps = parsed.s.map(normalizeStep).filter((x): x is RecipeStep => x !== null && isRecipeTool(x.tool)).slice(0, MAX_STEPS);
    if (steps.length === 0) return null;
    return {
      title: typeof parsed.t === "string" ? parsed.t.slice(0, 60) : "",
      description: typeof parsed.d === "string" ? parsed.d.slice(0, 200) : "",
      steps,
    };
  } catch {
    return null;
  }
}
