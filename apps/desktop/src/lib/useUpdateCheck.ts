/**
 * State for the optional update check (see updates.ts for the privacy model).
 *
 * A tiny external store rather than component state, because two places read
 * it -- the Settings switch and the banner in the app shell -- and a check
 * started from one must show up in the other.
 *
 * Off by default. Nothing here runs, and the Rust command is never invoked,
 * unless the user has switched the check on.
 */
import { useSyncExternalStore } from "react";

import { isNewerVersion } from "./updates";
import { isTauri } from "./jobs";

const ENABLED_KEY = "iloathepdf.updateCheck";
const DISMISSED_KEY = "iloathepdf.updateDismissed";

export interface LatestRelease {
  version: string;
  url: string;
}

export type UpdateStatus = "idle" | "checking" | "current" | "available" | "error";

export interface UpdateState {
  /** The user's opt-in. False until they turn it on. */
  enabled: boolean;
  status: UpdateStatus;
  latest: LatestRelease | null;
  /** The version whose banner the user closed, so it stays closed. */
  dismissed: string | null;
  /** Epoch ms of the last completed check, for "checked just now". */
  checkedAt: number | null;
  error: string | null;
}

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* the choice then lasts for this session only */
  }
}

let state: UpdateState = {
  enabled: readKey(ENABLED_KEY) === "on",
  status: "idle",
  latest: null,
  dismissed: readKey(DISMISSED_KEY),
  checkedAt: null,
  error: null,
};

const listeners = new Set<() => void>();

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** One in-flight check at a time, so a double-click cannot send two requests. */
let inFlight = false;

export async function checkForUpdate(installed: string = __APP_VERSION__): Promise<void> {
  if (!state.enabled || inFlight) return;
  if (!isTauri()) {
    // The browser preview has no Rust core, and the webview's CSP would block a
    // direct request anyway. Say so rather than failing mysteriously.
    set({ status: "error", error: "Checking for updates needs the desktop app." });
    return;
  }
  inFlight = true;
  set({ status: "checking", error: null });
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const latest = await invoke<LatestRelease>("fetch_latest_release");
    // The user may have switched it off while the request was running.
    if (!state.enabled) return;
    set({
      latest,
      checkedAt: Date.now(),
      status: isNewerVersion(latest.version, installed) ? "available" : "current",
    });
  } catch (e) {
    if (!state.enabled) return;
    const message =
      typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : "Could not reach GitHub.";
    set({ status: "error", error: message });
  } finally {
    inFlight = false;
  }
}

export function setUpdateCheckEnabled(enabled: boolean): void {
  writeKey(ENABLED_KEY, enabled ? "on" : null);
  if (enabled) {
    set({ enabled: true });
    void checkForUpdate();
  } else {
    // Opting out also forgets everything the check learned.
    set({ enabled: false, status: "idle", latest: null, checkedAt: null, error: null });
  }
}

export function dismissUpdate(version: string): void {
  writeKey(DISMISSED_KEY, version);
  set({ dismissed: version });
}

export function useUpdateCheck(): UpdateState {
  return useSyncExternalStore(subscribe, () => state);
}
