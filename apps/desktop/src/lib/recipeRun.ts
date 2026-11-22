/**
 * Runs a Recipe: calls each step's tool through the same `execute()` a
 * standalone tool run uses, threading EVERY output file from one step into
 * the next.
 *
 * Tools that take one file at a time (Compress, OCR, Split, Watermark...) run
 * once per incoming file, so a recipe works on a whole batch: drop five PDFs
 * on "Unlock and shrink" and get five back. Tools that take many files at once
 * (Merge, Images to PDF, Convert images...) get them all in one job.
 *
 * Each step runs with its tool's `defaults`, overlaid with the step's own
 * settings, then any per-run overrides (e.g. a password typed on the run
 * screen).
 *
 * Where files go: the final step writes to the normal destination (the folder
 * chosen in Settings, or beside the first input). Steps before it write into
 * an "iLoathePDF recipe steps" folder inside that destination, so the
 * finished files aren't buried among in-between ones. This app has no
 * file-deletion capability, so that folder is left in place; the run screen
 * says so.
 */
import { execute, outputDirFor, type JobResult } from "./run";
import { toolById, type OptionValues } from "./tools";
import { JobError, type Progress } from "./jobs";
import type { PickedFile } from "@/components/FileDropZone";
import type { Recipe } from "./recipes";

export const STEPS_FOLDER = "iLoathePDF recipe steps";

export interface StepEvent {
  /** 0-based. */
  index: number;
  status: "running" | "done";
  filesIn: number;
  filesOut?: number;
  bytesOut?: number;
  ms?: number;
}

export interface RecipeRunOptions {
  onProgress: (p: Progress) => void;
  signal: AbortSignal;
  onStep?: (e: StepEvent) => void;
  /** Per-step settings for this run, keyed by step index, overlaid on the recipe's own. */
  overrides?: Record<number, OptionValues>;
}

function outputsToPickedFiles(outputs: { path: string; bytes: number }[]): PickedFile[] {
  return outputs.map((o) => ({
    id: o.path,
    path: o.path,
    name: o.path.split("\\").pop() ?? o.path,
    size: o.bytes,
  }));
}

export async function runRecipe(recipe: Recipe, files: PickedFile[], opts: RecipeRunOptions): Promise<JobResult> {
  const total = recipe.steps.length;
  if (total === 0) throw new JobError("INTERNAL", `Recipe "${recipe.id}" has no steps.`);
  if (files.length === 0) throw new JobError("BAD_PARAMS", "Add files to run the recipe on.");

  const finalDir = outputDirFor(files[0].path);
  const stepsDir = `${finalDir.endsWith("\\") ? finalDir : finalDir + "\\"}${STEPS_FOLDER}`;

  let currentFiles = files;
  let lastResult: JobResult | null = null;

  for (let i = 0; i < total; i++) {
    const step = recipe.steps[i];
    const tool = toolById(step.tool);
    if (!tool) {
      throw new JobError("INTERNAL", `Recipe "${recipe.id}" references an unknown tool id "${step.tool}".`);
    }
    const values = { ...tool.defaults, ...(step.options as OptionValues | undefined), ...opts.overrides?.[i] } as OptionValues;
    const dir = i === total - 1 ? finalDir : stepsDir;
    const batches = tool.multiple ? [currentFiles] : currentFiles.map((f) => [f]);
    const started = Date.now();
    opts.onStep?.({ index: i, status: "running", filesIn: currentFiles.length });

    const outputs: { path: string; bytes: number }[] = [];
    const summaries: string[] = [];
    let compression: JobResult["compression"];
    let b = 0;
    try {
      for (; b < batches.length; b++) {
        // Scale this job's 0-100 into the recipe's overall 0-100, so the bar
        // climbs once across the whole run instead of refilling per step.
        const stepProgress = (p: Progress) =>
          opts.onProgress({ ...p, pct: ((i + (b + p.pct / 100) / batches.length) / total) * 100 });
        const result = await execute(tool, batches[b], values, [], stepProgress, opts.signal, [], [], dir);
        outputs.push(...result.outputs);
        if (result.summary) summaries.push(result.summary);
        compression = result.compression;
      }
    } catch (err) {
      const where = batches.length > 1 ? ` on ${batches[b]?.[0]?.name ?? "a file"}` : "";
      const stepLabel = `Step ${i + 1} of ${total} (${tool.title}) failed${where}`;
      if (err instanceof JobError) {
        if (err.code === "CANCELLED") throw err;
        throw new JobError(err.code, `${stepLabel}: ${err.message}`);
      }
      throw new JobError("INTERNAL", `${stepLabel}: ${String(err)}`);
    }

    lastResult = {
      outputs,
      summary: batches.length === 1 ? summaries[0] : `${batches.length} files in, ${outputs.length} out.`,
      // A before/after size only makes sense for a single compressed file.
      compression: batches.length === 1 ? compression : undefined,
    };
    currentFiles = outputsToPickedFiles(outputs);
    opts.onStep?.({
      index: i,
      status: "done",
      filesIn: batches.reduce((n, x) => n + x.length, 0),
      filesOut: outputs.length,
      bytesOut: outputs.reduce((n, o) => n + o.bytes, 0),
      ms: Date.now() - started,
    });
  }

  return lastResult!;
}
