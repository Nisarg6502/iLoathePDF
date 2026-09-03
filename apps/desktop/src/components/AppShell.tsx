/**
 * The window: our own title bar, the tool rail, and the status bar.
 *
 * The OS decorations are switched off (`decorations: false`), so the title bar
 * here is the real one -- including the drag region and the window buttons.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { TOOLS, type Tool } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { isTauri } from "@/lib/jobs";
import { useOutputDir } from "@/lib/settings";

type Theme = "light" | "dark";

const THEME_KEY = "iloathepdf.theme";
const RAIL_KEY = "iloathepdf.rail";

function readTheme(): Theme {
  // ?theme=dark makes a screen deterministic for screenshots and manual
  // testing, without having to click the toggle first.
  const forced = new URLSearchParams(window.location.search).get("theme");
  if (forced === "light" || forced === "dark") return forced;

  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* private mode / storage disabled -- fall through to the system choice */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* nothing to do; the theme still applies for this session */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}

// ---------------------------------------------------------------------------
// Window controls. Only meaningful under Tauri; in the browser they hide.
// ---------------------------------------------------------------------------

async function windowAction(action: "minimize" | "toggleMaximize" | "close") {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  if (action === "minimize") await win.minimize();
  else if (action === "toggleMaximize") await win.toggleMaximize();
  else await win.close();
}

function WindowButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid h-9 w-11 place-items-center text-muted outline-none",
        "transition-colors duration-100",
        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
        danger ? "hover:bg-danger hover:text-white" : "hover:bg-surface-2 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function TitleBar({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <div className="flex h-9 flex-none items-center gap-2.5 border-b border-border bg-surface pl-3 select-none">
      <Link
        to="/"
        aria-label="All tools"
        className="flex items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="grid size-[19px] place-items-center rounded-md bg-accent">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="var(--on-accent)" strokeWidth="2">
            <rect x="3.4" y="7.2" width="9.2" height="6" rx="1.3" />
            <path d="M5.5 7.2V5.4a2.5 2.5 0 0 1 5 0v1.8" />
          </svg>
        </span>
        <span className="text-[13.5px] font-semibold tracking-[-0.01em]">iLoathePDF</span>
      </Link>

      <span data-tauri-drag-region className="font-mono text-[11px] tracking-[0.12em] text-faint">
        LOCAL ONLY
      </span>

      {/* The only draggable area, so no control can ever be inside it. */}
      <div data-tauri-drag-region className="h-full flex-1" />

      {/* Not decoration: the whole product promise, stated in the chrome. */}
      <div className="flex items-center gap-1.5 rounded-[7px] bg-ok-soft px-2.5 py-[3px]">
        <span className="size-[5px] rounded-full bg-ok" />
        <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-ok">OFFLINE</span>
      </div>

      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        className={cn(
          "flex h-6 items-center gap-1.5 rounded-[7px] border border-border bg-surface-2 px-2.5",
          "text-[12px] text-muted outline-none transition-colors duration-150",
          "hover:border-border-hi hover:text-text",
          "focus-visible:ring-2 focus-visible:ring-accent",
        )}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="8" cy="8" r="3.2" />
          <path d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
        </svg>
        <span>{theme === "dark" ? "Light" : "Dark"}</span>
      </button>

      {isTauri() ? (
        <div className="ml-2 flex">
          <WindowButton label="Minimise" onClick={() => void windowAction("minimize")}>
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1">
              <path d="M0 5h10" />
            </svg>
          </WindowButton>
          <WindowButton label="Maximise" onClick={() => void windowAction("toggleMaximize")}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" />
            </svg>
          </WindowButton>
          <WindowButton label="Close" danger onClick={() => void windowAction("close")}>
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1">
              <path d="M0 0l10 10M10 0L0 10" />
            </svg>
          </WindowButton>
        </div>
      ) : (
        <div className="w-3" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rail
// ---------------------------------------------------------------------------

function RailHeading({ children, show }: { children: ReactNode; show: boolean }) {
  if (!show) return <div className="h-2" />;
  return (
    <div className="px-3.5 pt-3.5 pb-1.5 font-mono text-[11px] font-bold tracking-[0.13em] text-faint first:pt-1">
      {children}
    </div>
  );
}

function RailItem({
  to,
  label,
  showLabel,
  end,
  children,
}: {
  to: string;
  label: string;
  showLabel: boolean;
  /** Match this path exactly -- otherwise "/" highlights on every screen. */
  end?: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={showLabel ? undefined : label}
      className={({ isActive }) =>
        cn(
          "mx-1.5 flex h-8 items-center gap-2.5 rounded-[7px] px-2 outline-none",
          "transition-colors duration-150",
          showLabel ? "justify-start" : "justify-center",
          isActive ? "bg-accent-soft text-text" : "text-muted hover:bg-surface-2",
          "focus-visible:ring-2 focus-visible:ring-accent",
        )
      }
    >
      <span className="flex-none">{children}</span>
      {showLabel ? <span className="truncate text-[13.5px]">{label}</span> : null}
    </NavLink>
  );
}

function ToolIcon({ tool }: { tool: Tool }) {
  return (
    <tool.icon
      className="size-4"
      style={{ color: `var(--tint-${tool.tint})` }}
      strokeWidth={1.5}
    />
  );
}

function Rail() {
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) !== "collapsed";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, expanded ? "expanded" : "collapsed");
    } catch {
      /* preference is per-session then; not worth surfacing */
    }
  }, [expanded]);

  const pdfTools = TOOLS.filter((t) => t.group === "pdf");
  const imageTools = TOOLS.filter((t) => t.group === "image");

  return (
    <nav
      style={{ width: expanded ? 184 : 52 }}
      className="flex flex-none flex-col overflow-hidden border-r border-border bg-surface py-2.5 transition-[width] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
    >
      <RailItem to="/" label="All tools" showLabel={expanded} end>
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="5.5" height="5.5" rx="1.2" />
          <rect x="10.5" y="2" width="5.5" height="5.5" rx="1.2" />
          <rect x="2" y="10.5" width="5.5" height="5.5" rx="1.2" />
          <rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1.2" />
        </svg>
      </RailItem>

      <RailHeading show={expanded}>PDF</RailHeading>
      {pdfTools.map((tool) => (
        <RailItem key={tool.id} to={tool.path} label={tool.title} showLabel={expanded}>
          <ToolIcon tool={tool} />
        </RailItem>
      ))}

      <RailHeading show={expanded}>IMAGES</RailHeading>
      {imageTools.map((tool) => (
        <RailItem key={tool.id} to={tool.path} label={tool.title} showLabel={expanded}>
          <ToolIcon tool={tool} />
        </RailItem>
      ))}

      <div className="flex-1" />

      <RailItem to="/settings" label="Settings" showLabel={expanded}>
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.8">
          <circle cx="9" cy="9" r="2.4" />
          <path d="M9 1.8v1.9M9 14.3v1.9M1.8 9h1.9M14.3 9h1.9M3.9 3.9l1.35 1.35M12.75 12.75l1.35 1.35M14.1 3.9l-1.35 1.35M5.25 12.75L3.9 14.1" />
        </svg>
      </RailItem>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Collapse the sidebar" : "Expand the sidebar"}
        className={cn(
          "mx-1.5 mt-1 flex h-7 items-center gap-2.5 rounded-[7px] px-2 text-faint outline-none",
          "transition-colors duration-150 hover:bg-surface-2 hover:text-text",
          "focus-visible:ring-2 focus-visible:ring-accent",
          expanded ? "justify-start" : "justify-center",
        )}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="flex-none transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
          style={{ transform: expanded ? "none" : "scaleX(-1)" }}
        >
          <path d="M11 5.5L7.5 9l3.5 3.5" />
          <path d="M3.5 3v12" />
        </svg>
        {expanded ? <span className="text-[12.5px]">Collapse</span> : null}
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

function StatusBar() {
  const { outputDir, label, choose } = useOutputDir();

  return (
    <div className="flex h-[30px] flex-none items-center gap-2.5 border-t border-border bg-surface px-3.5 select-none">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--ok)" strokeWidth="1.6" className="flex-none">
        <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.4" />
        <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" />
      </svg>
      <span className="text-[12.5px] text-text">Files never leave this computer.</span>
      <span className="hidden text-[12.5px] text-faint lg:inline">
        No network code in this build
      </span>

      <div className="flex-1" />

      <span className="text-[12.5px] text-faint">Output</span>
      <button
        type="button"
        onClick={choose}
        title={outputDir ?? "Results are written next to your input files"}
        className={cn(
          "flex h-[22px] items-center gap-1.5 rounded-[7px] px-2 text-muted outline-none",
          "transition-colors duration-150 hover:bg-surface-2 hover:text-text",
          "focus-visible:ring-2 focus-visible:ring-accent",
        )}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--tint-e)" strokeWidth="1.4" className="flex-none">
          <path d="M1.6 4.4a1 1 0 0 1 1-1h3.1l1.2 1.6h5.5a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1z" />
        </svg>
        <span className="max-w-[240px] truncate font-mono text-[12px]">{label}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M1.5 3.5L5 7l3.5-3.5" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function AppShell() {
  const { theme, toggle } = useTheme();
  const location = useLocation();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg text-text">
      <TitleBar theme={theme} onToggleTheme={toggle} />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <main key={location.pathname} className="ihp-fade flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}

export default AppShell;
