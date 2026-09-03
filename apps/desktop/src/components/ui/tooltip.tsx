import {
  cloneElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

type Side = "top" | "bottom" | "left" | "right";

/**
 * Shared "a tooltip was open a moment ago" flag. Once one tooltip is open,
 * neighbouring ones should open instantly -- the delay exists to stop
 * accidental activation, and after the first hover that risk is gone.
 */
let lastClosedAt = 0;
const GRACE_MS = 400;

export interface TooltipProps {
  content: ReactNode;
  side?: Side;
  delay?: number;
  children: ReactElement<{
    ref?: React.Ref<HTMLElement>;
    onPointerEnter?: (e: React.PointerEvent) => void;
    onPointerLeave?: (e: React.PointerEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  }>;
}

export function Tooltip({ content, side = "bottom", delay = 500, children }: TooltipProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const map: Record<Side, { top: number; left: number }> = {
      top: { top: r.top - gap, left: r.left + r.width / 2 },
      bottom: { top: r.bottom + gap, left: r.left + r.width / 2 },
      left: { top: r.top + r.height / 2, left: r.left - gap },
      right: { top: r.top + r.height / 2, left: r.right + gap },
    };
    setPos(map[side]);
  }, [side]);

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    const skip = Date.now() - lastClosedAt < GRACE_MS;
    setInstant(skip);
    timer.current = window.setTimeout(
      () => {
        place();
        setOpen(true);
      },
      skip ? 0 : delay,
    );
  }, [delay, place]);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen((was) => {
      if (was) lastClosedAt = Date.now();
      return false;
    });
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open, hide]);

  const transform: Record<Side, string> = {
    top: "translate(-50%, -100%)",
    bottom: "translate(-50%, 0)",
    left: "translate(-100%, -50%)",
    right: "translate(0, -50%)",
  };

  const trigger = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
    },
    onPointerEnter: (e: React.PointerEvent) => {
      children.props.onPointerEnter?.(e);
      if (e.pointerType === "mouse") show();
    },
    onPointerLeave: (e: React.PointerEvent) => {
      children.props.onPointerLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      place();
      setInstant(true);
      setOpen(true);
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {open && pos
        ? createPortal(
            <div
              role="tooltip"
              style={
                {
                  top: pos.top,
                  left: pos.left,
                  transform: transform[side],
                } as CSSProperties
              }
              className={cn(
                "pointer-events-none fixed z-100 max-w-64 rounded-md border border-border",
                "bg-surface px-2 py-1 text-xs leading-snug text-text shadow-[var(--shadow-card)]",
                !instant && "ihp-fade",
              )}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
