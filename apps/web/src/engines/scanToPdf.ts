import { filterImage, type ScanMode } from "@/lib/scanFilter";
import { imagesToPdfEngine } from "./imagesToPdf";
import type { Engine } from "./types";

const MODES: ScanMode[] = ["color", "enhanced", "bw"];

/** Images to PDF, with an optional cleanup pass for photographed paper. */
export const scanToPdfEngine: Engine = async ({ files, options, onProgress }) => {
  if (files.length === 0) throw new Error("Add at least one photo or scan.");
  const mode = MODES.includes(options.mode as ScanMode) ? (options.mode as ScanMode) : "enhanced";

  const cleaned: File[] = [];
  for (const [index, file] of files.entries()) {
    onProgress?.(index / files.length);
    try {
      cleaned.push(await filterImage(file, mode));
    } catch (e) {
      throw new Error(`Couldn't clean up ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Edits (rotate/crop) are keyed by position and applied to the cleaned images, so order is unchanged.
  const result = await imagesToPdfEngine({ files: cleaned, options, onProgress });
  const label = mode === "bw" ? "black & white" : mode === "enhanced" ? "enhanced" : "original colour";
  return { ...result, summary: `${files.length} page${files.length === 1 ? "" : "s"}, ${label}` };
};
