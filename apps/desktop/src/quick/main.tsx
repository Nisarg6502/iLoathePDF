import { createRoot } from "react-dom/client";
import "@iloathepdf/i18n/fonts.css";
import "../index.css";
import { startI18n } from "../lib/i18n";
import QuickApp from "./QuickApp";

// The same theme the main window uses (AppShell's useTheme), read once.
function applyTheme(): void {
  let theme: string | null = null;
  try {
    theme = localStorage.getItem("iloathepdf.theme");
  } catch {
    /* private storage unavailable: follow Windows */
  }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
}

applyTheme();
// No StrictMode here: this window starts real jobs from effects, and a
// development-only double start would run each one twice.
void startI18n().then(() => {
  createRoot(document.getElementById("root")!).render(<QuickApp />);
});
