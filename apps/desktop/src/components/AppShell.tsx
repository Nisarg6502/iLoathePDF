/**
 * The window: our own title bar, the tool rail, and the status bar.
 *
 * The OS decorations are switched off (`decorations: false`), so the title bar
 * here is the real one -- including the drag region and the window buttons.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useTranslation } from "@iloathepdf/i18n";

import { pickedFromPaths } from "@/components/FileDropZone";
import { setPendingFiles } from "@/lib/handoff";
import { claimLaunch, startLaunchListener, useLaunch } from "@/lib/launch";
import { TOOLS, type Tool } from "@/lib/tools";
import { TEXT_TOOLS } from "@/lib/textTools";
import { cn } from "@/lib/utils";
import { isTauri } from "@/lib/jobs";
import { useOutputDir } from "@/lib/settings";
import {
  checkForUpdate,
  dismissUpdate,
  downloadUpdate,
  installUpdate,
  useUpdateCheck,
} from "@/lib/useUpdateCheck";

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
  const { t } = useTranslation();
  const { enabled: updateCheckOn } = useUpdateCheck();
  return (
    <div className="flex h-9 flex-none items-center gap-2.5 border-b border-border bg-surface pl-3 select-none">
      <Link
        to="/"
        aria-label={t("All tools")}
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
        {t("LOCAL ONLY")}
      </span>

      {/* The only draggable area, so no control can ever be inside it. */}
      <div data-tauri-drag-region className="h-full flex-1" />

      {/* Not decoration: the whole product promise, stated in the chrome. When
          the user has opted in to the update check it must say so, or the
          badge would be a lie. */}
      {updateCheckOn ? (
        <div
          className="flex items-center gap-1.5 rounded-[7px] bg-surface-2 px-2.5 py-[3px]"
          title={t("The update check is on: the app asks GitHub for the latest release number and sends nothing else. Nothing is downloaded unless you ask for it. Turn it off in Settings.")}
        >
          <span className="size-[5px] rounded-full bg-accent" />
          <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-muted">
            {t("UPDATE CHECK ON")}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-[7px] bg-ok-soft px-2.5 py-[3px]">
          <span className="size-[5px] rounded-full bg-ok" />
          <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-ok">{t("OFFLINE")}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? t("Switch to light theme") : t("Switch to dark theme")}
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
        <span>{theme === "dark" ? t("Light") : t("Dark")}</span>
      </button>

      {isTauri() ? (
        <div className="ml-2 flex">
          <WindowButton label={t("Minimise")} onClick={() => void windowAction("minimize")}>
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1">
              <path d="M0 5h10" />
            </svg>
          </WindowButton>
          <WindowButton label={t("Maximise")} onClick={() => void windowAction("toggleMaximize")}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" />
            </svg>
          </WindowButton>
          <WindowButton label={t("Close")} danger onClick={() => void windowAction("close")}>
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
    <div className="px-3.5 pt-2.5 pb-1 font-mono text-[11px] font-bold tracking-[0.13em] text-faint first:pt-1">
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

function ToolIcon({ tool }: { tool: Pick<Tool, "icon" | "tint"> }) {
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

  const { t } = useTranslation();
  const pdfTools = TOOLS.filter((tool) => tool.group === "pdf");
  const imageTools = TOOLS.filter((tool) => tool.group === "image");
  const documentTools = TOOLS.filter((tool) => tool.group === "document");

  // Keep the current screen's item in view when the list has to scroll.
  const listRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  return (
    <nav
      style={{ width: expanded ? 184 : 52 }}
      className="flex flex-none flex-col overflow-hidden border-r border-border bg-surface py-2.5 transition-[width] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
    >
      {/* The tool list scrolls (wheel, keyboard, or following the current
          screen) when the window is too short for it, so Settings and the
          collapse button below always stay in view. No scrollbar: it would
          eat the width the tool names need. */}
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto [scrollbar-width:none]">
        <RailItem to="/" label={t("All tools")} showLabel={expanded} end>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="5.5" height="5.5" rx="1.2" />
            <rect x="10.5" y="2" width="5.5" height="5.5" rx="1.2" />
            <rect x="2" y="10.5" width="5.5" height="5.5" rx="1.2" />
            <rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1.2" />
          </svg>
        </RailItem>

        <RailItem to="/recipes" label={t("Recipes")} showLabel={expanded}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2.5" width="5" height="4" rx="1" />
            <rect x="11" y="7" width="5" height="4" rx="1" />
            <rect x="2" y="11.5" width="5" height="4" rx="1" />
            <path d="M7 4.5h2.2a1 1 0 0 1 1 1V9H11M7 13.5h2.2a1 1 0 0 0 1-1V9" />
          </svg>
        </RailItem>

        <RailHeading show={expanded}>{t("PDF")}</RailHeading>
        {pdfTools.map((tool) => (
          <RailItem key={tool.id} to={tool.path} label={t(tool.title)} showLabel={expanded}>
            <ToolIcon tool={tool} />
          </RailItem>
        ))}

        <RailHeading show={expanded}>{t("IMAGES")}</RailHeading>
        {imageTools.map((tool) => (
          <RailItem key={tool.id} to={tool.path} label={t(tool.title)} showLabel={expanded}>
            <ToolIcon tool={tool} />
          </RailItem>
        ))}

        <RailHeading show={expanded}>{t("TO PDF")}</RailHeading>
        {documentTools.map((tool) => (
          <RailItem key={tool.id} to={tool.path} label={t(tool.title)} showLabel={expanded}>
            <ToolIcon tool={tool} />
          </RailItem>
        ))}

        <RailHeading show={expanded}>{t("TEXT")}</RailHeading>
        {TEXT_TOOLS.map((tool) => (
          <RailItem key={tool.id} to={tool.path} label={t(tool.title)} showLabel={expanded}>
            <ToolIcon tool={tool} />
          </RailItem>
        ))}
      </div>

      <RailItem to="/settings" label={t("Settings")} showLabel={expanded}>
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.8">
          <circle cx="9" cy="9" r="2.4" />
          <path d="M9 1.8v1.9M9 14.3v1.9M1.8 9h1.9M14.3 9h1.9M3.9 3.9l1.35 1.35M12.75 12.75l1.35 1.35M14.1 3.9l-1.35 1.35M5.25 12.75L3.9 14.1" />
        </svg>
      </RailItem>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? t("Collapse the sidebar") : t("Expand the sidebar")}
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
        {expanded ? <span className="text-[12.5px]">{t("Collapse")}</span> : null}
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

function StatusBar() {
  const { t } = useTranslation();
  const { outputDir, label, choose } = useOutputDir();
  const { enabled: updateCheckOn } = useUpdateCheck();

  return (
    <div className="flex h-[30px] flex-none items-center gap-2.5 border-t border-border bg-surface px-3.5 select-none">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--ok)" strokeWidth="1.6" className="flex-none">
        <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.4" />
        <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" />
      </svg>
      <span className="text-[12.5px] text-text">{t("Files never leave this computer.")}</span>
      <span className="hidden text-[12.5px] text-faint lg:inline">
        {updateCheckOn ? t("Only the update check goes online") : t("Nothing goes online")}
      </span>

      <div className="flex-1" />

      <span className="text-[12.5px] text-faint">{t("Output")}</span>
      <button
        type="button"
        onClick={choose}
        title={outputDir ?? t("Results are written next to your input files")}
        className={cn(
          "flex h-[22px] items-center gap-1.5 rounded-[7px] px-2 text-muted outline-none",
          "transition-colors duration-150 hover:bg-surface-2 hover:text-text",
          "focus-visible:ring-2 focus-visible:ring-accent",
        )}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--tint-e)" strokeWidth="1.4" className="flex-none">
          <path d="M1.6 4.4a1 1 0 0 1 1-1h3.1l1.2 1.6h5.5a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1z" />
        </svg>
        <span className="max-w-[240px] truncate font-mono text-[12px]">{outputDir ? label : t(label)}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M1.5 3.5L5 7l3.5-3.5" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Update notice (only ever shown to someone who opted in to the check)
// ---------------------------------------------------------------------------

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

const bannerLink =
  "rounded text-[13px] font-semibold text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent";
const bannerButton =
  "h-6 rounded-md bg-accent px-2.5 text-[12.5px] font-semibold text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-60";

function UpdateBanner() {
  const { t } = useTranslation();
  const { status, latest, dismissed, progress, error } = useUpdateCheck();
  // "Later" on a downloaded update hides the banner until the next launch; the
  // update stays ready in Settings.
  const [readyHidden, setReadyHidden] = useState(false);

  if (!latest) return null;
  const visible =
    status === "downloading" ||
    status === "installing" ||
    (status === "ready" && !readyHidden) ||
    (status === "available" && dismissed !== latest.version);
  if (!visible) return null;

  const openRelease = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(latest.url);
    } catch {
      /* the link is also on Settings and the website; nothing else to do */
    }
  };

  const pct =
    progress && progress.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

  let message: ReactNode;
  let actions: ReactNode = null;

  if (status === "downloading") {
    message = (
      <>
        <span className="font-semibold">{t("Downloading iLoathePDF {{version}}…", { version: latest.version })}</span>{" "}
        <span className="text-muted">
          {pct !== null && progress?.total
            ? t("{{percent}}% of {{size}}", { percent: pct, size: formatMb(progress.total) })
            : progress
              ? formatMb(progress.downloaded)
              : ""}
          {" — "}{t("keep working, it runs in the background.")}
        </span>
      </>
    );
  } else if (status === "installing") {
    message = (
      <>
        <span className="font-semibold">{t("Installing iLoathePDF {{version}}…", { version: latest.version })}</span>{" "}
        <span className="text-muted">{t("The app closes, updates and reopens by itself.")}</span>
      </>
    );
  } else if (status === "ready") {
    message = (
      <>
        <span className="font-semibold">{t("iLoathePDF {{version}} is ready to install.", { version: latest.version })}</span>{" "}
        <span className="text-muted">
          {error ?? t("Windows will ask for permission, then the app reopens.")}
        </span>
      </>
    );
    actions = (
      <>
        <button type="button" onClick={() => void installUpdate()} className={bannerButton}>
          {error ? t("Retry") : t("Restart & update")}
        </button>
        <button type="button" onClick={() => setReadyHidden(true)} className={bannerLink}>
          {t("Later")}
        </button>
      </>
    );
  } else {
    message = (
      <>
        <span className="font-semibold">{t("iLoathePDF {{version}} is available.", { version: latest.version })}</span>{" "}
        <span className={error ? "text-danger" : "text-muted"}>
          {error ?? t("You have {{appVersion}}.", { appVersion: __APP_VERSION__ })}
        </span>
      </>
    );
    actions = (
      <>
        <button type="button" onClick={() => void downloadUpdate()} className={bannerButton}>
          {error ? t("Retry") : t("Update now")}
        </button>
        <button type="button" onClick={() => void openRelease()} className={bannerLink}>
          {t("What’s new")}
        </button>
      </>
    );
  }

  return (
    <div
      role="status"
      className="relative flex h-9 flex-none items-center gap-3 border-b border-border bg-accent-soft px-3.5"
    >
      <span className="min-w-0 truncate text-[13px] text-text">{message}</span>
      {actions}
      <div className="flex-1" />
      {status === "available" ? (
        <button
          type="button"
          onClick={() => dismissUpdate(latest.version)}
          aria-label={t("Dismiss this notice")}
          className="grid size-6 place-items-center rounded text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
            <path d="M1 1l8 8M9 1L1 9" />
          </svg>
        </button>
      ) : null}
      {status === "downloading" ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-border">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: pct === null ? "30%" : `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Files from Windows ("Send to", the right-click menu, "Open with")
// ---------------------------------------------------------------------------

/** Which launch put the user on this screen, if one did. */
function launchSeqOf(state: unknown): number | undefined {
  const seq = (state as { launch?: unknown } | null)?.launch;
  return typeof seq === "number" ? seq : undefined;
}

/**
 * Opens the screen a launch asks for, with its files already in place, the
 * same way Home hands a drop to a tool. Nothing runs until the user presses
 * the button. Anything left out or not understood is said in a banner on
 * that screen, which goes away once the user moves on.
 */
function LaunchBanner() {
  const { t } = useTranslation();
  const launch = useLaunch();
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(0);

  useEffect(() => startLaunchListener(), []);

  useEffect(() => {
    if (!launch || !claimLaunch(launch)) return;
    setPendingFiles(pickedFromPaths(launch.files));
    // The state also remounts the screen (see AppShell's <main> key), so
    // files sent to the tool that is already open replace what it shows.
    navigate(launch.path, { state: { launch: launch.seq } });
  }, [launch, navigate]);

  if (
    !launch ||
    launch.notices.length === 0 ||
    dismissed === launch.seq ||
    launchSeqOf(location.state) !== launch.seq
  ) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex flex-none items-start gap-3 border-b border-border bg-warn-soft px-3.5 py-2"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        {launch.notices.map((notice) => (
          <p key={notice} className="text-[13px] text-text">
            {notice}
          </p>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(launch.seq)}
        aria-label={t("Dismiss this notice")}
        className="grid size-6 flex-none place-items-center rounded text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
          <path d="M1 1l8 8M9 1L1 9" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function AppShell() {
  const { theme, toggle } = useTheme();
  const location = useLocation();

  // Once per launch, and only if the user opted in (checkForUpdate does
  // nothing otherwise).
  useEffect(() => {
    void checkForUpdate();
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg text-text">
      <TitleBar theme={theme} onToggleTheme={toggle} />
      <UpdateBanner />
      <LaunchBanner />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <main
          key={`${location.pathname}:${launchSeqOf(location.state) ?? ""}`}
          className="ihp-fade flex min-w-0 flex-1 flex-col"
        >
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}

export default AppShell;
