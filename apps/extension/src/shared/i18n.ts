/**
 * Interface strings for the extension come from chrome.i18n
 * (public/_locales/<lang>/messages.json), which the browser picks by its own
 * UI language. That is also the only way to translate the manifest and the
 * right-click items, so the extension uses it everywhere rather than mixing in
 * packages/i18n. (The engines' own error messages still come from
 * packages/i18n; see initEngineStrings.)
 *
 * Outside an extension (unit tests) the English catalog is used directly.
 */
import english from "../../public/_locales/en/messages.json";

export type MessageKey = keyof typeof english;

function substitute(message: string, subs: string[]): string {
  return message.replace(/\$(\d)/g, (_, n: string) => subs[Number(n) - 1] ?? "");
}

export function t(key: MessageKey, ...subs: (string | number)[]): string {
  const strings = subs.map(String);
  try {
    if (typeof chrome !== "undefined" && chrome.i18n) {
      const message = chrome.i18n.getMessage(key, strings);
      if (message) return message;
    }
  } catch {
    /* fall back to English */
  }
  return substitute(english[key].message, strings);
}

/** The browser's UI language, as a BCP 47 tag ("en-US"). */
export function uiLanguage(): string {
  try {
    if (typeof chrome !== "undefined" && chrome.i18n) return chrome.i18n.getUILanguage();
  } catch {
    /* not in an extension */
  }
  return typeof navigator !== "undefined" ? navigator.language : "en";
}
