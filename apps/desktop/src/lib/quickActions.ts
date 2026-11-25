/**
 * Quick actions: the right-click items that do their job in place, without
 * the main window (`iLoathePDF.exe --run <id> <file> ...`, see
 * src-tauri/src/launch.rs). The small progress window (src/quick/) runs them.
 *
 * Each one is an ordinary tool from tools.ts with fixed options, run through
 * the same `execute()` the tool screens use (run.ts), so a quick action and
 * the full tool always build the same job. Results land next to the first
 * input file whatever Settings says about the output folder (that is what
 * "in place" means), and a single-file result never takes a name that is
 * already in use: "report-compressed (2).pdf" instead of overwriting.
 *
 * The ids are part of the installer's registry entries
 * (src-tauri/windows/context-menu.nsh): rename one and the menu item of
 * every installed copy breaks until it updates. Add, don't rename.
 */
import { msg } from "@iloathepdf/i18n/msg";

import type { PickedFile } from "@/components/FileDropZone";
import { isTauri, JobError, type Progress } from "./jobs";
import { execute, type JobResult } from "./run";
import { toolAccepts, toolById, type OptionValues, type Tool } from "./tools";
import { baseName, dirName, stripExt } from "./utils";

export interface QuickAction {
  /** The `--run` value. Stable: see the note at the top. */
  id: string;
  /** Tool id in tools.ts whose job this runs. */
  tool: string;
  /** Shown while it runs, with {{name}} the file (or first file). */
  running: string;
  /** Shown when it is done. */
  done: string;
  /**
   * Run once per selected file (compress, extract) rather than once for the
   * whole selection (merge, combine into one PDF).
   */
  perFile: boolean;
  /** Merged over the tool's own defaults. */
  values: OptionValues | ((file: string) => OptionValues);
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "compress",
    tool: "compress",
    running: msg("Compressing {{name}}"),
    done: msg("Compressed"),
    perFile: true,
    // Balanced: good for email, and text stays sharp. Lossless rarely saves
    // much; Strong visibly softens photos, which nobody should get unasked.
    values: { level: "balanced" },
  },
  {
    id: "merge",
    tool: "merge",
    running: msg("Merging {{count}} PDFs"),
    done: msg("Merged"),
    perFile: false,
    values: { outputName: "merged" },
  },
  {
    id: "image-to-pdf",
    tool: "image-to-pdf",
    running: msg("Converting {{name}} to PDF"),
    done: msg("Converted to PDF"),
    perFile: true,
    // One PDF per image, named like it; each page the size of its image.
    values: (file) => ({ outputName: stripExt(baseName(file)), page_size: "fit", margin_mm: 0 }),
  },
  {
    id: "images-to-one-pdf",
    tool: "image-to-pdf",
    running: msg("Combining {{count}} images into one PDF"),
    done: msg("Combined into one PDF"),
    perFile: false,
    values: { outputName: "images", page_size: "fit", margin_mm: 0 },
  },
  {
    id: "convert-to-jpg",
    tool: "convert-image",
    running: msg("Converting {{count}} images to JPG"),
    done: msg("Converted to JPG"),
    perFile: false,
    // The tool's own defaults otherwise: quality 85, full size, and photo
    // metadata (location included) stripped, as everywhere in this app.
    values: { format: "jpg" },
  },
  {
    id: "extract-here",
    tool: "extract-zip",
    running: msg("Extracting {{name}}"),
    done: msg("Extracted"),
    perFile: true,
    values: { mode: "here" },
  },
  {
    id: "extract-to-folder",
    tool: "extract-zip",
    running: msg("Extracting {{name}}"),
    done: msg("Extracted"),
    perFile: true,
    values: { mode: "folder" },
  },
];

export function quickActionById(id: string): QuickAction | undefined {
  return QUICK_ACTIONS.find((a) => a.id === id);
}

/** Mirrors `QuickRequest` in launch.rs. */
export interface QuickRequest {
  id: number;
  run: string;
  files: string[];
  skipped: number;
}

/** What one request turns into before it runs. */
export type QuickPlan =
  | {
      ok: true;
      action: QuickAction;
      tool: Tool;
      /** The files the tool takes, in name order. */
      files: string[];
      /** Selected files the tool does not take (a JPG in a PDF merge). */
      leftOut: number;
      /** Folders and missing files Explorer passed. */
      skipped: number;
    }
  | { ok: false; reason: "unknown"; run: string }
  | { ok: false; reason: "nothing"; action: QuickAction; tool: Tool; skipped: number };

export function planQuick(request: QuickRequest): QuickPlan {
  const action = quickActionById(request.run);
  const tool = action ? toolById(action.tool) : undefined;
  if (!action || !tool) return { ok: false, reason: "unknown", run: request.run };
  const files = request.files.filter((f) => toolAccepts(tool, f));
  if (files.length === 0) return { ok: false, reason: "nothing", action, tool, skipped: request.skipped };
  return { ok: true, action, tool, files, leftOut: request.files.length - files.length, skipped: request.skipped };
}

/** The tool runs `execute()` makes for a plan: one per file, or one for all. */
export function quickRuns(plan: Extract<QuickPlan, { ok: true }>): string[][] {
  if (plan.action.perFile || !plan.tool.multiple) return plan.files.map((f) => [f]);
  return [plan.files];
}

export function quickValues(action: QuickAction, tool: Tool, firstFile: string): OptionValues {
  const extra = typeof action.values === "function" ? action.values(firstFile) : action.values;
  return { ...tool.defaults, ...extra };
}

function picked(paths: string[]): PickedFile[] {
  return paths.map((path, i) => ({ id: `${i}:${path}`, path, name: baseName(path) }));
}

/** A free name for a single-file result, from the Rust side (never overwrites). */
async function freePath(path: string): Promise<string> {
  if (!isTauri()) return path;
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<string>("unique_output_path", { path });
  } catch (raw) {
    const e = raw as { code?: string; message?: string };
    throw new JobError("OUTPUT_WRITE_FAILED", e?.message ?? String(raw));
  }
}

export interface QuickRunOutcome {
  files: string[];
  result?: JobResult;
  error?: JobError;
}

/**
 * Runs every tool run of a plan in turn. A failure on one file does not stop
 * the others (one locked PDF out of ten still gets nine compressed); a cancel
 * stops everything.
 */
export async function runQuick(
  plan: Extract<QuickPlan, { ok: true }>,
  onProgress: (pct: number, runIndex: number) => void,
  signal: AbortSignal,
): Promise<QuickRunOutcome[]> {
  const runs = quickRuns(plan);
  const outcomes: QuickRunOutcome[] = [];
  for (let i = 0; i < runs.length; i++) {
    const files = runs[i];
    if (signal.aborted) {
      outcomes.push({ files, error: new JobError("CANCELLED", "Cancelled") });
      continue;
    }
    onProgress((100 * i) / runs.length, i);
    try {
      const result = await execute(
        plan.tool,
        picked(files),
        quickValues(plan.action, plan.tool, files[0]),
        [],
        (p: Progress) => onProgress((100 * (i + Math.max(0, Math.min(100, p.pct)) / 100)) / runs.length, i),
        signal,
        [],
        [],
        dirName(files[0]),
        freePath,
      );
      outcomes.push({ files, result });
    } catch (raw) {
      const error = raw instanceof JobError ? raw : new JobError("INTERNAL", String(raw));
      outcomes.push({ files, error });
    }
  }
  onProgress(100, runs.length - 1);
  return outcomes;
}
