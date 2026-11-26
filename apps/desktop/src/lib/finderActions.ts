/**
 * macOS: the Finder right-click menu, as Quick Actions.
 *
 * The Mac twin of the Windows Explorer menu (src-tauri/windows/
 * context-menu.nsh): the same items, in the same order, with the same
 * launch contract. A .dmg has no install step, so the app writes the items
 * itself (src-tauri/src/finder.rs) at every start, which also keeps their
 * labels in the app's language and their path pointing at wherever the app
 * now lives. Finder shows them under Quick Actions, each only for the file
 * types it lists. A switch in Settings takes them all away.
 *
 * Finder has no submenu of our own, so every label starts with the app's
 * name: the items sort together and say whose they are.
 */
import { useEffect, useState } from "react";

import { i18n, tr } from "@iloathepdf/i18n";
import { msg } from "@iloathepdf/i18n/msg";

import { isTauri } from "./jobs";
import { isMac } from "./utils";

/** Uniform type identifiers: what Finder matches each item against. */
const PDF = ["com.adobe.pdf"];
/** IMAGE_EXTS in tools.ts, as types. JPG is listed apart for Convert to JPG. */
const JPEG = ["public.jpeg"];
const OTHER_IMAGES = [
  "public.png",
  "org.webmproject.webp",
  "public.heic",
  "public.heif",
  "com.microsoft.bmp",
  "public.tiff",
  "com.compuserve.gif",
];
const IMAGES = [...JPEG, ...OTHER_IMAGES];
const ZIP = ["public.zip-archive"];

interface FinderItem {
  /** "run": in place (quickActions.ts). "action": open the app on a tool (tools.ts). */
  flag: "run" | "action";
  id: string;
  label: string;
  types: string[];
}

/** Same items as context-menu.nsh. Ids are stable: see quickActions.ts. */
export const FINDER_ITEMS: FinderItem[] = [
  // PDFs
  { flag: "run", id: "compress", label: msg("Compress"), types: PDF },
  { flag: "run", id: "merge", label: msg("Merge into one PDF"), types: PDF },
  { flag: "action", id: "merge", label: msg("Merge PDFs…"), types: PDF },
  { flag: "action", id: "compress", label: msg("Compress…"), types: PDF },
  { flag: "action", id: "split", label: msg("Split…"), types: PDF },
  { flag: "action", id: "pdf-to-image", label: msg("Convert to images…"), types: PDF },
  { flag: "action", id: "protect", label: msg("Protect with password…"), types: PDF },
  // Images
  { flag: "run", id: "image-to-pdf", label: msg("Convert to PDF"), types: IMAGES },
  { flag: "run", id: "images-to-one-pdf", label: msg("Combine into one PDF"), types: IMAGES },
  { flag: "run", id: "convert-to-jpg", label: msg("Convert to JPG"), types: OTHER_IMAGES },
  { flag: "action", id: "image-to-pdf", label: msg("Images to PDF…"), types: IMAGES },
  { flag: "action", id: "convert-image", label: msg("Convert image format…"), types: IMAGES },
  { flag: "action", id: "scan", label: msg("Make scanned PDF…"), types: IMAGES },
  // ZIP files
  { flag: "run", id: "extract-here", label: msg("Extract here"), types: ZIP },
  { flag: "run", id: "extract-to-folder", label: msg("Extract to a new folder"), types: ZIP },
  { flag: "action", id: "zip-to-pdf", label: msg("ZIP to PDF…"), types: ZIP },
];

const KEY = "iloathepdf.finderMenu";
const EVENT = "iloathepdf:findermenu";

/** Whether this copy can have a Finder menu at all: the Mac app. */
export function finderMenuSupported(): boolean {
  return isTauri() && isMac();
}

/** On unless switched off in Settings, as the Windows menu is. */
function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

let lastError: string | null = null;

async function sync(): Promise<void> {
  if (!finderMenuSupported()) return;
  const actions = FINDER_ITEMS.map((item) => ({
    flag: item.flag,
    id: item.id,
    label: `iLoathePDF: ${tr(item.label)}`,
    types: item.types,
  }));
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke<boolean>("set_finder_actions", { enabled: readEnabled(), actions });
    lastError = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.warn("finder menu:", lastError);
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Called once by the main window: puts the menu in place now and rewrites it
 * when the language changes. Returns the cleanup.
 */
export function startFinderMenuSync(): () => void {
  if (!finderMenuSupported()) return () => {};
  void sync();
  const onLanguage = () => void sync();
  i18n.on("languageChanged", onLanguage);
  return () => i18n.off("languageChanged", onLanguage);
}

export function setFinderMenuEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    /* then it only lasts until the next start */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
  void sync();
}

/** For Settings: the switch, and the last failure to write the menu. */
export function useFinderMenu(): { enabled: boolean; error: string | null } {
  const read = () => ({ enabled: readEnabled(), error: lastError });
  const [state, setState] = useState(read);
  useEffect(() => {
    const update = () => setState(read());
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return state;
}
