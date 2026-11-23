/**
 * Interface translations for the web and desktop apps.
 *
 * Keys are the English text itself: components call t("Merge PDF"), and a
 * language that has no entry for a string falls back to showing that English.
 * Both apps share one catalog per language (locales/<code>.json), so a string
 * the two apps have in common is translated once.
 *
 * Only the chosen language is loaded. Each locales/<code>.json becomes its own
 * small chunk that is fetched from the app's own origin (the web site, or the
 * files bundled inside the desktop app) the first time that language is
 * picked. Nothing is requested from anywhere else.
 */
import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { getLanguage, isLanguageCode, matchLanguage, SOURCE_LANGUAGE, type LanguageCode } from "./languages";

export * from "./languages";
export { msg } from "./msg";
export { Trans, useTranslation } from "react-i18next";

type Catalog = Record<string, string>;

/**
 * English needs no catalog for ordinary strings (the key is the text), but
 * plural forms do: "{{count}} files" has to become "1 file". locales/en.json
 * holds just those, so it is small enough to ship with the main bundle.
 */
const english = import.meta.glob<Catalog>("../locales/en.json", { eager: true, import: "default" });
const loaders = import.meta.glob<Catalog>(["../locales/*.json", "!../locales/en.json"], { import: "default" });

const STORAGE_KEY = "iloathepdf.language";

export const i18n = i18next.createInstance();

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function save(code: LanguageCode): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* the choice lasts for this session only */
  }
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

async function ensureLoaded(code: LanguageCode): Promise<void> {
  if (code === SOURCE_LANGUAGE || i18n.hasResourceBundle(code, "translation")) return;
  const load = loaders[`../locales/${code}.json`];
  if (!load) throw new Error(`No catalog for language "${code}"`);
  i18n.addResourceBundle(code, "translation", await load());
}

function applyToDocument(code: LanguageCode): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = code;
  document.documentElement.dir = getLanguage(code).dir;
}

export interface InitOptions {
  /**
   * Where to start when the user has never picked a language, in order of
   * preference. The browser's own languages are tried after these. The
   * desktop app passes the language chosen in the installer here.
   */
  preferred?: readonly (string | null | undefined)[];
  /** Skip the saved choice and the browser's languages (used by tests). */
  language?: LanguageCode;
}

/**
 * Call once, before the first render, and wait for it: that way a Hindi user
 * never sees a flash of English while their catalog loads.
 */
export async function initI18n(options: InitOptions = {}): Promise<LanguageCode> {
  const language =
    options.language ??
    matchLanguage([readSaved(), ...(options.preferred ?? []), ...browserLanguages()]) ??
    SOURCE_LANGUAGE;

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      lng: SOURCE_LANGUAGE,
      fallbackLng: SOURCE_LANGUAGE,
      resources: { [SOURCE_LANGUAGE]: { translation: Object.values(english)[0] ?? {} } },
      // Natural-language keys contain "." and ":", which must not be read as
      // nesting or namespace separators.
      keySeparator: false,
      nsSeparator: false,
      // React escapes everything it renders already.
      interpolation: { escapeValue: false },
      // A half-finished catalog may hold "" for strings nobody translated yet.
      returnEmptyString: false,
      react: { useSuspense: false },
    });
  }

  try {
    await applyLanguage(language);
  } catch {
    // A catalog that fails to load (say, a stale cached page after a deploy)
    // must not leave the app blank. English always works.
    await applyLanguage(SOURCE_LANGUAGE);
    return SOURCE_LANGUAGE;
  }
  return language;
}

async function applyLanguage(code: LanguageCode): Promise<void> {
  await ensureLoaded(code);
  await i18n.changeLanguage(code);
  applyToDocument(code);
}

/**
 * Translates outside a component (helpers, data modules). Call it while
 * rendering, not at module load, so it follows language changes; inside a
 * component, prefer `t` from useTranslation(), which also re-renders.
 */
export function tr(text: string, vars?: Record<string, string | number>): string {
  return i18n.t(text, vars ?? {}) as string;
}

/** Switches every mounted component to `code` and remembers the choice. */
export async function setLanguage(code: LanguageCode): Promise<void> {
  await applyLanguage(code);
  save(code);
}

/** The current language, kept in step with changes made anywhere in the app. */
export function useLanguage(): { language: LanguageCode; setLanguage: typeof setLanguage } {
  const { i18n: instance } = useTranslation();
  const current = instance.resolvedLanguage ?? instance.language;
  return { language: isLanguageCode(current) ? current : SOURCE_LANGUAGE, setLanguage };
}
