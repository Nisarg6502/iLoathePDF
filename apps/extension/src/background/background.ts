/**
 * Background worker (a service worker in Chrome/Edge, an event page in
 * Firefox). It owns the right-click items and fetches the bytes of an image
 * the user right-clicked. It never processes files and never sends anything
 * anywhere: the only requests it makes are for that image, which the page is
 * already showing (usually served from the browser's cache).
 */
import { t } from "../shared/i18n";
import { addImage, countImages, imageNameFromUrl } from "../shared/imageStore";
import { CONTENT_SCRIPT, type ContentRequest, type ConverterReply, type ConverterRequest } from "../shared/messages";
import { renameFor, SAVE_FORMATS, type SaveFormat } from "../shared/saveFormats";
import { PDF_IMAGE_TYPES, sniffImageType } from "../shared/sniff";
import { pruneRegistrations } from "../shared/sites";

const MENU_ADD_IMAGE = "add-image";
const MENU_FIT_FORM = "fit-form";
const MENU_SAVE_PREFIX = "save-as-";
const MAX_IMAGE_BYTES = 50_000_000;
const SAVE_TITLES = { pdf: "menuSavePdf", jpg: "menuSaveJpg", png: "menuSavePng" } as const satisfies Record<SaveFormat, string>;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll().then(() => {
    // More than one item on an image, so the browser groups them under
    // "iLoathePDF" in the right-click menu.
    for (const format of SAVE_FORMATS) chrome.contextMenus.create({ id: MENU_SAVE_PREFIX + format, title: t(SAVE_TITLES[format]), contexts: ["image"] });
    chrome.contextMenus.create({ id: MENU_ADD_IMAGE, title: t("menuAddImage"), contexts: ["image"] });
    chrome.contextMenus.create({ id: MENU_FIT_FORM, title: t("menuFitForm"), contexts: ["page", "frame", "editable", "link"] });
  });
  void updateBadge();
  void pruneRegistrations().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  void updateBadge();
  void pruneRegistrations().catch(() => {});
});

// The popup tells us when it changed the list, so the badge stays right.
chrome.runtime.onMessage.addListener((message) => {
  if ((message as { type?: string })?.type === "iloathepdf:images-changed") void updateBadge();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined) return;
  if (info.menuItemId === MENU_FIT_FORM) void fitForm(tab.id, info.frameId ?? 0);
  else if (info.menuItemId === MENU_ADD_IMAGE && info.srcUrl) void addImageFrom(tab.id, info.frameId ?? 0, info.srcUrl);
  else if (String(info.menuItemId).startsWith(MENU_SAVE_PREFIX) && info.srcUrl) {
    const format = String(info.menuItemId).slice(MENU_SAVE_PREFIX.length) as SaveFormat;
    if (SAVE_FORMATS.includes(format)) void saveImageAs(tab.id, info.frameId ?? 0, info.srcUrl, format);
  }
});

async function updateBadge(): Promise<void> {
  const n = await countImages().catch(() => 0);
  await chrome.action.setBadgeBackgroundColor({ color: "#E89800" });
  await chrome.action.setBadgeText({ text: n > 0 ? String(n) : "" });
}

async function inject(tabId: number, frameIds?: number[]): Promise<void> {
  await chrome.scripting.executeScript({ target: frameIds ? { tabId, frameIds } : { tabId }, files: [CONTENT_SCRIPT] });
}

async function send(tabId: number, message: ContentRequest, frameId = 0): Promise<void> {
  await chrome.tabs.sendMessage(tabId, message, { frameId });
}

async function toast(tabId: number, text: string, tone: "info" | "error" = "info"): Promise<void> {
  try {
    await inject(tabId);
    await send(tabId, { type: "iloathepdf:toast", text, tone });
  } catch {
    /* a page we can't touch (browser pages, the web store) */
  }
}

async function fitForm(tabId: number, frameId: number): Promise<void> {
  try {
    await inject(tabId, [frameId]);
    await send(tabId, { type: "iloathepdf:open" }, frameId);
  } catch {
    // A cross-origin frame activeTab doesn't cover: fall back to the top page.
    try {
      await inject(tabId);
      await send(tabId, { type: "iloathepdf:open" });
    } catch {
      /* nothing we can do on this page */
    }
  }
}

async function typed(blob: Blob): Promise<Blob> {
  if (PDF_IMAGE_TYPES.has(blob.type)) return blob;
  const sniffed = sniffImageType(new Uint8Array(await blob.slice(0, 256).arrayBuffer()));
  return sniffed ? new Blob([blob], { type: sniffed }) : blob;
}

/** From here: works for same-site images, CORS-enabled CDNs, data: URLs, and any site the user granted. */
async function fetchHere(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { credentials: "omit", cache: "force-cache" });
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

