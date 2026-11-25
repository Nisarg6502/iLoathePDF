/**
 * The word counter's opt-in "Save text": keeps the text in this browser's
 * localStorage so it survives a refresh or a closed tab.
 *
 * Why localStorage and nothing else:
 *  - Not cookies. A cookie rides along with every request to the site, so the
 *    text would be sent to the server (and anything in between) on every page
 *    load. localStorage never leaves the device.
 *  - Not encrypted. The key would have to live in the same browser profile,
 *    so anyone who can read the text could read the key too; it would only
 *    look safer.
 *
 * What keeps the footprint small:
 *  - Off until the user presses Save, and turning it off deletes the copy.
 *  - Only the latest text is kept, never a history.
 *  - Forgotten automatically once it hasn't been opened for MAX_AGE_MS, so a
 *    draft left on a shared computer doesn't stay there for good.
 */

export const SAVED_TEXT_KEY = "iloathepdf.wordCounter.savedText";
/** How long a saved text survives without the word counter being opened. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored {
  v: 1;
  text: string;
  /** Last time it was written or opened, in ms since the epoch. */
  at: number;
}

export type SaveResult = "saved" | "too-big" | "blocked";

/** Reads what was stored; anything unexpected or expired means nothing saved. */
export function parseSavedText(raw: string | null, now: number): string | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as Partial<Stored>;
    if (data?.v !== 1 || typeof data.text !== "string" || typeof data.at !== "number") return null;
    if (now - data.at > MAX_AGE_MS || data.at > now + MAX_AGE_MS) return null;
    return data.text;
  } catch {
    return null;
  }
}

/**
 * The saved text, or null when saving is off. Opening it counts as use, so
 * the 7 days start again; an expired or unreadable copy is deleted.
 */
export function loadSavedText(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(SAVED_TEXT_KEY);
    const text = parseSavedText(raw, now);
    if (text === null) {
      if (raw !== null) localStorage.removeItem(SAVED_TEXT_KEY);
      return null;
    }
    writeSavedText(text, now);
    return text;
  } catch {
    return null;
  }
}

export function writeSavedText(text: string, now = Date.now()): SaveResult {
  let storage: Storage;
  try {
    storage = localStorage;
  } catch {
    return "blocked";
  }
  try {
    storage.setItem(SAVED_TEXT_KEY, JSON.stringify({ v: 1, text, at: now } satisfies Stored));
    return "saved";
  } catch (err) {
    // Don't leave an older copy behind that a refresh would bring back.
    try {
      storage.removeItem(SAVED_TEXT_KEY);
    } catch {
      // Nothing more to do.
    }
    return isQuotaError(err) ? "too-big" : "blocked";
  }
}

export function forgetSavedText(): void {
  try {
    localStorage.removeItem(SAVED_TEXT_KEY);
  } catch {
    // Storage blocked: there is nothing saved to forget.
  }
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" || err.code === 22);
}
