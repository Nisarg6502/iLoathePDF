/**
 * The content script's UI: a small "Fit" button beside every file input, and
 * the fitter (an extension page in an iframe) over the page when one is
 * clicked. Everything sits in one closed shadow root on <html>, positioned
 * with `position: fixed` from the inputs' boxes, so the page's own DOM around
 * its inputs is never changed and its CSS can't reach our elements.
 *
 * No file work happens here: the fitter page does that. This file only reads
 * the field's constraints and, at the end, puts the finished file in the field.
 */
import { readConstraints, nearestFileInput, ROOT_TAG } from "./context";
import { setInputFiles } from "./apply";
import { t } from "../shared/i18n";
import type { FitterInit, FitterMessage, FitterReply } from "../shared/messages";

const ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#E89800"/><path d="M19 9H37L48 20V52a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3Z" fill="#FFFDF8"/><path d="M37 9V17a3 3 0 0 0 3 3H48Z" fill="#F3C978"/><rect x="9" y="30.5" width="46" height="10" rx="1.2" fill="#1E1813"/></svg>`;

const BUTTON_HEIGHT = 24;
const GAP = 6;

export interface FitUiOptions {
  /** URL of fit.html (chrome.runtime.getURL in the extension). */
  fitterUrl: string;
  /**
   * Origins the fitter document may have. With Chrome's use_dynamic_url the
   * iframe loads from a per-session URL, but the document inside runs at the
   * extension's fixed origin, so both are listed (see open()).
   */
  fitterOrigins: string[];
  css: string;
}

export interface FitUi {
  /** Finds file inputs and places their buttons. */
  refresh(): void;
  inputs(): HTMLInputElement[];
  open(input: HTMLInputElement): void;
  /** Opens the fitter for the field the user right-clicked, or the only field; otherwise points at the buttons. */
  openBest(index?: number): void;
  toast(text: string, tone?: "info" | "error"): void;
  /** The handler the fitter's port messages go to (exposed for tests). */
  handleFitterMessage(input: HTMLInputElement, message: FitterMessage, reply: (r: FitterReply) => void): void;
  /** Our closed shadow root. Only the content script holds this reference; the page can't reach it. */
  readonly root: ShadowRoot;
  destroy(): void;
}

function isRendered(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return !style || style.visibility !== "hidden";
}

/** What the button sits next to: the input, or for a hidden input the label or box that stands in for it. */
function anchorFor(input: HTMLInputElement): Element | null {
  if (isRendered(input)) return input;
  for (const label of Array.from(input.labels ?? [])) if (isRendered(label)) return label;
  for (let el = input.parentElement, i = 0; el && i < 3; el = el.parentElement, i++) {
    if (el.querySelectorAll('input[type="file" i]').length > 1) break;
    if (isRendered(el)) return el;
  }
  return null;
}

