/**
 * Recipes: fixed, curated multi-step chains over the existing tools.
 *
 * A recipe step is just a tool slug -- its options are always read live
 * from that tool's own `defaultOptions` in tools/registry.tsx (see
 * runRecipe.ts), never duplicated here.
 */

export interface RecipeConfig {
  slug: string;
  title: string;
  description: string;
  /** Tool slugs, in order. */
  steps: string[];
  status: "live" | "desktop-only";
}

export const RECIPES: RecipeConfig[] = [
  {
    slug: "merge-compress",
    title: "Merge → Compress",
    description: "Combine PDFs, then shrink the result for email.",
    steps: ["merge", "compress"],
    status: "live",
  },
  {
    slug: "scan-to-searchable-pdf",
    title: "Scan to Searchable PDF",
    description: "Turn photographed pages into one small, searchable PDF.",
    steps: ["images-to-pdf", "ocr", "compress"],
    status: "live",
  },
  {
    slug: "flatten-pdf",
    title: "Flatten PDF",
    description: "Rasterize every page and rebuild the PDF from the images, stripping anything but the visual page content.",
    steps: ["pdf-to-images", "images-to-pdf"],
    status: "live",
  },
  {
    slug: "merge-extract-tables",
    title: "Merge → Extract Tables",
    description: "Combine PDF reports, then extract every table into one spreadsheet.",
    steps: ["merge", "pdf-to-excel"],
    status: "desktop-only",
  },
];

export function getRecipe(slug: string): RecipeConfig | undefined {
  return RECIPES.find((r) => r.slug === slug);
}
