import { useEffect, useId, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { msg, useTranslation } from "@iloathepdf/i18n";
import { LogoMark, Wordmark } from "./BrandLogo";
import { LanguagePicker } from "./LanguagePicker";
import { ThemeToggle } from "./ThemeToggle";
import { ToolsMenu } from "./ToolsMenu";

const NAV_LINKS = [
  { to: "/", label: msg("Home"), end: true },
  { to: "/tools", label: msg("Tools"), menu: true },
  { to: "/recipes", label: msg("Recipes") },
  { to: "/how-it-works", label: msg("How it works") },
  { to: "/privacy", label: msg("Privacy") },
];

/**
 * The full nav needs about 780px, so below the `lg` breakpoint it collapses
 * into a menu button. Without that the nav forced the whole page wider than a
 * phone screen, and mobile browsers zoomed out to fit it.
 */
export function SiteHeader() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const location = useLocation();

  // Following a link (or any other navigation) closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-bg">
      <div className="mx-auto flex h-[62px] max-w-6xl items-center gap-3 px-5 sm:px-8 lg:gap-8">
        <Link to="/" className="flex flex-none items-center gap-2">
          <LogoMark size={26} />
          <Wordmark className="text-[17px]" />
        </Link>

        <nav aria-label={t("Primary")} className="flex items-center gap-0.5 max-lg:hidden">
          {NAV_LINKS.map((link) =>
            link.menu ? (
              <ToolsMenu key={link.to} />
            ) : (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors duration-150 hover:bg-surface-2 ${isActive ? "text-text" : "text-muted"}`
                }
              >
                {t(link.label)}
              </NavLink>
            ),
          )}
        </nav>

        <div className="flex-1" />

        <LanguagePicker />
        <ThemeToggle />
        <Link
          to="/download"
          className="flex h-8 flex-none items-center gap-1.5 rounded-[9px] border border-border-hi bg-surface-2 px-3.5 text-[13px] font-semibold text-text transition-transform duration-100 hover:bg-surface-3 active:scale-[0.96] max-lg:hidden"
        >
          {t("Desktop app")}
        </Link>

        <button
          type="button"
          aria-label={open ? t("Close menu") : t("Open menu")}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="grid size-10 flex-none place-items-center rounded-lg border border-border-hi bg-surface-2 text-text transition-transform duration-100 hover:bg-surface-3 active:scale-[0.96] lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M4 4l10 10M14 4 4 14" /> : <path d="M3 5.5h12M3 9h12M3 12.5h12" />}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id={panelId}
          aria-label={t("Menu")}
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-62px)] overflow-y-auto border-b border-border bg-bg px-5 pb-4 pt-2 shadow-[var(--shadow-card)] sm:px-8 lg:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col">
            {NAV_LINKS.map((link) => (
              <li key={link.to} className="border-b border-border last:border-b-0">
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `flex min-h-12 items-center text-[16px] ${isActive ? "font-semibold text-text" : "text-muted"}`
                  }
                >
                  {t(link.label)}
                </NavLink>
              </li>
            ))}
          </ul>
          <Link
            to="/download"
            className="mx-auto mt-3 flex h-11 max-w-6xl items-center justify-center rounded-[10px] border border-border-hi bg-surface-2 text-[14px] font-semibold text-text hover:bg-surface-3"
          >
            {t("Get the desktop app")}
          </Link>
        </nav>
      )}
    </div>
  );
}
