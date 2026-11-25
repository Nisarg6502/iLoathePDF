/**
 * The page list behind Organize pages, kept free of React and pdf.js so the
 * rules (what a drag or a "move to" does) can be tested on their own.
 */

export interface OrganizePage {
  /** 0-based index of the page in the original PDF. Also its id. */
  index: number;
  /** Extra clockwise turn on top of the page's own rotation: 0, 90, 180 or 270. */
  rotate: number;
  removed: boolean;
}

export function initialPages(count: number): OrganizePage[] {
  return Array.from({ length: count }, (_, index) => ({ index, rotate: 0, removed: false }));
}

/**
 * Moves the selected pages, keeping their relative order, so that they start
 * at slot `before` of the current list (0 = first, pages.length = after the
 * last). `before` counts slots in the list as it is now, selected pages
 * included, which is what a drop marker between two tiles points at.
 */
export function moveSelected(pages: readonly OrganizePage[], selected: ReadonlySet<number>, before: number): OrganizePage[] {
  if (selected.size === 0) return [...pages];
  const moving = pages.filter((p) => selected.has(p.index));
  const staying = pages.filter((p) => !selected.has(p.index));
  // Slots taken by selected pages above the drop point disappear when they
  // are lifted out, so the insertion point moves up by that many.
  const lifted = pages.slice(0, Math.max(0, Math.min(before, pages.length))).filter((p) => selected.has(p.index)).length;
  const at = Math.max(0, Math.min(staying.length, before - lifted));
  return [...staying.slice(0, at), ...moving, ...staying.slice(at)];
}

/** "Move to position N" (1-based): the selection ends up starting at position N. */
export function moveSelectedTo(pages: readonly OrganizePage[], selected: ReadonlySet<number>, position: number): OrganizePage[] {
  if (selected.size === 0) return [...pages];
  const moving = pages.filter((p) => selected.has(p.index));
  const staying = pages.filter((p) => !selected.has(p.index));
  const at = Math.max(0, Math.min(staying.length, Math.round(position) - 1));
  return [...staying.slice(0, at), ...moving, ...staying.slice(at)];
}

export function rotateSelected(pages: readonly OrganizePage[], selected: ReadonlySet<number>, by: 90 | -90): OrganizePage[] {
  return pages.map((p) => (selected.has(p.index) ? { ...p, rotate: (((p.rotate + by) % 360) + 360) % 360 } : p));
}

/** Removes the selection, or brings it back when every selected page is already removed. */
export function toggleRemoved(pages: readonly OrganizePage[], selected: ReadonlySet<number>): OrganizePage[] {
  const chosen = pages.filter((p) => selected.has(p.index));
  const restore = chosen.length > 0 && chosen.every((p) => p.removed);
  return pages.map((p) => (selected.has(p.index) ? { ...p, removed: !restore } : p));
}

/** Shift-click: every page between the anchor and the clicked one, in list order. */
export function rangeBetween(pages: readonly OrganizePage[], from: number, to: number): Set<number> {
  const a = pages.findIndex((p) => p.index === from);
  const b = pages.findIndex((p) => p.index === to);
  if (a < 0 || b < 0) return new Set([to]);
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return new Set(pages.slice(lo, hi + 1).map((p) => p.index));
}

/** The options organizeEngine takes. */
export function toEngineOptions(pages: readonly OrganizePage[]) {
  const rotate: Record<number, number> = {};
  for (const p of pages) if (p.rotate) rotate[p.index] = p.rotate;
  return {
    order: pages.map((p) => p.index),
    rotate,
    remove: pages.filter((p) => p.removed).map((p) => p.index),
  };
}
