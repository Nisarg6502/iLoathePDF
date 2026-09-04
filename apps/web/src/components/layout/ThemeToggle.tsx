import { useEffect, useState } from "react";
import { getInitialTheme, applyTheme, persistTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle color theme"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      className="relative flex h-7 w-13 flex-none items-center rounded-full border border-border-hi p-0.5 transition-[background] duration-300"
      style={{ background: isDark ? "var(--toggle-track-dark)" : "var(--toggle-track-light)" }}
    >
      {/* Sun/moon glyph colors are fixed iconography, not page-theme colors — they represent the switch's own two states regardless of the current site theme. */}
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute left-1.5 transition-opacity duration-200"
        style={{ opacity: isDark ? 0.35 : 1 }}
      >
        <circle cx="8" cy="8" r="3.4" fill="#f6c453" />
        <path
          d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1"
          stroke="#f6c453"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-1.5 transition-opacity duration-200"
        style={{ opacity: isDark ? 1 : 0.35 }}
      >
        <path d="M13.5 9.5A5.8 5.8 0 0 1 6.5 2.5a5.8 5.8 0 1 0 7 7z" fill="#cbd5f5" />
      </svg>
      <span
        className="relative z-10 size-6 flex-none rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-[var(--ease-out-strong)] active:scale-90"
        style={{ transform: isDark ? "translateX(24px)" : "translateX(0px)" }}
      />
    </button>
  );
}
