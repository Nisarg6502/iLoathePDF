/**
 * Content script. Injected into a tab when the user clicks the toolbar button
 * or a right-click item (activeTab), or registered for sites they opted into.
 * Running it twice is harmless: the second run does nothing.
 */
import css from "./content.css?inline";
import { createFitUi, type FitUi } from "./ui";
import type { ContentRequest, ScanResult } from "../shared/messages";

const FLAG = "__iloathepdfContent";
const scope = globalThis as unknown as Record<string, unknown>;

if (!scope[FLAG]) {
  scope[FLAG] = true;
  let ui: FitUi | null = null;
  const fitterUrl = chrome.runtime.getURL("fit.html");
  // The URL's own origin (Firefox, and Chrome without dynamic URLs), and
  // Chrome's fixed extension origin, where a dynamic-URL document really runs.
  const fitterOrigins = [new URL(fitterUrl).origin, `chrome-extension://${chrome.runtime.id}`];
  const start = () => (ui ??= createFitUi(document, { fitterUrl, fitterOrigins, css }));

  start();

  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const message = raw as ContentRequest;
    const fit = start();
    switch (message?.type) {
      case "iloathepdf:scan": {
        // Only the top frame answers, so the popup gets one count.
        if (window !== window.top) return;
        const result: ScanResult = { count: fit.inputs().length, host: location.hostname };
        sendResponse(result);
        return;
      }
      case "iloathepdf:open":
        if (window !== window.top && fit.inputs().length === 0) return;
        fit.openBest(message.index);
        sendResponse(true);
        return;
      case "iloathepdf:toast":
        if (window !== window.top) return;
        fit.toast(message.text, message.tone);
        sendResponse(true);
        return;
    }
  });
}
