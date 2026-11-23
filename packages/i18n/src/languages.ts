/**
 * Every interface language the apps offer. Adding one is this entry plus a
 * locales/<code>.json file (and, for the Windows installer, its NSIS language
 * in apps/desktop/src-tauri/tauri.conf.json).
 *
 * Kept free of imports so plain Node scripts and the Tauri side can read it.
 */
export interface Language {
  /** BCP 47 code, also the locales/<code>.json file name. */
  code: string;
  /** Name in English, for docs and logs. */
  englishName: string;
  /** Name in the language itself. This is what the picker shows. */
  nativeName: string;
  dir: "ltr" | "rtl";
  /**
   * Windows primary language id (the low 10 bits of an LCID). The installer
   * records the language picked on its first screen as an LCID; this maps it
   * back to one of ours.
   */
  windowsLangId: number;
}

export const LANGUAGES = [
  { code: "en", englishName: "English", nativeName: "English", dir: "ltr", windowsLangId: 0x09 },
  { code: "es", englishName: "Spanish", nativeName: "Español", dir: "ltr", windowsLangId: 0x0a },
  { code: "fr", englishName: "French", nativeName: "Français", dir: "ltr", windowsLangId: 0x0c },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी", dir: "ltr", windowsLangId: 0x39 },
  { code: "mr", englishName: "Marathi", nativeName: "मराठी", dir: "ltr", windowsLangId: 0x4e },
  { code: "kn", englishName: "Kannada", nativeName: "ಕನ್ನಡ", dir: "ltr", windowsLangId: 0x4b },
] as const satisfies readonly Language[];

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** The language the source strings are written in. */
export const SOURCE_LANGUAGE: LanguageCode = "en";

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGES.some((l) => l.code === value);
}

export function getLanguage(code: LanguageCode): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/**
 * The first candidate we have a catalog for. "hi-IN" matches "hi"; anything
 * unknown, empty or malformed is skipped.
 */
export function matchLanguage(candidates: readonly (string | null | undefined)[]): LanguageCode | null {
  for (const raw of candidates) {
    if (!raw) continue;
    const tag = raw.trim().toLowerCase().replace(/_/g, "-");
    if (isLanguageCode(tag)) return tag;
    const base = tag.split("-")[0];
    if (isLanguageCode(base)) return base;
  }
  return null;
}

/** Windows LCID (e.g. 1081 for hi-IN) to one of our languages, if we have it. */
export function languageFromWindowsLcid(lcid: number | null | undefined): LanguageCode | null {
  if (typeof lcid !== "number" || !Number.isInteger(lcid) || lcid <= 0) return null;
  const primary = lcid & 0x3ff;
  return LANGUAGES.find((l) => l.windowsLangId === primary)?.code ?? null;
}
