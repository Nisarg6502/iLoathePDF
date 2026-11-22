/**
 * Runs a recipe: calls each step's Engine through the same File[] -> Blob[]
 * contract a standalone tool run uses, threading EVERY output file from one
 * step into the next.
 *
 * Tools that take one file at a time (Compress, OCR, Split, Watermark...) are
 * run once per incoming file, so a recipe can work on a whole batch: drop
 * five PDFs on "Unlock and shrink" and get five back, or split a PDF into
 * pages and compress each page. Tools that take many files at once (Merge,
 * Images to PDF, Compress images...) get them all in one call.
 *
 * Each step runs with its tool's `defaultOptions`, overlaid with the step's
 * own settings and then any per-run overrides (e.g. a password typed on the
 * run page).
 */
import { getTool } from "@/tools/registry";
import type { EngineResult, EngineOutputFile } from "@/engines/types";
import type { RecipeConfig } from "./registry";
import type { Options } from "./chain";

export interface StepEvent {
  index: number;
  status: "running" | "done";
  filesIn: number;
  filesOut?: number;
  bytesIn: number;
  bytesOut?: number;
  ms?: number;
}

export interface RunOptions {
  onProgress?: (fraction: number) => void;
  onStep?: (event: StepEvent) => void;
  /** Per-step settings for this run, keyed by step index, overlaid on the recipe's own. */
  overrides?: Record<number, Options>;
}

function outputsToFiles(outputs: EngineOutputFile[]): File[] {
  return outputs.map((o) => new File([o.blob], o.name, { type: o.blob.type }));
}

/** Makes every name unique ("page-1.pdf", "page-1 (2).pdf") so later steps and downloads don't collide. */
function uniqueNames(files: EngineOutputFile[]): EngineOutputFile[] {
  const seen = new Map<string, number>();
  return files.map((f) => {
    const n = seen.get(f.name) ?? 0;
    seen.set(f.name, n + 1);
    if (n === 0) return f;
    const dot = f.name.lastIndexOf(".");
    const name = dot > 0 ? `${f.name.slice(0, dot)} (${n + 1})${f.name.slice(dot)}` : `${f.name} (${n + 1})`;
    return { ...f, name };
  });
}

const sumBytes = (files: { size: number }[]) => files.reduce((s, f) => s + f.size, 0);

export async function runRecipe(
  recipe: RecipeConfig,
  files: File[],
  onProgressOrOptions?: ((fraction: number) => void) | RunOptions,
): Promise<EngineResult> {
  const opts: RunOptions = typeof onProgressOrOptions === "function" ? { onProgress: onProgressOrOptions } : onProgressOrOptions ?? {};
  const total = recipe.steps.length;
  let currentFiles = files;
  let lastResult: EngineResult | null = null;
  let anyPreview = false;

  for (let i = 0; i < total; i++) {
    const step = recipe.steps[i];
    const tool = getTool(step.tool);
    if (!tool) {
      throw new Error(`Recipe "${recipe.slug}" references an unknown tool "${step.tool}".`);
    }
    const options = { ...tool.defaultOptions, ...step.options, ...opts.overrides?.[i] };
    const started = performance.now();
    opts.onStep?.({ index: i, status: "running", filesIn: currentFiles.length, bytesIn: sumBytes(currentFiles) });

    // One call with every file, or one call per file for single-file tools.
    const batches = tool.multiple ? [currentFiles] : currentFiles.map((f) => [f]);
    const outputs: EngineOutputFile[] = [];
    const summaries: string[] = [];
    let b = 0;
    try {
      for (; b < batches.length; b++) {
        // Scale this call's own 0-1 progress into the recipe's overall 0-1
        // range, so the bar climbs once across the whole run.
        const stepProgress = opts.onProgress
          ? (fraction: number) => opts.onProgress!((i + (b + fraction) / batches.length) / total)
          : undefined;
        const result = await tool.engine({ files: batches[b], options, onProgress: stepProgress });
        outputs.push(...result.files);
        summaries.push(result.summary);
        anyPreview ||= result.isPreview;
        stepProgress?.(1);
      }
    } catch (err) {
      const where = batches.length > 1 ? ` on ${batches[b]?.[0]?.name ?? "a file"}` : "";
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Step ${i + 1} of ${total} (${tool.name}) failed${where}: ${message}`);
    }
    if (outputs.length === 0) {
      throw new Error(`Step ${i + 1} of ${total} (${tool.name}) produced no files: ${summaries.at(-1) ?? "nothing to pass on"}`);
    }

    const named = uniqueNames(outputs);
    lastResult = {
      files: named,
      summary: batches.length === 1 ? summaries[0] : `${batches.length} files in, ${named.length} out`,
      isPreview: anyPreview,
    };
    currentFiles = outputsToFiles(named);
    opts.onStep?.({
      index: i,
      status: "done",
      filesIn: batches.reduce((n, b) => n + b.length, 0),
      filesOut: named.length,
      bytesIn: sumBytes(batches.flat()),
      bytesOut: sumBytes(named.map((f) => f.blob)),
      ms: performance.now() - started,
    });
  }

  if (!lastResult) {
    throw new Error(`Recipe "${recipe.slug}" has no steps.`);
  }
  return lastResult;
}
