import { useEffect, useState } from "react";
import { getInitialTheme, applyTheme, persistTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      title="Toggle theme"
      className="grid size-[30px] flex-none place-items-center rounded-lg border border-border text-muted hover:border-border-hi hover:text-text"
    >
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M9 2.2a6.8 6.8 0 0 0 0 13.6 6.8 6.8 0 0 1 0-13.6z" fill="currentColor" stroke="none" opacity="0.75" />
        <circle cx="9" cy="9" r="6.8" />
      </svg>
    </button>
  );
}