export function createFitUi(doc: Document, options: FitUiOptions): FitUi {
  const win = doc.defaultView!;
  const host = doc.createElement(ROOT_TAG.toLowerCase());
  const shadow = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("style");
  style.textContent = options.css;
  shadow.append(style);
  doc.documentElement.append(host);

  const buttons = new Map<HTMLInputElement, HTMLButtonElement>();
  let lastContextTarget: EventTarget | null = null;
  let overlay: { el: HTMLElement; port?: MessagePort; input: HTMLInputElement; onHello?: (e: MessageEvent) => void } | null = null;
  let toastEl: HTMLElement | null = null;
  let toastTimer = 0;
  let frame = 0;

  const fileInputs = () =>
    Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="file" i]')).filter((i) => !i.disabled);

  function position() {
    frame = 0;
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    for (const [input, button] of buttons) {
      const anchor = anchorFor(input);
      const r = anchor?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) {
        button.hidden = true;
        continue;
      }
      button.hidden = false;
      const width = button.offsetWidth || 52;
      const left = r.right + GAP + width <= vw ? r.right + GAP : Math.max(0, r.right - width);
      button.style.left = `${Math.round(left)}px`;
      button.style.top = `${Math.round(r.top + (r.height - BUTTON_HEIGHT) / 2)}px`;
    }
  }

  function schedule() {
    if (!frame) frame = win.requestAnimationFrame(position);
  }

  function refresh() {
    const current = new Set(fileInputs());
    for (const [input, button] of buttons) {
      if (!current.has(input)) {
        button.remove();
        buttons.delete(input);
      }
    }
    for (const input of current) {
      if (buttons.has(input)) continue;
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "fit";
      button.title = t("fitButtonTitle");
      button.setAttribute("aria-label", t("fitButtonTitle"));
      button.innerHTML = ICON;
      button.append(doc.createTextNode(t("fitButton")));
      button.hidden = true;
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        open(input);
      });
      shadow.append(button);
      buttons.set(input, button);
    }
    position();
  }

  function close() {
    if (!overlay) return;
    const { el, port, input, onHello } = overlay;
    overlay = null;
    port?.close();
    if (onHello) win.removeEventListener("message", onHello);
    el.remove();
    doc.removeEventListener("keydown", onKey, true);
    (anchorFor(input) as HTMLElement | null)?.focus?.();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  function handleFitterMessage(input: HTMLInputElement, message: FitterMessage, reply: (r: FitterReply) => void) {
    if (message.type === "close") {
      close();
    } else if (message.type === "apply") {
      if (!input.isConnected) {
        reply({ type: "applied", ok: false, gone: true });
        return;
      }
      reply({ type: "applied", ok: setInputFiles(input, message.files) });
    }
  }

  function open(input: HTMLInputElement) {
    close();
    const url = options.fitterUrl;
    const origins = new Set(options.fitterOrigins);
    const backdrop = doc.createElement("div");
    backdrop.className = "backdrop";
    const iframe = doc.createElement("iframe");
    iframe.src = url;
    iframe.title = t("overlayTitle");
    backdrop.append(iframe);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    shadow.append(backdrop);
    const current: NonNullable<typeof overlay> = { el: backdrop, input };
    overlay = current;
    doc.addEventListener("keydown", onKey, true);

    // The fitter speaks first ("hello") and the reply goes to the origin the
    // hello really came from, provided it is our iframe and one of our own
    // origins. Posting to the URL's origin instead fails silently in Chrome,
    // whose dynamic web-accessible URLs differ from the document's origin.
    // The reply carries a private channel: the page can't read messages on
    // it, and nothing is ever sent to an origin that isn't the extension.
    current.onHello = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow || !origins.has(e.origin) || (e.data as { type?: string } | null)?.type !== "iloathepdf:hello") return;
      if (overlay !== current || current.port) return;
      win.removeEventListener("message", current.onHello!);
      const channel = new MessageChannel();
      current.port = channel.port1;
      channel.port1.onmessage = (m: MessageEvent<FitterMessage>) => handleFitterMessage(input, m.data, (r) => channel.port1.postMessage(r));
      const init: FitterInit = { type: "iloathepdf:init", constraints: readConstraints(input), host: win.location.hostname };
      iframe.contentWindow?.postMessage(init, e.origin, [channel.port2]);
      iframe.focus();
    };
    win.addEventListener("message", current.onHello);
  }

  function toast(text: string, tone: "info" | "error" = "info") {
    toastEl?.remove();
    win.clearTimeout(toastTimer);
    const el = doc.createElement("div");
    el.className = `toast ${tone}`;
    el.setAttribute("role", tone === "error" ? "alert" : "status");
    el.textContent = text;
    shadow.append(el);
    toastEl = el;
    toastTimer = win.setTimeout(() => el.remove(), tone === "error" ? 10_000 : 6_000);
  }

  function openBest(index?: number) {
    refresh();
    const inputs = fileInputs();
    if (index !== undefined && inputs[index]) return open(inputs[index]);
    const near = nearestFileInput(lastContextTarget);
    if (near) return open(near);
    if (inputs.length === 1) return open(inputs[0]);
    if (inputs.length === 0) return toast(t("toastNoFields"));
    toast(t("toastPickField"));
    for (const button of buttons.values()) {
      button.classList.remove("flash");
      void button.offsetWidth;
      button.classList.add("flash");
    }
  }

  const onContext = (e: Event) => {
    lastContextTarget = e.target;
  };
  doc.addEventListener("contextmenu", onContext, true);
  win.addEventListener("scroll", schedule, { capture: true, passive: true });
  win.addEventListener("resize", schedule, { passive: true });
  let mutationTimer = 0;
  const observer = new win.MutationObserver(() => {
    win.clearTimeout(mutationTimer);
    mutationTimer = win.setTimeout(refresh, 250);
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["type", "hidden", "style", "class", "disabled"] });
  // Layout can move inputs without any DOM change (fonts loading, images).
  const interval = win.setInterval(schedule, 1000);

  refresh();

  return {
    refresh,
    inputs: fileInputs,
    open,
    openBest,
    toast,
    handleFitterMessage,
    root: shadow,
    destroy() {
      observer.disconnect();
      win.clearInterval(interval);
      doc.removeEventListener("contextmenu", onContext, true);
      win.removeEventListener("scroll", schedule, { capture: true });
      win.removeEventListener("resize", schedule);
      close();
      host.remove();
    },
  };
}
