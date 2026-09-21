/**
 * Runs a RecipeConfig: calls each step's Engine via the same File[]->Blob[]
 * contract a standalone tool run uses, threading EVERY output file from
 * one step into the next step's input array (not just the first) -- this
 * correctly handles a step like PDF to Images, which produces one file per
 * page, feeding all of them into a next step (Images to PDF) that needs
 * every one of them.
 *
 * Each step runs with its tool's own existing `defaultOptions` -- never a
 * separately-maintained copy.
 */
import { getTool } from "@/tools/registry";
import type { EngineResult, EngineOutputFile } from "@/engines/types";
import type { RecipeConfig } from "./registry";

function outputsToFiles(outputs: EngineOutputFile[]): File[] {
  return outputs.map((o) => new File([o.blob], o.name, { type: o.blob.type }));
}

export async function runRecipe(
  recipe: RecipeConfig,
  files: File[],
  onProgress?: (fraction: number) => void,
): Promise<EngineResult> {
  let currentFiles = files;
  let lastResult: EngineResult | null = null;

  for (let i = 0; i < recipe.steps.length; i++) {
    const slug = recipe.steps[i];
    const tool = getTool(slug);
    if (!tool) {
      throw new Error(`Recipe "${recipe.slug}" references an unknown tool slug "${slug}".`);
    }

    // Scale this step's own 0-1 progress into the recipe's overall 0-1
    // range, instead of forwarding it straight through -- otherwise a
    // 3-step recipe's progress bar fills three separate times (0->1,
    // 0->1, 0->1) rather than climbing smoothly once across the whole run.
    const stepProgress = onProgress
      ? (fraction: number) => onProgress((i + fraction) / recipe.steps.length)
      : undefined;

    try {
      const result = await tool.engine({ files: currentFiles, options: tool.defaultOptions, onProgress: stepProgress });
      lastResult = result;
      currentFiles = outputsToFiles(result.files);
    } catch (err) {
      const stepLabel = `Step ${i + 1} of ${recipe.steps.length} (${tool.name})`;
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${stepLabel} failed: ${message}`);
    }
  }

  if (!lastResult) {
    throw new Error(`Recipe "${recipe.slug}" has no steps.`);
  }
  return lastResult;
}