/** From the page itself (activeTab): same-origin images that need the page's cookies, and blob: URLs. */
async function fetchInPage(tabId: number, frameId: number, url: string): Promise<Blob | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: async (src: string) => {
        const res = await fetch(src, { credentials: "include", cache: "force-cache" });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (blob.size > 50_000_000) return null;
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      },
      args: [url],
    });
    if (!result?.result) return null;
    return await (await fetch(result.result)).blob();
  } catch {
    return null;
  }
}

/** The right-clicked image, or null after telling the user why not. */
async function readImage(tabId: number, frameId: number, url: string): Promise<Blob | null> {
  let blob = url.startsWith("blob:") ? null : await fetchHere(url);
  if (!blob || !PDF_IMAGE_TYPES.has((await typed(blob)).type)) blob = (await fetchInPage(tabId, frameId, url)) ?? blob;
  if (!blob) {
    await toast(tabId, t("toastImageBlocked"), "error");
    return null;
  }
  blob = await typed(blob);
  if (!PDF_IMAGE_TYPES.has(blob.type) || blob.size > MAX_IMAGE_BYTES) {
    await toast(tabId, t("toastImageUnsupported"), "error");
    return null;
  }
  return blob;
}

async function addImageFrom(tabId: number, frameId: number, url: string): Promise<void> {
  const blob = await readImage(tabId, frameId, url);
  if (!blob) return;
  const count = await countImages();
  const total = await addImage({ name: imageNameFromUrl(url, blob.type, count + 1), blob, source: url.startsWith("data:") ? "" : url });
  await updateBadge();
  await toast(tabId, t("toastImageAdded", total));
}

// --- Save image as PDF / JPG / PNG -----------------------------------------

const CONVERTER = "offscreen.html";

/**
 * The converter page: the background worker has no canvas. Chrome opens it as
 * an offscreen document (closed again once nothing is being saved); Firefox's
 * background is a page already, so it gets a hidden frame there.
 */
let converterReady: Promise<void> | null = null;
let saving = 0;

function openConverter(): Promise<void> {
  converterReady ??= (async () => {
    if (chrome.offscreen) {
      if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({
          url: CONVERTER,
          reasons: ["BLOBS"],
          justification: "Convert a right-clicked image to PDF, JPG or PNG on this computer, then save it.",
        });
      }
      return;
    }
    await new Promise<void>((resolve) => {
      const ready = (message: unknown) => {
        if ((message as { type?: string })?.type !== "iloathepdf:converter-ready") return;
        chrome.runtime.onMessage.removeListener(ready);
        resolve();
      };
      chrome.runtime.onMessage.addListener(ready);
      const frame = document.createElement("iframe");
      frame.src = chrome.runtime.getURL(CONVERTER);
      document.body.append(frame);
    });
  })().catch((e: unknown) => {
    converterReady = null;
    throw e;
  });
  return converterReady;
}

async function closeConverterSoon(): Promise<void> {
  // Firefox's frame stays; it costs nothing while idle and its page unloads
  // with the background page.
  if (!chrome.offscreen || saving > 0) return;
  converterReady = null;
  await chrome.offscreen.closeDocument().catch(() => {});
}

/** Resolves once the browser has finished writing the file (or gave up). */
function downloadDone(id: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, 5 * 60_000);
    function finish() {
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(changed);
      resolve();
    }
    function changed(delta: chrome.downloads.DownloadDelta) {
      if (delta.id === id && (delta.state?.current === "complete" || delta.state?.current === "interrupted")) finish();
    }
    chrome.downloads.onChanged.addListener(changed);
  });
}

function toDataUrl(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${blob.type};base64,${btoa(binary)}`;
  });
}

/** Exported for the smoke test, which can't click a real right-click menu. */
export async function saveImageAs(tabId: number, frameId: number, url: string, format: SaveFormat): Promise<void> {
  const blob = await readImage(tabId, frameId, url);
  if (!blob) return;
  saving++;
  try {
    await openConverter();
    const request: ConverterRequest = { type: "iloathepdf:convert", dataUrl: await toDataUrl(blob), name: imageNameFromUrl(url, blob.type, 1), format };
    const reply = await chrome.runtime.sendMessage<ConverterReply>(request);
    if (!reply?.ok) throw new Error(reply?.error ?? "No answer from the converter");
    const id = await chrome.downloads.download({ url: reply.url, filename: reply.name || renameFor("image", format) });
    await toast(tabId, t("toastImageSaved", reply.name));
    await downloadDone(id);
  } catch {
    await toast(tabId, t("toastSaveFailed"), "error");
  } finally {
    saving--;
    await closeConverterSoon();
  }
}
