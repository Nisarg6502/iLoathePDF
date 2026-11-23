/**
 * Starts the interface translations (packages/i18n) for the desktop app.
 *
 * Every language ships inside the app; only the chosen one is loaded. The
 * first time the app runs, before the user has picked a language in Settings,
 * it uses the language picked on the installer's first screen, then the
 * Windows display language, then English.
 */
import { initI18n, languageFromWindowsLcid, type LanguageCode } from "@iloathepdf/i18n";
import { isTauri } from "./jobs";

async function installerLanguage(): Promise<LanguageCode | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return languageFromWindowsLcid(await invoke<number | null>("installer_language"));
  } catch {
    return null;
  }
}

export async function startI18n(): Promise<LanguageCode> {
  return initI18n({ preferred: [await installerLanguage()] });
}
