/**
 * Motion tokens. One source of truth shared by CSS and Motion (Framer Motion),
 * so a panel animated in JS and a button animated in CSS agree on how the app
 * moves.
 *
 * Rules this file encodes:
 *  - Custom curves, never the browser's built-in easings, which are too weak
 *    to read as intentional.
 *  - Never `ease-in` for UI: it delays the first frame, exactly when the user
 *    is watching, and makes the app feel sluggish.
 *  - Exits are faster than entrances. The user has already decided by then;
 *    the system should get out of the way.
 *  - Nothing enters from `scale(0)`. Real things do not appear from nothing.
 */

/** Mirrors --ease-out-strong / --ease-in-out-strong in index.css. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

export const DURATION = {
  /** press feedback */
  press: 0.14,
  /** tooltips, small popovers */
  tooltip: 0.16,
  /** panels appearing in the sidebar */
  panel: 0.22,
  /** the same panels leaving */
  panelExit: 0.14,
  /** the drop suggestion sheet */
  sheet: 0.26,
  sheetExit: 0.16,
} as const;

/**
 * The run panel: progress, then result or error, in the same slot.
 *
 * Used with `AnimatePresence mode="popLayout"` so the outgoing panel does not
 * shove the incoming one down the page mid-swap.
 */
export const panelVariants = {
  initial: { opacity: 0, y: 6, scale: 0.985 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATION.panel, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.99,
    transition: { duration: DURATION.panelExit, ease: EASE_OUT },
  },
} as const;

/** A sheet anchored to the middle of the window: scales, never slides far. */
export const sheetVariants = {
  initial: { opacity: 0, y: 12, scale: 0.97 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATION.sheet, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: 6,
    scale: 0.98,
    transition: { duration: DURATION.sheetExit, ease: EASE_OUT },
  },
} as const;

export const scrimVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.sheet, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.sheetExit, ease: EASE_OUT } },
} as const;

/**
 * Springs for anything the user drags. Springs keep their velocity when
 * interrupted, which duration-based tweens cannot do -- that is the whole
 * reason to reach for one here.
 */
export const DRAG_SPRING = { type: "spring", duration: 0.45, bounce: 0.18 } as const;
