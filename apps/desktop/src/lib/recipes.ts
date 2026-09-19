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
  /** Set when this recipe has no web equivalent (a step is desktop-only). */
  desktopOnly?: boolean;
}

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
    steps: ["image-to-pdf", "ocr", "compress"],
  },
  {
    id: "flatten-pdf",
    title: "Flatten PDF",
    description: "Rasterize every page and rebuild the PDF from the images, stripping anything but the visual page content.",
    steps: ["pdf-to-image", "image-to-pdf"],
  },
  {
    id: "merge-extract-tables",
    title: "Merge → Extract Tables",
    description: "Combine PDF reports, then extract every table into one spreadsheet.",
    steps: ["merge", "pdf-to-excel"],
  },
];

export function recipeById(id: string | undefined): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
