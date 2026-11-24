import { initI18n, matchLanguage } from "@iloathepdf/i18n";
import { uiLanguage } from "../shared/i18n";

export { formatBytes } from "@/lib/formatBytes";

type Props = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

/** Tiny element builder: h("button", { class: "primary", onclick }, "Go"). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = String(value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

/**
 * The engines report errors through packages/i18n (the website's catalogs).
 * Start it in the browser's language so those messages are translated too.
 */
export async function initEngineStrings(): Promise<void> {
  const language = matchLanguage([uiLanguage()]) ?? "en";
  await initI18n({ language });
}
