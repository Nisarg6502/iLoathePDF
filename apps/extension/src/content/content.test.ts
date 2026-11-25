import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readConstraints, nearestFileInput } from "./context";
import { setInputFiles } from "./apply";
import { createFitUi, type FitUi } from "./ui";
import { installDataTransfer } from "./testDataTransfer";
import type { FitterReply } from "../shared/messages";

const PAGE = readFileSync(join(import.meta.dirname, "../../test-page/form.html"), "utf8");
const FITTER = "chrome-extension://abcdefghijklmnop/fit.html";
const STATIC_ORIGIN = "chrome-extension://abcdefghijklmnop";
const DYNAMIC_ORIGIN = "chrome-extension://0b5e7c1a-1111-4d2e-9c3b-123456789abc";
const DYNAMIC_FITTER = `${DYNAMIC_ORIGIN}/fit.html`;

function loadPage() {
  const parsed = new DOMParser().parseFromString(PAGE, "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
  // jsdom does no layout; give every visible input a box.
  for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))) {
    const hidden = input.closest(".dropzone") !== null || input.id === "avatar";
    input.getBoundingClientRect = () =>
      (hidden ? new DOMRect(0, 0, 0, 0) : new DOMRect(100, 100 + 40 * Array.from(document.querySelectorAll("input")).indexOf(input), 200, 24));
  }
  const avatarLabel = document.querySelector<HTMLElement>('label[for="avatar"]')!;
  avatarLabel.getBoundingClientRect = () => new DOMRect(100, 400, 300, 60);
}

const $ = (id: string) => document.getElementById(id) as HTMLInputElement;

beforeAll(() => installDataTransfer());
beforeEach(loadPage);

describe("readConstraints on the test page", () => {
  it("reads a table row's helper text and the accept attribute", () => {
    expect(readConstraints($("photo"))).toMatchObject({
      accept: "image/jpeg",
      multiple: false,
      maxBytes: 100_000,
      formats: ["jpeg"],
      source: "text",
      evidence: "Photograph Size should be less than 100 kb",
    });
  });

  it("reads a range", () => {
    expect(readConstraints($("signature"))).toMatchObject({ minBytes: 10 * 1024, maxBytes: 20_000 });
  });

  it("reads the label", () => {
    expect(readConstraints($("certificate"))).toMatchObject({ maxBytes: 500_000, formats: ["pdf"], label: "Caste certificate (PDF, max 500 KB)" });
  });

  it("reads aria-describedby and multiple", () => {
    expect(readConstraints($("docs"))).toMatchObject({ multiple: true, maxBytes: 2_000_000, accept: "" });
  });

  it("prefers a size attribute over text", () => {
    expect(readConstraints($("avatar"))).toMatchObject({ maxBytes: 204800, source: "attribute" });
  });

  it("doesn't borrow another field's limit from a shared container", () => {
    document.body.innerHTML = `<div>Photo max 50 KB <input type="file" id="a"> Signature max 20 KB <input type="file" id="b"></div>`;
    expect(readConstraints($("a")).source).toBe("none");
  });

  it("ignores script text", () => {
    document.body.innerHTML = `<div><script>var limit = "max 1 KB";</script><input type="file" id="a"></div>`;
    expect(readConstraints($("a")).maxBytes).toBeUndefined();
  });
});

describe("nearestFileInput", () => {
  it("finds the field from a right-click on it, its label or its row", () => {
    expect(nearestFileInput($("photo"))).toBe($("photo"));
    expect(nearestFileInput(document.querySelector('label[for="certificate"]'))).toBe($("certificate"));
    expect(nearestFileInput($("photo").parentElement!.previousElementSibling)).toBe($("photo"));
    expect(nearestFileInput(document.querySelector("h1"))).toBeNull();
  });
});

describe("setInputFiles", () => {
  it("sets the files and fires input and change, bubbling", () => {
    const events: string[] = [];
    document.addEventListener("input", (e) => events.push(`input:${(e.target as HTMLElement).id}`));
    document.addEventListener("change", (e) => events.push(`change:${(e.target as HTMLElement).id}`));
    const file = new File(["x".repeat(50)], "photo.jpg", { type: "image/jpeg" });

    expect(setInputFiles($("photo"), [file])).toBe(true);
    expect($("photo").files?.[0]).toBe(file);
    expect(events).toEqual(["input:photo", "change:photo"]);
  });

  it("refuses several files for a single-file field", () => {
    const a = new File(["a"], "a.jpg");
    const b = new File(["b"], "b.jpg");
    expect(setInputFiles($("photo"), [a, b])).toBe(false);
    expect(setInputFiles($("docs"), [a, b])).toBe(true);
    expect($("docs").files?.length).toBe(2);
  });
});

