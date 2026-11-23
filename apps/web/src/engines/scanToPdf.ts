import { filterImage, type ScanMode } from "@/lib/scanFilter";
import { imagesToPdfEngine } from "./imagesToPdf";
import type { Engine } from "./types";
import { tr } from "@iloathepdf/i18n";

const MODES: ScanMode[] = ["color", "enhanced", "bw"];

/** Images to PDF, with an optional cleanup pass for photographed paper. */
export const scanToPdfEngine: Engine = async ({ files, options, onProgress }) => {
  if (files.length === 0) throw new Error(tr("Add at least one photo or scan."));
  const mode = MODES.includes(options.mode as ScanMode) ? (options.mode as ScanMode) : "enhanced";

  const cleaned: File[] = [];
  for (const [index, file] of files.entries()) {
    onProgress?.(index / files.length);
    try {
      cleaned.push(await filterImage(file, mode));
    } catch (e) {
      throw new Error(tr("Couldn't clean up {{file}}: {{reason}}", { file: file.name, reason: e instanceof Error ? e.message : String(e) }));
    }
  }

  // Edits (rotate/crop) are keyed by position and applied to the cleaned images, so order is unchanged.
  const result = await imagesToPdfEngine({ files: cleaned, options, onProgress });
  const label = mode === "bw" ? tr("black & white") : mode === "enhanced" ? tr("enhanced") : tr("original colour");
  return { ...result, summary: `${tr("{{count}} pages", { count: files.length })}, ${label}` };
};
