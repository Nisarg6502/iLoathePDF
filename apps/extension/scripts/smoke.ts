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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = resolve(ROOT, "dist");
const IMAGES = [resolve(ROOT, "public/icons/icon-128.png"), resolve(ROOT, "public/icons/icon-48.png")];
const PORT = 9300 + Math.floor(Math.random() * 500);
const messages = JSON.parse(readFileSync(resolve(ROOT, "public/_locales/en/messages.json"), "utf8")) as Record<string, { message: string }>;

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

  // The Fit buttons need site access, which the shipped extension only gets
  // from a real click (activeTab) or the user's opt-in. The test loads a copy
  // whose manifest also runs the content script on the local test page; the
  // shipped files are otherwise identical. The checks above still assert the
  // shipped manifest asks for no host access, via the original manifest.
  const extDir = mkdtempSync(join(tmpdir(), "ilp-ext-copy-"));
  cpSync(DIST, extDir, { recursive: true });
  const shipped = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(
    join(extDir, "manifest.json"),
    JSON.stringify({ ...shipped, host_permissions: ["http://127.0.0.1/*"], content_scripts: [{ matches: ["http://127.0.0.1/*"], js: ["content.js"] }] }),
  );
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/form.html")) return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(join(ROOT, "test-page", "form.html")));
    if (req.url === "/logo.png") return void res.writeHead(200, { "content-type": "image/png" }).end(readFileSync(IMAGES[0]));
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const pagePort = (server.address() as AddressInfo).port;

  // Downloads go to a temp folder through the profile's own setting, not
  // CDP's Browser.setDownloadBehavior: that override bypasses the browser's
  // naming, so it would ignore the file name the extension asks for.
  mkdirSync(join(profile, "Default"), { recursive: true });
  writeFileSync(join(profile, "Default", "Preferences"), JSON.stringify({ download: { default_directory: downloads, prompt_for_download: false, directory_upgrade: true } }));

  const proc = spawn(
    browser,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      `--load-extension=${extDir}`,
      `--disable-extensions-except=${extDir}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--no-first-run",
      "--no-default-browser-check",
      // Ubuntu 24.04 runners block the unprivileged user namespaces the
      // browser sandbox needs, and the browser exits at once. CI only.
      ...(process.env.CI ? ["--no-sandbox"] : []),
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  // Kept so a browser that dies at start-up can say why.
  let browserLog = "";
  proc.stderr?.on("data", (d: Buffer) => {
    browserLog = (browserLog + d.toString()).slice(-4000);
  });
  proc.on("exit", (code) => {
    if (code) browserLog += `\n(browser exited with code ${code})`;
  });

  let cdp: Cdp | undefined;
  try {
    const version = await until(
      "the browser's debugging port",
      async () => {
        try {
          return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()) as { webSocketDebuggerUrl: string; Browser: string };
        } catch {
          return null;
        }
      },
      30_000,
    ).catch((e: Error) => {
      throw new Error(`${e.message}\n--- browser output ---\n${browserLog.trim() || "(none)"}`);
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
        if (!/^(chrome-extension|blob|data|about|chrome|devtools|file):/.test(url) && !url.startsWith(`http://127.0.0.1:${pagePort}/`)) offsite.push(url);
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

    /** Runs a function in the target with real arguments, so no value is pasted into code. */
    async function callIn<T>(sessionId: string, fn: (...args: never[]) => unknown, args: unknown[]): Promise<T> {
      const global = (await c.send("Runtime.evaluate", { expression: "globalThis" }, sessionId)) as { result: { objectId: string } };
      const r = (await c.send(
        "Runtime.callFunctionOn",
        { objectId: global.result.objectId, functionDeclaration: fn.toString(), arguments: args.map((value) => ({ value })), awaitPromise: true, returnByValue: true },
        sessionId,
      )) as { result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } };
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
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
    const manifest = await evaluate<{ version: string }>(sw, "chrome.runtime.getManifest()");
    check(manifest.version === JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version, `manifest version ${manifest.version}`);
    // The shipped manifest, not the test copy's.
    check(!(shipped.host_permissions as string[] | undefined)?.length && !shipped.content_scripts, "the shipped manifest asks for no site access at install");

    // 2. The popup.
    const { targetId: popupId } = (await c.send("Target.createTarget", { url: `chrome-extension://${extId}/popup.html` })) as { targetId: string };
    const popup = await attach(popupId);
    await c.send("Page.enable", {}, popup);
    await c.send("DOM.enable", {}, popup);
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

    await evaluate(popup, "document.querySelector('button.primary').click()");
    await until("the PDF in the downloads folder", () => readdirSync(downloads).some((f) => f.endsWith(".pdf")), 20_000).catch(() => {});
    const pdfs = readdirSync(downloads).filter((f) => !f.endsWith(".crdownload"));
    const pdf = pdfs[0] ? readFileSync(join(downloads, pdfs[0])) : null;
    check(pdf && pdf.subarray(0, 5).toString() === "%PDF-", `Make PDF downloads a PDF (${pdfs[0] ?? "nothing"}, ${pdf?.length ?? 0} bytes)`);

    // 3. The fitter page.
    const { targetId: fitId } = (await c.send("Target.createTarget", { url: `chrome-extension://${extId}/fit.html` })) as { targetId: string };
    const fit = await attach(fitId);
    await until("the fitter to load", () => evaluate<boolean>(fit, "document.readyState === 'complete'"));
    await sleep(500);
    check(true, "fitter page loads");

    // 4. The Fit flow on a real page, in the copy of the extension that may
    // run on the local test page (see testCopy). Clicks the real Fit button
    // in our closed shadow root, fits a file, puts it in the form, closes.
    const pageUrl = `http://127.0.0.1:${pagePort}/form.html`;
    const { targetId: pageId } = (await c.send("Target.createTarget", { url: pageUrl })) as { targetId: string };
    const page = await attach(pageId);
    await c.send("DOM.enable", {}, page);
    await until("the page to load", () => evaluate<boolean>(page, "document.readyState === 'complete'"));

    type Node = { nodeId: number; nodeName: string; attributes?: string[]; children?: Node[]; shadowRoots?: Node[]; contentDocument?: Node };
    async function findIn(session: string, test: (n: Node) => boolean): Promise<Node | null> {
      const { root } = (await c.send("DOM.getDocument", { depth: -1, pierce: true }, session)) as { root: Node };
      const stack = [root];
      while (stack.length) {
        const n = stack.pop()!;
        if (test(n)) return n;
        stack.push(...(n.children ?? []), ...(n.shadowRoots ?? []), ...(n.contentDocument ? [n.contentDocument] : []));
      }
      return null;
    }
    const attr = (n: Node, name: string) => {
      const a = n.attributes ?? [];
      const i = a.indexOf(name);
      return i >= 0 && i % 2 === 0 ? a[i + 1] : undefined;
    };
    async function clickNode(session: string, nodeId: number) {
      const { model } = (await c.send("DOM.getBoxModel", { nodeId }, session)) as { model: { content: number[] } };
      const [x1, y1, , , x3, y3] = model.content;
      const x = (x1 + x3) / 2;
      const y = (y1 + y3) / 2;
      for (const type of ["mousePressed", "mouseReleased"]) {
        await c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }, session);
      }
    }

    // Fit buttons are added in the order of the page's fields; the first is
    // the photo field ("less than 100 kb, JPG/JPEG only").
    async function firstFitButton() {
      const { root } = (await c.send("DOM.getDocument", { depth: -1, pierce: true }, page)) as { root: Node };
      const found: Node[] = [];
      const walk = (n: Node) => {
        if (n.nodeName === "BUTTON" && attr(n, "class") === "fit" && attr(n, "hidden") === undefined) found.push(n);
        for (const k of [...(n.shadowRoots ?? []), ...(n.children ?? [])]) walk(k);
      };
      walk(root);
      return found[0] ?? null;
    }
    const fitterFrames = async () => {
      const { targetInfos } = (await c.send("Target.getTargets")) as { targetInfos: { targetId: string; type: string; url: string }[] };
      return targetInfos.filter((t) => t.type === "iframe" && t.url.includes("/fit.html"));
    };
    async function openFitter() {
      const button = await until("a Fit button beside the photo field", firstFitButton).catch(() => null);
      if (!button) return null;
      await clickNode(page, button.nodeId);
      const frame = await until("the fitter iframe", async () => (await fitterFrames())[0]).catch(() => null);
      if (!frame) return null;
      const session = await attach(frame.targetId);
      await c.send("DOM.enable", {}, session);
      const connected = await until("the fitter to connect to the page", () =>
        evaluate<boolean>(session, `document.querySelector('h1')?.textContent === ${JSON.stringify(messages.fitTitle.message)}`),
      ).catch(() => false);
      return { session, connected };
    }
    const closedSoon = () => until("the fitter to close", async () => (await fitterFrames()).length === 0).catch(() => false);

    check(await until("Fit buttons", firstFitButton).catch(() => null), "Fit buttons appear beside the page's file fields");

    // ✕ closes it.
    const first = await openFitter();
    check(first, "clicking Fit opens the fitter over the page");
    if (first) {
      check(first.connected, "the fitter is connected to the field");
      const closeBtn = await findIn(first.session, (n) => n.nodeName === "BUTTON" && attr(n, "class") === "icon");
      if (closeBtn) await clickNode(first.session, closeBtn.nodeId);
      check(await closedSoon(), "the fitter's ✕ closes it");
    }

    // Fit a file and put it in the form; the fitter then closes by itself.
    const second = await openFitter();
    if (second) {
      const picker = await until("the fitter's file picker", () => findIn(second.session, (n) => n.nodeName === "INPUT" && attr(n, "type") === "file"));
      await c.send("DOM.setFileInputFiles", { nodeId: picker.nodeId, files: [IMAGES[0]] }, second.session);
      const putLabel = await until("the fitted result", async () =>
        (await evaluate<string>(second.session, "document.querySelector('section.card button.primary')?.textContent ?? ''")) || null,
      ).catch(() => "");
      check(putLabel === messages.putInForm.message, `the result offers "${messages.putInForm.message}" (got "${putLabel}")`);
      if (putLabel === messages.putInForm.message) {
        await evaluate(second.session, "document.querySelector('section.card button.primary').click()");
        const received = await until("the photo field to receive the file", async () =>
          (await evaluate<string>(page, "document.querySelector('output[for=photo]').textContent")) || null,
        ).catch(() => "");
        check(/\.jpe?g \(\d+ bytes, image\/jpeg\)/.test(received), `the photo field received a JPEG (${received || "nothing"})`);
        check(await closedSoon(), "the fitter closes itself after putting the file in");
      }
    }

    // 5. "Save image as ..." from the right-click menu. CDP can't open a real
    // context menu, so this calls the same function the menu item does.
    const saved = async (name: string) =>
      until(`${name} in the downloads folder`, () => (readdirSync(downloads).includes(name) ? readFileSync(join(downloads, name)) : null), 20_000).catch(() => null);
    for (const [format, file, magic] of [
      ["pdf", "logo.pdf", "%PDF-"],
      ["jpg", "logo.jpg", "ÿØÿ"],
    ] as const) {
      const result = await callIn<string>(
        sw,
        async function (this: unknown, page: string, image: string, as: string) {
          const g = globalThis as unknown as {
            chrome: { tabs: { query(q: { url: string }): Promise<{ id: number }[]> } };
            iloathepdfBackground: { saveImageAs(tab: number, frame: number, url: string, format: string): Promise<void> };
          };
          const [tab] = await g.chrome.tabs.query({ url: page });
          await g.iloathepdfBackground.saveImageAs(tab.id, 0, image, as);
          return "ok";
        },
        [pageUrl, `http://127.0.0.1:${pagePort}/logo.png`, format],
      ).catch((e: unknown) => String(e));
      const bytes = await saved(file);
      check(bytes && bytes.subarray(0, magic.length).toString("latin1") === magic, `Save image as ${format.toUpperCase()} saves ${file} (${result}, ${bytes?.length ?? 0} bytes)`);
    }

    // 6. Overall.
    await sleep(300);
    check(errors.length === 0, `no errors in the worker, popup or fitter${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    check(offsite.length === 0, `no requests to other sites${offsite.length ? `: ${offsite.join(", ")}` : ""}`);
  } finally {
    cdp?.close();
    proc.kill();
    await sleep(800);
    server.close();
    for (const dir of [profile, downloads, extDir]) {
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
