/**
 * Runs a Recipe: calls each step's tool via the same `execute()` a
 * standalone tool run uses, threading EVERY output file from one step into
 * the next step's input array (not just the first) -- this is what
 * correctly handles a step like PDF to Images, which produces one file per
 * page, feeding all of them into a next step (Images to PDF) that needs
 * every one of them, not just the first page.
 *
 * Each step runs with its tool's own existing `defaults` -- never a
 * separately-maintained copy -- so a future change to e.g. Compress's
 * default level automatically applies inside every recipe that uses it.
 *
 * No cleanup of intermediate step outputs: this app has no file-deletion
 * capability anywhere (no Tauri fs plugin, no matching Rust command), so
 * every step's output is simply left in the resolved output directory
 * under its own name. Only the FINAL step's JobResult is returned/reported
 * as the recipe's result.
 */
import { execute, type JobResult } from "./run";
import { toolById } from "./tools";
import { JobError, type Progress } from "./jobs";
import type { PickedFile } from "@/components/FileDropZone";
import type { Recipe } from "./recipes";

function outputsToPickedFiles(outputs: { path: string; bytes: number }[]): PickedFile[] {
  return outputs.map((o) => ({
    id: o.path,
    path: o.path,
    name: o.path.split("\\").pop() ?? o.path,
  }));
}

export async function runRecipe(
  recipe: Recipe,
  files: PickedFile[],
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
  /** Called right before each step starts, 1-based. Lets a caller (e.g.
   * RecipeWorkspace) know which step was in flight if the recipe is later
   * cancelled or fails mid-chain -- there's no other way to tell that from
   * the outside, since `onProgress` alone doesn't identify which step it's
   * reporting for. */
  onStepStart?: (step: number, totalSteps: number) => void,
): Promise<JobResult> {
  let currentFiles = files;
  let lastResult: JobResult | null = null;

  for (let i = 0; i < recipe.steps.length; i++) {
    const toolId = recipe.steps[i];
    const tool = toolById(toolId);
    if (!tool) {
      throw new JobError("INTERNAL", `Recipe "${recipe.id}" references an unknown tool id "${toolId}".`);
    }

    onStepStart?.(i + 1, recipe.steps.length);
    try {
      const result = await execute(tool, currentFiles, tool.defaults, [], onProgress, signal);
      lastResult = result;
      currentFiles = outputsToPickedFiles(result.outputs);
    } catch (err) {
      const stepLabel = `Step ${i + 1} of ${recipe.steps.length} (${tool.title})`;
      if (err instanceof JobError) {
        throw new JobError(err.code, `${stepLabel} failed: ${err.message}`);
      }
      throw new JobError("INTERNAL", `${stepLabel} failed: ${String(err)}`);
    }
  }

  if (!lastResult) {
    // Unreachable in practice (RECIPES entries always have >= 2 steps),
    // but keeps the return type honest rather than a non-null assertion.
    throw new JobError("INTERNAL", `Recipe "${recipe.id}" has no steps.`);
  }
  return lastResult;
}
