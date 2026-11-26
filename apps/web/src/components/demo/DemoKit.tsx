/**
 * Pieces shared by the looping product demos (RightClickDemo,
 * ExtensionDemo): a fixed-size stage that scales down to fit its column, a
 * pointer, the scene tabs, and the clock that steps through the frames.
 *
 * A demo is a list of scenes; a scene is a list of frames, each a snapshot
 * of what is on screen plus how long it stays. Everything that moves
 * (pointer, menus, cards) animates between snapshots, so a frame never has
 * to describe motion, only where things end up.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/** The site's strong curves (index.css --ease-out-strong, --ease-in-out-strong). */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

export interface Frame {
  /** Milliseconds this frame stays before the next. */
  dur: number;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Steps through `scenes` while the demo is on screen, looping. Picking a
 * scene starts it from its first frame. Off screen (or in a background
 * tab, where timers slow down) it simply waits where it is.
 */
export function useDemoLoop<F extends Frame>(scenes: F[][]) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ scene: 0, frame: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const scene = Math.min(pos.scene, scenes.length - 1);
  const frames = scenes[scene];
  const frameIndex = Math.min(pos.frame, frames.length - 1);

  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => {
      setPos((p) =>
        p.frame + 1 < scenes[p.scene].length
          ? { scene: p.scene, frame: p.frame + 1 }
          : { scene: (p.scene + 1) % scenes.length, frame: 0 },
      );
    }, frames[frameIndex].dur);
    return () => window.clearTimeout(id);
  }, [visible, scene, frameIndex, frames, scenes]);

  return {
    ref,
    scene,
    frame: frames[frameIndex],
    setScene: (s: number) => setPos({ scene: s, frame: 0 }),
  };
}

/**
 * Lays its children out at a fixed `width` x `height` and scales the whole
 * thing down to the column's width, so the pointer's coordinates mean the
 * same on a phone as on a desktop.
 */
export function Stage({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useIsoLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / width));
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={outer} className="relative w-full overflow-hidden" style={{ height: height * scale }}>
      <div
        className="absolute left-0 top-0 select-none"
        style={{ width, height, transform: `scale(${scale})`, transformOrigin: "0 0" }}
      >
        {children}
      </div>
    </div>
  );
}

/** The pointer: glides between frames, dips on a click. */
export function Cursor({ x, y, pressed }: { x: number; y: number; pressed?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-50"
      initial={false}
      animate={{ transform: `translate(${x}px, ${y}px) scale(${pressed ? 0.86 : 1})` }}
      transition={reduce ? { duration: 0 } : { duration: 0.55, ease: EASE_IN_OUT }}
      style={{ transformOrigin: "2px 2px" }}
    >
      <svg width="18" height="22" viewBox="0 0 18 22" style={{ filter: "drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.35))" }}>
        <path d="M1.5 1.5v16.2l4.1-3.9 2.9 6.6 2.7-1.2-2.9-6.5 5.7-.3z" fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </motion.div>
  );
}

/** Tabs under a demo: which scene is playing, and a way to jump to one. */
export function SceneTabs({
  label,
  scenes,
  current,
  onPick,
}: {
  label: string;
  scenes: string[];
  current: number;
  onPick: (i: number) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {scenes.map((name, i) => (
        <button
          key={name}
          type="button"
          aria-pressed={current === i}
          onClick={() => onPick(i)}
          className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors duration-150 ${
            current === i ? "border-accent bg-accent-soft text-text" : "border-border text-muted hover:text-text"
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/** Enter/exit for menus and popups: a short fade and settle from the anchor. */
export const popIn = {
  initial: { opacity: 0, transform: "scale(0.96)" },
  animate: { opacity: 1, transform: "scale(1)" },
  exit: { opacity: 0, transition: { duration: 0.1 } },
  transition: { duration: 0.16, ease: EASE_OUT },
};

/** Grey bars standing in for the system's own menu items. */
export function MenuFiller({ widths }: { widths: number[] }) {
  return (
    <>
      {widths.map((w, i) => (
        <div key={i} className="flex h-[22px] items-center px-3">
          <span className="h-[6px] rounded-full bg-surface-3" style={{ width: w }} />
        </div>
      ))}
    </>
  );
}
