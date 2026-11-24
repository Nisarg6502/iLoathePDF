/**
 * Background worker (a service worker in Chrome/Edge, an event page in
 * Firefox). It owns the right-click items and fetches the bytes of an image
 * the user right-clicked. It never processes files and never sends anything
 * anywhere: the only requests it makes are for that image, which the page is
 * already showing (usually served from the browser's cache).
 */
import { t } from "../shared/i18n";
import { addImage, countImages, imageNameFromUrl } from "../shared/imageStore";
import { CONTENT_SCRIPT, type ContentRequest } from "../shared/messages";
import { PDF_IMAGE_TYPES, sniffImageType } from "../shared/sniff";
import { pruneRegistrations } from "../shared/sites";

const MENU_ADD_IMAGE = "add-image";
const MENU_FIT_FORM = "fit-form";
const MAX_IMAGE_BYTES = 50_000_000;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll().then(() => {
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

async function addImageFrom(tabId: number, frameId: number, url: string): Promise<void> {
  let blob = url.startsWith("blob:") ? null : await fetchHere(url);
  if (!blob || !PDF_IMAGE_TYPES.has((await typed(blob)).type)) blob = (await fetchInPage(tabId, frameId, url)) ?? blob;
  if (!blob) {
    await toast(tabId, t("toastImageBlocked"), "error");
    return;
  }
  blob = await typed(blob);
  if (!PDF_IMAGE_TYPES.has(blob.type) || blob.size > MAX_IMAGE_BYTES) {
    await toast(tabId, t("toastImageUnsupported"), "error");
    return;
  }
  const count = await countImages();
  const total = await addImage({ name: imageNameFromUrl(url, blob.type, count + 1), blob, source: url.startsWith("data:") ? "" : url });
  await updateBadge();
  await toast(tabId, t("toastImageAdded", total));
}
