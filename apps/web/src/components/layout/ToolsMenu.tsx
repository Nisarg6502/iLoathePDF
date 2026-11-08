import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { TOOLS } from "@/tools/registry";
import { DesktopOnlyBadge } from "@/components/DesktopOnlyBadge";
import { tintWash } from "@/tools/tint";

/** Time the pointer may spend in the gap between the label and the panel. */
const CLOSE_DELAY_MS = 140;

const GROUPS = [
  { label: "PDF TOOLS", category: "pdf" },
  { label: "IMAGE TOOLS", category: "image" },
  { label: "TO PDF", category: "document" },
] as const;

function isKeyboardFocus(el: HTMLElement): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * The "Tools" item of the primary nav. Clicking the label still goes to
 * /tools; hovering or keyboard-focusing it also reveals a menu with every
 * tool so people can jump straight in. On touch devices the first tap opens
 * the menu and the second tap follows the link.
 */
export function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const lastPointerType = useRef("mouse");
  const pendingFocus = useRef<"first" | "last" | null>(null);
  /** Set while we return focus to the label ourselves, so that doesn't reopen the menu. */
  const restoringFocus = useRef(false);
  const menuId = useId();
  const location = useLocation();

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimer.current);
  }, []);

  const openNow = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const closeNow = useCallback(() => {
    cancelClose();
    setOpen(false);
  }, [cancelClose]);

  const closeSoon = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Route change (a menu item was chosen, or any other navigation) closes it.
  useEffect(() => {
    closeNow();
  }, [location.pathname, closeNow]);

  // Tapping anywhere outside dismisses the menu (the touch equivalent of mouseleave).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeNow();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, closeNow]);

  const items = () =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // Move focus into the menu once it has rendered (ArrowDown / ArrowUp on the label).
  useEffect(() => {
    if (!open || !pendingFocus.current) return;
    const list = items();
    (pendingFocus.current === "first" ? list[0] : list[list.length - 1])?.focus();
    pendingFocus.current = null;
  }, [open]);

  const onTriggerKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      pendingFocus.current = e.key === "ArrowDown" ? "first" : "last";
      if (open) {
        const list = items();
        (pendingFocus.current === "first" ? list[0] : list[list.length - 1])?.focus();
        pendingFocus.current = null;
      } else {
        openNow();
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      closeNow();
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
        closeNow();
        restoringFocus.current = true;
        triggerRef.current?.focus();
        restoringFocus.current = false;
        return;
      default:
        return;
    }
    e.preventDefault();
    next?.focus();
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") openNow();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") closeSoon();
      }}
      onBlur={(e) => {
        // Focus left the whole widget (label + panel).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeNow();
      }}
    >
      <NavLink
        ref={triggerRef}
        to="/tools"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onPointerDown={(e) => {
          lastPointerType.current = e.pointerType || "mouse";
        }}
        onClick={(e) => {
          // No hover on touch screens: first tap reveals the menu, second tap navigates.
          if (lastPointerType.current === "touch" && !open) {
            e.preventDefault();
            openNow();
          }
          lastPointerType.current = "mouse";
        }}
        onFocus={(e) => {
          if (!restoringFocus.current && isKeyboardFocus(e.currentTarget)) openNow();
        }}
        onKeyDown={onTriggerKeyDown}
        className={({ isActive }) =>
          `inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors duration-150 hover:bg-surface-2 ${isActive || open ? "text-text" : "text-muted"}`
        }
      >
        Tools
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
          className={`transition-transform duration-150 ease-[var(--ease-out-strong)] ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 3.5 5 6.5 8 3.5" />
        </svg>
      </NavLink>

      {open && (
        <div className="absolute left-0 top-full z-30 pt-2 max-sm:fixed max-sm:inset-x-4 max-sm:top-[62px] max-sm:pt-1">
          <div
            id={menuId}
            role="menu"
            aria-label="Tools"
            onKeyDown={onMenuKeyDown}
            className="menu-in max-h-[calc(100vh-90px)] w-[min(580px,calc(100vw-2rem))] overflow-y-auto rounded-[14px] border border-border bg-surface p-3 shadow-[var(--shadow-card)] max-sm:w-auto"
          >
            {GROUPS.map((group) => {
              const tools = TOOLS.filter((t) => t.category === group.category);
              if (tools.length === 0) return null;
              return (
                <div key={group.category} role="group" aria-label={group.label} className="not-first:mt-2.5">
                  <div className="flex items-center gap-3 px-2 pb-1.5 pt-1">
                    <span aria-hidden="true" className="font-mono text-[10px] font-bold tracking-[0.14em] text-faint">
                      {group.label}
                    </span>
                    <span aria-hidden="true" className="h-px flex-1 bg-border" />
                  </div>
                  <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                    {tools.map((tool) => (
                      <Link
                        key={tool.slug}
                        role="menuitem"
                        tabIndex={-1}
                        to={tool.status === "desktop-only" ? "/download" : `/tools/${tool.slug}`}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] text-text transition-colors duration-150 hover:bg-[var(--wash)] focus-visible:bg-[var(--wash)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                        style={{ ["--wash" as string]: tintWash(tool.tint, 12) }}
                      >
                        <tool.Icon className="size-[18px] flex-none" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{tool.name}</span>
                        {tool.status === "desktop-only" && <DesktopOnlyBadge />}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="mt-2.5 border-t border-border pt-2">
              <Link
                role="menuitem"
                tabIndex={-1}
                to="/tools"
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                Browse all tools
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
