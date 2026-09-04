import { NavLink, Link } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/tools", label: "Tools" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/privacy", label: "Privacy" },
];

export function SiteHeader() {
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-bg">
      <div className="mx-auto flex h-[62px] max-w-6xl items-center gap-8 px-8">
        <Link to="/" className="flex flex-none items-center gap-2">
          <span className="grid size-[22px] place-items-center rounded-md bg-accent">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--on-accent)" strokeWidth="1.7">
              <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.4" />
              <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight">iLoathePDF</span>
        </Link>

        <nav className="flex items-center gap-0.5">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors duration-150 hover:bg-surface-2 ${isActive ? "text-text" : "text-muted"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        <ThemeToggle />
        <Link
          to="/download"
          className="flex h-8 flex-none items-center gap-1.5 rounded-[9px] border border-border-hi bg-surface-2 px-3.5 text-[13px] font-semibold text-text transition-transform duration-100 hover:bg-surface-3 active:scale-[0.96]"
        >
          Desktop app
        </Link>
      </div>
    </div>
  );
}
