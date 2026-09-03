export type Theme = "light" | "dark";
export const THEME_KEY = "iloathepdf-web-theme";

export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function persistTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
}
