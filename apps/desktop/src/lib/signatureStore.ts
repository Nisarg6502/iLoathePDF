/**
 * Remembers the last few drawn/uploaded signatures and initials, so a
 * returning user doesn't have to redraw every time. Uses localStorage --
 * the Tauri webview supports it the same as a browser, and it's already
 * how `settings.ts` persists the output directory. Nothing here leaves the
 * machine.
 */

export type SavedSignKind = "signature" | "initials";

export interface SavedSignMark {
  id: string;
  imageDataUrl: string;
  savedAt: number;
}

const KEY_PREFIX = "iloathepdf.sign.";
const MAX_SAVED = 3;

function key(kind: SavedSignKind): string {
  return `${KEY_PREFIX}${kind}`;
}

export function loadSavedMarks(kind: SavedSignKind): SavedSignMark[] {
  try {
    const raw = localStorage.getItem(key(kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMark(kind: SavedSignKind, imageDataUrl: string): SavedSignMark[] {
  const existing = loadSavedMarks(kind).filter((m) => m.imageDataUrl !== imageDataUrl);
  const next = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, imageDataUrl, savedAt: Date.now() }, ...existing].slice(
    0,
    MAX_SAVED,
  );
  try {
    localStorage.setItem(key(kind), JSON.stringify(next));
  } catch {
    // Storage full/unavailable -- the mark still works this session.
  }
  return next;
}

export function removeMark(kind: SavedSignKind, id: string): SavedSignMark[] {
  const next = loadSavedMarks(kind).filter((m) => m.id !== id);
  try {
    localStorage.setItem(key(kind), JSON.stringify(next));
  } catch {
    /* see saveMark */
  }
  return next;
}
