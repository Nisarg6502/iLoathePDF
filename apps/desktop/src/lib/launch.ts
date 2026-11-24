/**
 * Files handed to the app by Windows: the Explorer right-click menu,
 * "Send to", "Open with" and dropping files on the exe.
 *
 * The command line is `iLoathePDF.exe [--action <tool-id>] <file> ...`. The
 * Rust side (src-tauri/src/launch.rs) parses it, waits until Explorer has
 * stopped starting processes, and keeps the result until this side takes it.
 * This side decides where the files go; nothing ever runs on its own.
 */
import { useSyncExternalStore } from "react";
import { tr } from "@iloathepdf/i18n";

import { IMAGE_EXTS, extOf, suggestTools, toolAccepts, toolById } from "./tools";
import { isTauri } from "./jobs";
import { baseName } from "./utils";

/** Mirrors `LaunchRequest` in launch.rs. */
export interface LaunchRequest {
  action: string | null;
  /** Existing files, absolute, sorted by name. */
  files: string[];
  /** Arguments that were folders or missing files. */
  skipped: number;
}

export interface LaunchPlan {
  /** Route to open. "/" shows Home's tool picker for `files`. */
  path: string;
  files: string[];
  /** Translated, short, shown in a banner on the screen the files land on. */
  notices: string[];
}

/**
 * Where a launch goes. With an action, that tool; without one, the tool the
 * files obviously belong to, else Home's picker (the same one a drop on the
 * window shows, which also explains a mix no tool takes).
 */
export function planLaunch(req: LaunchRequest): LaunchPlan | null {
  const notices: string[] = [];
  const files = req.files;
  if (req.skipped > 0) {
    notices.push(
      tr("{{count}} items were left out because they are folders or no longer exist.", { count: req.skipped }),
    );
  }

  if (req.action) {
    const tool = toolById(req.action);
    if (!tool) {
      notices.unshift(tr("There is no tool called “{{id}}”. Choose one on this screen.", { id: req.action }));
      return { path: "/", files, notices };
    }
    const fits = files.filter((f) => toolAccepts(tool, f));
    const names = { tool: tr(tool.title), files: tr(tool.acceptsLabel) };
    if (files.length > 0 && fits.length === 0) {
      notices.unshift(tr("{{tool}} takes {{files}}. Pick another tool for these files.", names));
      return { path: "/", files, notices };
    }
    if (fits.length < files.length) {
      notices.push(tr("{{count}} files were left out: {{tool}} takes {{files}}.", { ...names, count: files.length - fits.length }));
    }
    if (!tool.multiple && fits.length > 1) {
      notices.push(
        tr("{{tool}} works on one file at a time, so only {{name}} was opened.", { tool: names.tool, name: baseName(fits[0]) }),
      );
      return { path: tool.path, files: fits.slice(0, 1), notices };
    }
    return { path: tool.path, files: fits, notices };
  }

  if (files.length === 0) return notices.length ? { path: "/", files, notices } : null;

  const exts = files.map(extOf);
  const tool = exts.every((e) => IMAGE_EXTS.includes(e))
    ? toolById("image-to-pdf")
    : files.length > 1 && exts.every((e) => e === "pdf")
      ? toolById("merge")
      : // Only one tool fits (several text files, a ZIP...): no need to ask.
        (() => {
          const matches = suggestTools(files);
          return matches.length === 1 ? matches[0] : undefined;
        })();
  return { path: tool ? tool.path : "/", files, notices };
}

// ---------------------------------------------------------------------------
// The handover from Rust, kept in a tiny store outside React so that a
// request taken from Rust is never lost to an unmount (StrictMode mounts
// every effect twice in development).
// ---------------------------------------------------------------------------

export type Launch = LaunchPlan & { seq: number };

let current: Launch | null = null;
let seq = 0;
let started = false;
const subscribers = new Set<() => void>();

function publish(req: LaunchRequest | null): void {
  const plan = req ? planLaunch(req) : null;
  if (!plan) return;
  current = { ...plan, seq: ++seq };
  for (const notify of subscribers) notify();
}

/** Starts listening, once per app run. Safe to call repeatedly. */
export function startLaunchListener(): void {
  if (started || !isTauri()) return;
  started = true;
  void (async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const { listen } = await import("@tauri-apps/api/event");
    const take = () =>
      invoke<LaunchRequest | null>("take_launch_request")
        .then(publish)
        .catch(() => {
          /* nothing was handed over; the app works as if started normally */
        });
    // Listen first, then take: a request settled in between is still waiting
    // in Rust, and one settled later raises the event.
    await listen("launch://request", () => void take());
    await take();
  })();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/** The latest launch, or null. Re-renders when a new one arrives. */
export function useLaunch(): Launch | null {
  return useSyncExternalStore(subscribe, () => current);
}

let handled = 0;

/** True the first time it is called for a launch, false after. */
export function claimLaunch(launch: Launch): boolean {
  if (launch.seq <= handled) return false;
  handled = launch.seq;
  return true;
}
