/**
 * "Always show the Fit buttons" per site, or everywhere: an optional host
 * permission the user grants from the popup, plus a registered content script
 * for the same match pattern. Both are removed together.
 */
import { CONTENT_SCRIPT } from "./messages";

export const ALL_SITES = "<all_urls>";

/** "https://example.com/*" for a page URL, or null for pages extensions can't run on. */
export function siteMatch(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

function scriptId(match: string): string {
  return match === ALL_SITES ? "fit-all" : `fit-${match.replace(/[^a-z0-9.-]+/gi, "_")}`;
}

export async function isAlwaysOn(match: string): Promise<boolean> {
  const [registered] = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId(match)] });
  return Boolean(registered) && (await chrome.permissions.contains({ origins: [match] }));
}

/** Call from a click handler: permissions.request needs a user gesture. */
export async function enableAlways(match: string): Promise<boolean> {
  const granted = await chrome.permissions.request({ origins: [match] });
  if (!granted) return false;
  const id = scriptId(match);
  await chrome.scripting.unregisterContentScripts({ ids: [id] }).catch(() => {});
  await chrome.scripting.registerContentScripts([
    { id, matches: [match], js: [CONTENT_SCRIPT], allFrames: true, runAt: "document_idle", persistAcrossSessions: true },
  ]);
  return true;
}

export async function disableAlways(match: string): Promise<void> {
  await chrome.scripting.unregisterContentScripts({ ids: [scriptId(match)] }).catch(() => {});
  await chrome.permissions.remove({ origins: [match] }).catch(() => false);
}

/** Drops registrations whose permission the user took away in the browser's settings. */
export async function pruneRegistrations(): Promise<void> {
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  for (const script of scripts) {
    const match = script.matches?.[0];
    if (match && !(await chrome.permissions.contains({ origins: [match] }))) {
      await chrome.scripting.unregisterContentScripts({ ids: [script.id] }).catch(() => {});
    }
  }
}
