/**
 * Recipes: fixed, curated multi-step chains over the existing tools.
 *
 * A recipe step is just a tool id -- its options are always read live from
 * that tool's own `defaults` in tools.ts (see recipeRun.ts), never
 * duplicated here. Every step must be runnable with zero required user
 * input: no Sign/Redact/Organize (canvas interaction), no Watermark/Protect
 * (no useful default with nothing supplied).
 */

export interface Recipe {
  id: string;
  title: string;
  description: string;
  /** Tool ids, in order. The recipe's own accepted-file constraints are
   * read from the first step's tool (see recipes.tsx's registry.tsx
   * equivalent notes on the web side) -- never duplicated here. */
  steps: string[];
  /**
   * Per-step option overrides, keyed by tool id, merged over that tool's
   * `defaults`. Needed where a recipe must not inherit a default meant for
   * standalone use (e.g. Images to PDF defaults to "fit", which would size
   * each page to its photo before Compress/OCR rasterise it again). Mirrors
   * the web registry's `stepOptions`.
   */
  stepOptions?: Record<string, Record<string, unknown>>;
}

// A4 + 8 mm margin pages -- identical to the web registry's A4_PAGES.
const A4_PAGES = { "image-to-pdf": { page_size: "a4", margin_mm: 8 } };

export const RECIPES: Recipe[] = [
  {
    id: "merge-compress",
    title: "Merge → Compress",
    description: "Combine PDFs, then shrink the result for email.",
    steps: ["merge", "compress"],
  },
  {
    id: "scan-to-searchable-pdf",
    title: "Scan to Searchable PDF",
    description: "Turn photographed pages into one small, searchable PDF.",
    // Matches web's step order (OCR last) for consistency across platforms.
    // Desktop's Ghostscript-based compress preserves text either way, so
    // this reordering isn't required here to fix a bug -- but keeping both
    // platforms identical avoids future confusion.
    steps: ["image-to-pdf", "compress", "ocr"],
    stepOptions: A4_PAGES,
  },
  {
    id: "flatten-pdf",
    title: "Flatten PDF",
    description: "Rasterize every page and rebuild the PDF from the images, stripping anything but the visual page content.",
    steps: ["pdf-to-image", "image-to-pdf"],
    stepOptions: A4_PAGES,
  },
  {
    id: "merge-extract-tables",
    title: "Merge → Extract Tables",
    description: "Combine PDF reports, then extract every table into one spreadsheet.",
    steps: ["merge", "pdf-to-excel"],
  },
];
