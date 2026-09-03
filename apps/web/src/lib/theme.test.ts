import { describe, it, expect, beforeEach, vi } from "vitest";
import { getInitialTheme, persistTheme, THEME_KEY } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads a persisted theme over the system preference", () => {
    localStorage.setItem(THEME_KEY, "light");
    expect(getInitialTheme()).toBe("light");
  });

  it("falls back to the system preference when nothing is persisted", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("dark"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    expect(getInitialTheme()).toBe("dark");
    vi.unstubAllGlobals();
  });

  it("persists a theme choice", () => {
    persistTheme("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  });
});
