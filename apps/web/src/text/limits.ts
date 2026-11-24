/**
 * Limit targets for the word counter: common platform limits and a custom
 * one, plus the arithmetic for "N left" / "N over". Pure functions, so the
 * panel and the tests share them. Only the chosen target is remembered,
 * never the text.
 */
import { msg } from "@iloathepdf/i18n";

export type LimitUnit = "characters" | "words";

export interface LimitPreset {
  id: string;
  label: string;
  max: number;
  unit: LimitUnit;
  /** A short caveat on how the platform really counts. */
  note: string;
}

const ESTIMATE = msg("Platforms count some characters, like links and emoji, differently, so treat this as a close estimate.");

export const LIMIT_PRESETS: readonly LimitPreset[] = [
  {
    id: "x",
    label: msg("X (Twitter) post"),
    max: 280,
    unit: "characters",
    note: msg("X counts every link as 23 characters and some emoji and CJK characters as 2, so treat this as a close estimate."),
  },
  {
    id: "sms",
    label: msg("SMS message"),
    max: 160,
    unit: "characters",
    note: msg("One SMS holds 160 plain characters; an emoji or some accented letters cut that to 70."),
  },
  {
    id: "title-tag",
    label: msg("Google title tag"),
    max: 60,
    unit: "characters",
    note: msg("Google trims titles and descriptions by pixel width, so these are guides, not hard cut-offs."),
  },
  {
    id: "meta-description",
    label: msg("Meta description"),
    max: 160,
    unit: "characters",
    note: msg("Google trims titles and descriptions by pixel width, so these are guides, not hard cut-offs."),
  },
  { id: "instagram", label: msg("Instagram caption"), max: 2200, unit: "characters", note: ESTIMATE },
  { id: "linkedin", label: msg("LinkedIn post"), max: 3000, unit: "characters", note: ESTIMATE },
  { id: "youtube-title", label: msg("YouTube title"), max: 100, unit: "characters", note: ESTIMATE },
];

/** What the user picked: nothing, a preset by id, or their own number. */
export type LimitChoice = null | { preset: string } | { custom: { max: number; unit: LimitUnit } };

export const LIMIT_STORAGE_KEY = "iloathepdf.wordCounter.limit";
export const DEFAULT_CUSTOM = { max: 500, unit: "words" } as const;
/** Upper bound for a custom limit, so a stray paste can't make a silly number. */
export const MAX_CUSTOM = 10_000_000;

export function findPreset(id: string): LimitPreset | undefined {
  return LIMIT_PRESETS.find((p) => p.id === id);
}

/** The target a choice resolves to, or null when there is none (or it is unusable). */
export function resolveLimit(choice: LimitChoice): { max: number; unit: LimitUnit } | null {
  if (!choice) return null;
  if ("preset" in choice) {
    const p = findPreset(choice.preset);
    return p ? { max: p.max, unit: p.unit } : null;
  }
  const { max, unit } = choice.custom;
  return isValidCustomMax(max) && (unit === "words" || unit === "characters") ? { max, unit } : null;
}

export function isValidCustomMax(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_CUSTOM;
}

/** Reads a typed custom limit: digits only (separators allowed), or null. */
export function parseCustomMax(input: string): number | null {
  const digits = input.replace(/[\s,._'’]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return isValidCustomMax(n) ? n : null;
}

export type LimitState = "ok" | "near" | "over";

export interface LimitProgress {
  count: number;
  max: number;
  /** How many are still free; 0 once at or past the limit. */
  remaining: number;
  /** How many past the limit; 0 until then. */
  over: number;
  /** count / max, clamped to 0..1 for drawing the bar. */
  fraction: number;
  /** "near" from 90% up to the limit itself, "over" past it. */
  state: LimitState;
}

export const NEAR_THRESHOLD = 0.9;

export function limitProgress(count: number, max: number): LimitProgress {
  const ratio = max > 0 ? count / max : 1;
  return {
    count,
    max,
    remaining: Math.max(0, max - count),
    over: Math.max(0, count - max),
    fraction: Math.min(1, Math.max(0, ratio)),
    state: count > max ? "over" : ratio >= NEAR_THRESHOLD ? "near" : "ok",
  };
}

/** Parses what was saved; anything unexpected means "no limit". */
export function parseStoredLimit(raw: string | null): LimitChoice {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    if ("preset" in v && typeof v.preset === "string") return findPreset(v.preset) ? { preset: v.preset } : null;
    if ("custom" in v && v.custom && typeof v.custom === "object") {
      const c = v.custom as { max?: unknown; unit?: unknown };
      if (typeof c.max === "number" && isValidCustomMax(c.max) && (c.unit === "words" || c.unit === "characters")) {
        return { custom: { max: c.max, unit: c.unit } };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function loadLimit(): LimitChoice {
  try {
    return parseStoredLimit(localStorage.getItem(LIMIT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveLimit(choice: LimitChoice): void {
  try {
    if (choice) localStorage.setItem(LIMIT_STORAGE_KEY, JSON.stringify(choice));
    else localStorage.removeItem(LIMIT_STORAGE_KEY);
  } catch {
    // Private window or blocked storage: the limit just won't be remembered.
  }
}
