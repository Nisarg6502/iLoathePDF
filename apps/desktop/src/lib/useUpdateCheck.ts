/**
 * State for the optional, signed in-app updater (see updates.ts for the
 * privacy model).
 *
 * A tiny external store rather than component state, because two places read
 * it -- the Settings panel and the banner in the app shell -- and an action
 * started from one must show up in the other.
 *
 * Off by default. Nothing here runs, and no Rust command is invoked, unless the
 * user has switched the check on. Nothing is downloaded until they press
 * "Update now" -- or, separately, opt in to downloading in the background.
 *
 * Flow:  idle -> checking -> available -> downloading -> ready -> installing
 *                         \-> current
 * A failed download falls back to "available" and a failed install to "ready",
 * each with `error` set, so the same button is offered again as "Retry".
 */
import { useSyncExternalStore } from "react";

import { isNewerVersion } from "./updates";
import { isTauri } from "./jobs";

const ENABLED_KEY = "iloathepdf.updateCheck";
const AUTO_KEY = "iloathepdf.updateAutoDownload";
const DISMISSED_KEY = "iloathepdf.updateDismissed";

export interface LatestRelease {
  version: string;
  /** The release page for that version. */
  url: string;
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export interface DownloadProgress {
  downloaded: number;
  /** Null when the server did not say how large the file is. */
  total: number | null;
}

export interface UpdateState {
  /** The user's opt-in. False until they turn it on. */
  enabled: boolean;
  /** Download new versions as soon as they are found, without being asked. */
  autoDownload: boolean;
  status: UpdateStatus;
  latest: LatestRelease | null;
  progress: DownloadProgress | null;
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
  autoDownload: readKey(AUTO_KEY) === "on",
  status: "idle",
  latest: null,
  progress: null,
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

function messageOf(e: unknown, fallback: string): string {
  return typeof e === "object" && e !== null && "message" in e
    ? String((e as { message: unknown }).message)
    : fallback;
}

/** One network action at a time, so a double-click cannot send two requests. */
let busy = false;

export async function checkForUpdate(installed: string = __APP_VERSION__): Promise<void> {
  if (!state.enabled || busy) return;
  // Never replace a downloaded or in-progress update with a fresh check.
  if (state.status === "downloading" || state.status === "ready" || state.status === "installing") {
    return;
  }
  if (!isTauri()) {
    // The browser preview has no Rust core, and the webview's CSP would block a
    // direct request anyway. Say so rather than failing mysteriously.
    set({ status: "error", error: "Checking for updates needs the desktop app." });
    return;
  }
  busy = true;
  let startAuto = false;
  set({ status: "checking", error: null });
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const latest = await invoke<LatestRelease | null>("check_for_update");
    // The user may have switched it off while the request was running.
    if (!state.enabled) return;
    // The updater has already decided this is newer; insist on it here too, so
    // an odd answer (older, pre-release) can only fail to show a banner.
    const newer = latest !== null && isNewerVersion(latest.version, installed);
    set({
      latest: newer ? latest : null,
      checkedAt: Date.now(),
      status: newer ? "available" : "current",
    });
    startAuto = newer && state.autoDownload;
  } catch (e) {
    if (!state.enabled) return;
    set({ status: "error", error: messageOf(e, "Could not reach GitHub.") });
  } finally {
    busy = false;
  }
  if (startAuto) void downloadUpdate();
}

/** Download the update in the background; the app stays fully usable. */
export async function downloadUpdate(): Promise<void> {
  if (!state.enabled || busy || !state.latest) return;
  if (state.status !== "available" && state.status !== "error") return;
  busy = true;
  set({ status: "downloading", error: null, progress: { downloaded: 0, total: null } });
  try {
    const { invoke, Channel } = await import("@tauri-apps/api/core");
    const channel = new Channel<{ event: "progress"; downloaded: number; total: number | null }>();
    channel.onmessage = (m) => {
      if (m.event === "progress") set({ progress: { downloaded: m.downloaded, total: m.total } });
    };
    await invoke("download_update", { onEvent: channel });
    set({ status: "ready", progress: null });
  } catch (e) {
    set({
      status: "available",
      progress: null,
      error: messageOf(e, "The update could not be downloaded."),
    });
  } finally {
    busy = false;
  }
}

/**
 * Hand the downloaded installer to Windows. On success the app exits, the
 * installer asks for permission, replaces the app and reopens it.
 */
export async function installUpdate(): Promise<void> {
  if (busy || state.status !== "ready") return;
  busy = true;
  set({ status: "installing", error: null });
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("install_update");
  } catch (e) {
    set({ status: "ready", error: messageOf(e, "The update could not be started.") });
  } finally {
    busy = false;
  }
}

export function setUpdateCheckEnabled(enabled: boolean): void {
  writeKey(ENABLED_KEY, enabled ? "on" : null);
  if (enabled) {
    set({ enabled: true });
    void checkForUpdate();
  } else {
    // Opting out also forgets everything the check learned.
    set({
      enabled: false,
      status: "idle",
      latest: null,
      progress: null,
      checkedAt: null,
      error: null,
    });
  }
}

export function setAutoDownload(on: boolean): void {
  writeKey(AUTO_KEY, on ? "on" : null);
  set({ autoDownload: on });
  if (on && state.status === "available") void downloadUpdate();
}

export function dismissUpdate(version: string): void {
  writeKey(DISMISSED_KEY, version);
  set({ dismissed: version });
}

export function useUpdateCheck(): UpdateState {
  return useSyncExternalStore(subscribe, () => state);
}
