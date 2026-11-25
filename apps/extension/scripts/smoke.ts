/**
 * Loads the built extension into a real Chromium browser and checks it end to
 * end over the DevTools protocol:
 *
 *   npm run build --workspace=apps/extension
 *   npm run smoke --workspace=apps/extension            (finds Chrome or Edge)
 *   BROWSER=/path/to/chrome npm run smoke --workspace=apps/extension
 *
 * 1. The extension installs and its service worker starts (a manifest or
 *    worker error fails here).
 * 2. The popup opens without errors; two images added through its own file
 *    picker are stored and listed; "Make PDF" downloads a real PDF.
 * 3. The fitter page (fit.html) opens without errors.
 * 4. Nothing anywhere makes a network request to another site.
 *
 * Not covered: the toolbar click and right-click items themselves (browser
 * UI the protocol can't press), and the Fit buttons on a page, which need the
 * activeTab grant that only a real click gives. Those are covered by the
 * jsdom tests and need a manual pass.
 *
 * Branded Chrome 137+ ignores --load-extension; the flag below turns that back
 * on where the browser still allows it. Chrome for Testing and Chromium always
 * allow it.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = resolve(ROOT, "dist");
const IMAGES = [resolve(ROOT, "public/icons/icon-128.png"), resolve(ROOT, "public/icons/icon-48.png")];
const PORT = 9300 + Math.floor(Math.random() * 500);

function findBrowser(): string {
  if (process.env.BROWSER) return process.env.BROWSER;
  // Edge and Chromium first: branded Chrome 137+ ignores --load-extension.
  const candidates = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/microsoft-edge",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("No Chrome or Edge found; set BROWSER=/path/to/browser");
  return found;
}

type Msg = { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message: string }; sessionId?: string };

class Cdp {
  private next = 1;
  private pending = new Map<number, { resolve(v: Record<string, unknown>): void; reject(e: Error): void }>();
  private listeners: ((m: Msg) => void)[] = [];
  private ws: WebSocket;
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data)) as Msg;
      if (m.id !== undefined) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) p?.reject(new Error(m.error.message));
        else p?.resolve(m.result ?? {});
      } else this.listeners.forEach((l) => l(m));
    });
  }
  static async connect(url: string) {
    const ws = new WebSocket(url);
    await new Promise((ok, fail) => {
      ws.addEventListener("open", ok, { once: true });
      ws.addEventListener("error", fail, { once: true });
    });
    return new Cdp(ws);
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise<Record<string, unknown>>((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(fn: (m: Msg) => void) {
    this.listeners.push(fn);
  }
  close() {
    this.ws.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(what: string, fn: () => Promise<T | undefined | null | false> | T | undefined | null | false, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(150);
  }
}

const failures: string[] = [];
function check(ok: unknown, label: string) {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}`);
  if (!ok) failures.push(label);
}

async function main() {
  if (!existsSync(join(DIST, "manifest.json"))) throw new Error("Build first: npm run build --workspace=apps/extension");
  const browser = findBrowser();
  const profile = mkdtempSync(join(tmpdir(), "ilp-ext-smoke-"));
  const downloads = mkdtempSync(join(tmpdir(), "ilp-ext-dl-"));
  console.log(`Browser: ${browser}`);

  const proc = spawn(
    browser,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      `--load-extension=${DIST}`,
      `--disable-extensions-except=${DIST}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let cdp: Cdp | undefined;
  try {
    const version = await until("the browser's debugging port", async () => {
      try {
        return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()) as { webSocketDebuggerUrl: string; Browser: string };
      } catch {
        return null;
      }
    });
    console.log(`Version: ${version.Browser}`);
    cdp = await Cdp.connect(version.webSocketDebuggerUrl);
    const c = cdp;

    // Every request any page or worker makes; anything not local is a failure.
    const offsite: string[] = [];
    const errors: string[] = [];
    c.on((m) => {
      if (m.method === "Network.requestWillBeSent") {
        const url = String((m.params as { request: { url: string } }).request.url);
        if (!/^(chrome-extension|blob|data|about|chrome|devtools|file):/.test(url)) offsite.push(url);
      }
      if (m.method === "Runtime.exceptionThrown") {
        const d = (m.params as { exceptionDetails: { text: string; exception?: { description?: string } } }).exceptionDetails;
        errors.push(d.exception?.description ?? d.text);
      }
      if (m.method === "Runtime.consoleAPICalled" && (m.params as { type: string }).type === "error") {
        errors.push(JSON.stringify((m.params as { args: unknown[] }).args));
      }
    });
    async function attach(targetId: string) {
      const { sessionId } = (await c.send("Target.attachToTarget", { targetId, flatten: true })) as { sessionId: string };
      await c.send("Runtime.enable", {}, sessionId);
      await c.send("Network.enable", {}, sessionId).catch(() => {});
      return sessionId;
    }
    async function evaluate<T>(sessionId: string, expression: string): Promise<T> {
      const r = (await c.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId)) as {
        result: { value: T };
        exceptionDetails?: { text: string };
      };
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    }

    // 1. The service worker. The browser's own component extensions have
    // workers too, so pick ours by its manifest.
    const ours = await until("the extension's service worker", async () => {
      const { targetInfos } = (await c.send("Target.getTargets")) as { targetInfos: { targetId: string; type: string; url: string }[] };
      for (const t of targetInfos.filter((t) => t.type === "service_worker" && t.url.startsWith("chrome-extension://"))) {
        const session = await attach(t.targetId);
        const name = await evaluate<string>(session, "chrome.runtime.getManifest().short_name").catch(() => "");
        if (name === "iLoathePDF") return { worker: t, session };
        await c.send("Target.detachFromTarget", { sessionId: session });
      }
      return null;
    }).catch(() => null);
    check(ours, "extension installed and its service worker started");
    if (!ours) throw new Error("The browser did not load the extension (branded Chrome 137+ may block --load-extension; try Edge, Chromium or Chrome for Testing).");
    const extId = new URL(ours.worker.url).host;
    const sw = ours.session;
    const manifest = await evaluate<{ name: string; version: string; permissions: string[]; host_permissions?: string[] }>(sw, "chrome.runtime.getManifest()");
    check(manifest.version === JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version, `manifest version ${manifest.version}`);
    check(!manifest.host_permissions?.length, "no host permissions granted at install");
    const granted = await evaluate<{ origins: string[] }>(sw, "chrome.permissions.getAll()");
    check(granted.origins.length === 0, "no site access granted after install");

    // 2. The popup.
    const { targetId: popupId } = (await c.send("Target.createTarget", { url: `chrome-extension://${extId}/popup.html` })) as { targetId: string };
    const popup = await attach(popupId);
    await c.send("Page.enable", {}, popup);
    await c.send("DOM.enable", {}, popup);
    await c.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
    await until("the popup to render", () => evaluate<boolean>(popup, "!!document.querySelector('button.primary') || document.body.innerText.length > 20"));
    const text = await evaluate<string>(popup, "document.body.innerText");
    check(text.length > 20, "popup renders");

    await until("the popup's image picker", () => evaluate<boolean>(popup, "!!document.querySelector('input[type=file]')"));
    const { root } = (await c.send("DOM.getDocument", { depth: -1 }, popup)) as { root: { nodeId: number } };
    const { nodeId } = (await c.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" }, popup)) as { nodeId: number };
    check(nodeId, "popup has its image picker");
    await c.send("DOM.setFileInputFiles", { nodeId, files: IMAGES }, popup);
    const rows = await until("the two images to be listed", async () => {
      const n = await evaluate<number>(popup, "document.querySelectorAll('li.row').length");
      return n >= 2 ? n : null;
    }).catch(() => 0);
    check(rows === 2, `images added from the computer are listed (${rows})`);

    const done = new Promise<string>((ok) =>
      c.on((m) => {
        const p = m.params as { state?: string; guid?: string } | undefined;
        if (m.method === "Browser.downloadProgress" && p?.state === "completed") ok(p.guid!);
      }),
    );
    await evaluate(popup, "document.querySelector('button.primary').click()");
    await Promise.race([done, sleep(20_000)]);
    const pdfs = readdirSync(downloads).filter((f) => !f.endsWith(".crdownload"));
    const pdf = pdfs[0] ? readFileSync(join(downloads, pdfs[0])) : null;
    check(pdf && pdf.subarray(0, 5).toString() === "%PDF-", `Make PDF downloads a PDF (${pdfs[0] ?? "nothing"}, ${pdf?.length ?? 0} bytes)`);

    // 3. The fitter page.
    const { targetId: fitId } = (await c.send("Target.createTarget", { url: `chrome-extension://${extId}/fit.html` })) as { targetId: string };
    const fit = await attach(fitId);
    await until("the fitter to load", () => evaluate<boolean>(fit, "document.readyState === 'complete'"));
    await sleep(500);
    check(true, "fitter page loads");

    // 4. Overall.
    await sleep(300);
    check(errors.length === 0, `no errors in the worker, popup or fitter${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    check(offsite.length === 0, `no requests to other sites${offsite.length ? `: ${offsite.join(", ")}` : ""}`);
  } finally {
    cdp?.close();
    proc.kill();
    await sleep(800);
    for (const dir of [profile, downloads]) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // The browser may still hold a file for a moment; the OS temp folder is cleaned eventually.
      }
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll smoke checks passed.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
