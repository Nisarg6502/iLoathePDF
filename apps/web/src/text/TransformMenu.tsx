import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { msg, useTranslation } from "@iloathepdf/i18n";
import { TRANSFORMS, type TransformId } from "./transforms";

interface Item {
  id: TransformId;
  label: string;
  hint?: string;
}

/** Case labels are written in the case they produce, so they show what they do. */
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: msg("CHANGE CASE"),
    items: [
      { id: "upper", label: msg("UPPERCASE") },
      { id: "lower", label: msg("lowercase") },
      { id: "title", label: msg("Title Case") },
      { id: "sentence", label: msg("Sentence case") },
    ],
  },
  {
    label: msg("CLEAN UP"),
    items: [
      { id: "spaces", label: msg("Remove extra spaces"), hint: msg("Doubled spaces and tabs") },
      { id: "lineBreaks", label: msg("Remove line breaks"), hint: msg("Rejoins lines copied from a PDF") },
      { id: "emptyLines", label: msg("Remove empty lines"), hint: msg("Blank lines between paragraphs") },
    ],
  },
];

/** Room the menu needs, to flip it to the button's right edge near the screen edge. */
const MENU_WIDTH = 248;
const GUTTER = 16;

export interface TransformMenuProps {
  text: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

/**
 * "Change text ▾": a small menu of case changes and clean-ups. Picking one
 * runs it over the whole text in this tab and hands the result to onChange
 * (only when it changes something). The only state is whether it is open.
 */
export function TransformMenu({ text, onChange, disabled }: TransformMenuProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<"first" | "last">("first");
  const menuId = useId();
  const off = disabled || text === "";

  const items = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openMenu = (focus: "first" | "last") => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setAlignRight(!!rect && rect.left + MENU_WIDTH > window.innerWidth - GUTTER);
    pendingFocus.current = focus;
    setOpen(true);
  };

  // Nothing to change any more (text cleared): close.
  useEffect(() => {
    if (off) setOpen(false);
  }, [off]);

  // Move focus into the menu once it has rendered.
  useEffect(() => {
    if (!open) return;
    const list = items();
    (pendingFocus.current === "first" ? list[0] : list[list.length - 1])?.focus();
  }, [open]);

  // Clicking or tapping anywhere outside dismisses the menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const onTriggerKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(e.key === "ArrowDown" ? "first" : "last");
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close(true);
    }
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    switch (e.key) {
      case "ArrowDown":
        next = list[(index + 1) % list.length];
        break;
      case "ArrowUp":
        next = list[(index - 1 + list.length) % list.length];
        break;
      case "Home":
        next = list[0];
        break;
      case "End":
        next = list[list.length - 1];
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        return;
      case "Tab":
        close(false);
        return;
      default:
        return;
    }
    e.preventDefault();
    next?.focus();
  };

  const apply = (id: TransformId) => {
    const next = TRANSFORMS[id](text, i18n.language);
    close(true);
    if (next !== text) onChange(next);
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        // Focus left the whole widget (button + menu).
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) close(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={off}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onMouseDown={(e) => {
          // Keep focus in the menu so its blur doesn't close it before this click toggles it.
          if (open) e.preventDefault();
        }}
        onClick={() => (open ? close(true) : openMenu("first"))}
        onKeyDown={onTriggerKeyDown}
        className="flex h-9 items-center gap-1.5 rounded-[9px] border border-border-hi bg-surface-2 px-3.5 text-[13px] font-semibold text-text transition-transform duration-100 hover:bg-surface-3 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50"
      >
        {t("Change text")}
        <svg
          width="9"
          height="9"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`text-muted transition-transform duration-150 ease-[var(--ease-out-strong)] ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("Change text")}
          onKeyDown={onMenuKeyDown}
          // Safari doesn't focus a clicked button, so the focused item would
          // blur (and close the menu) before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          className={`menu-in absolute top-full z-30 mt-1.5 w-[min(248px,calc(100vw-2rem))] rounded-[14px] border border-border bg-surface p-1.5 shadow-[var(--shadow-card)] ${alignRight ? "right-0 origin-top-right" : "left-0 origin-top-left"}`}
        >
          {GROUPS.map((group) => (
            <div key={group.label} role="group" aria-label={t(group.label)} className="not-first:mt-1.5 not-first:border-t not-first:border-border not-first:pt-1.5">
              <div aria-hidden="true" className="px-2.5 pb-1 pt-1 font-mono text-[10px] font-bold tracking-[0.14em] text-faint">
                {t(group.label)}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => apply(item.id)}
                  aria-label={t(item.label)}
                  aria-describedby={item.hint ? `${menuId}-${item.id}` : undefined}
                  className="flex w-full flex-col items-start rounded-lg px-2.5 py-1.5 text-left text-[13.5px] text-text transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span>{t(item.label)}</span>
                  {item.hint && (
                    <span id={`${menuId}-${item.id}`} className="text-[12px] leading-snug text-faint">
                      {t(item.hint)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
