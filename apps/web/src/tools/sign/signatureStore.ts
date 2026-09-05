/**
 * Remembers the last few drawn/uploaded signatures and initials in
 * localStorage, so a returning user doesn't have to redraw every time.
 * Never leaves the browser -- consistent with the site's zero-upload promise.
 */

export type SavedKind = "signature" | "initials";

export interface SavedMark {
  id: string;
  imageDataUrl: string;
  savedAt: number;
}

const KEY_PREFIX = "iloathepdf:sign:";
const MAX_SAVED = 3;

function key(kind: SavedKind): string {
  return `${KEY_PREFIX}${kind}`;
}

export function loadSavedMarks(kind: SavedKind): SavedMark[] {
  try {
    const raw = localStorage.getItem(key(kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMark(kind: SavedKind, imageDataUrl: string): SavedMark[] {
  const existing = loadSavedMarks(kind).filter((m) => m.imageDataUrl !== imageDataUrl);
  const next = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, imageDataUrl, savedAt: Date.now() }, ...existing].slice(
    0,
    MAX_SAVED,
  );
  try {
    localStorage.setItem(key(kind), JSON.stringify(next));
  } catch {
    // Storage full or unavailable (private browsing) -- the mark still works
    // for this session, it just won't be remembered next time.
  }
  return next;
}

export function removeMark(kind: SavedKind, id: string): SavedMark[] {
  const next = loadSavedMarks(kind).filter((m) => m.id !== id);
  try {
    localStorage.setItem(key(kind), JSON.stringify(next));
  } catch {
    /* see saveMark */
  }
  return next;
}