describe("the injected UI", () => {
  let ui: FitUi;
  beforeEach(() => {
    ui = createFitUi(document, { fitterUrl: FITTER, fitterOrigins: [STATIC_ORIGIN], css: ".fit{}" });
  });
  afterEach(() => ui.destroy());

  it("adds one button per file input, inside a shadow root, without touching the form", () => {
    const formBefore = document.getElementById("application")!.innerHTML;
    const buttons = ui.root.querySelectorAll("button.fit");
    expect(buttons).toHaveLength(5);
    expect(document.querySelectorAll("button.fit")).toHaveLength(0);
    expect(document.getElementById("application")!.innerHTML).toBe(formBefore);
    expect(document.documentElement.lastElementChild?.tagName).toBe("ILOATHEPDF-ROOT");
  });

  it("places a button beside its input, and beside the label of a hidden input", () => {
    const [photo, , , , avatar] = Array.from(ui.root.querySelectorAll<HTMLButtonElement>("button.fit"));
    expect(photo.hidden).toBe(false);
    expect(photo.style.left).toBe("306px");
    expect(avatar.hidden).toBe(false);
    expect(avatar.style.top).toBe(`${400 + (60 - 24) / 2}px`);
  });

  it("follows inputs added and removed later", async () => {
    vi.useFakeTimers();
    try {
      const extra = document.createElement("input");
      extra.type = "file";
      document.body.append(extra);
      ui.refresh();
      expect(ui.root.querySelectorAll("button.fit")).toHaveLength(6);
      extra.remove();
      ui.refresh();
      expect(ui.root.querySelectorAll("button.fit")).toHaveLength(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the fitter in an iframe over the page when a button is clicked", () => {
    ui.root.querySelector<HTMLButtonElement>("button.fit")!.click();
    const iframe = ui.root.querySelector("iframe");
    expect(iframe?.src).toBe(FITTER);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(ui.root.querySelector("iframe")).toBeNull();
  });

  it("connects to the fitter when it says hello from the extension's real origin", () => {
    // Chrome's use_dynamic_url: the iframe is loaded from a per-session URL,
    // but the document inside runs at the extension's fixed origin. A message
    // posted to the dynamic origin is silently dropped, so the fitter speaks
    // first and the reply goes to the origin it really has.
    ui.destroy();
    ui = createFitUi(document, { fitterUrl: DYNAMIC_FITTER, fitterOrigins: [DYNAMIC_ORIGIN, STATIC_ORIGIN], css: "" });
    ui.root.querySelector<HTMLButtonElement>("button.fit")!.click();
    const frame = ui.root.querySelector("iframe")!.contentWindow!;
    const posted = vi.spyOn(frame, "postMessage").mockImplementation(() => {});
    const hello = (origin: string, source: Window = frame) =>
      window.dispatchEvent(new MessageEvent("message", { origin, source, data: { type: "iloathepdf:hello" } }));

    hello("https://evil.example");
    hello(STATIC_ORIGIN, window);
    expect(posted).not.toHaveBeenCalled();

    hello(STATIC_ORIGIN);
    expect(posted).toHaveBeenCalledTimes(1);
    const [init, target, transfer] = posted.mock.calls[0] as unknown as [{ type: string; constraints: { maxBytes?: number } }, string, MessagePort[]];
    expect(init.type).toBe("iloathepdf:init");
    expect(init.constraints.maxBytes).toBe(100_000);
    expect(target).toBe(STATIC_ORIGIN);
    expect(transfer).toHaveLength(1);

    hello(STATIC_ORIGIN);
    expect(posted).toHaveBeenCalledTimes(1);
  });

  it("puts the fitter's result into the field and reports back", () => {
    const replies: FitterReply[] = [];
    const file = new File(["jpeg bytes"], "photo.jpg", { type: "image/jpeg" });
    ui.handleFitterMessage($("photo"), { type: "apply", files: [file] }, (r) => replies.push(r));
    expect(replies).toEqual([{ type: "applied", ok: true }]);
    expect($("photo").files?.[0]?.name).toBe("photo.jpg");

    const gone = $("photo");
    gone.remove();
    ui.handleFitterMessage(gone, { type: "apply", files: [file] }, (r) => replies.push(r));
    expect(replies[1]).toEqual({ type: "applied", ok: false, gone: true });
  });

  it("opens the right-clicked field, or points at the buttons when it can't tell", () => {
    document.querySelector('label[for="certificate"]')!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    ui.openBest();
    expect(ui.root.querySelector("iframe")).not.toBeNull();

    document.querySelector("h1")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    ui.openBest();
    expect(ui.root.querySelector(".toast")?.textContent).toMatch(/Click the Fit button/);
  });
});
