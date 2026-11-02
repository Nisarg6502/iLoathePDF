/**
 * Recipes: fixed, curated multi-step chains over the existing tools.
 *
 * A recipe step is just a tool slug -- its options are always read live
 * from that tool's own `defaultOptions` in tools/registry.tsx (see
 * runRecipe.ts), never duplicated here.
 */
import { getTool } from "@/tools/registry";

export interface RecipeConfig {
  slug: string;
  title: string;
  description: string;
  /** Tool slugs, in order. */
  steps: string[];
  /**
   * Per-step option overrides, keyed by tool slug, merged over that tool's
   * defaultOptions. Needed where a recipe must not inherit a default meant for
   * standalone use (e.g. Images to PDF defaults to "fit", which would blow a
   * 4000px photo up to a 3000pt page before Compress/OCR rasterise it again).
   */
  stepOptions?: Record<string, Record<string, unknown>>;
  status: "live" | "desktop-only";
}

// The A4 + ~8 mm margin layout Images to PDF used before its page-size option existed.
const A4_PAGES = { "images-to-pdf": { page_size: "a4", margin_mm: 8 } };

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
    // OCR must run LAST: web's Compress engine rasterizes every page to a
    // JPEG and rebuilds a brand-new PDF with no text objects, which would
    // destroy OCR's invisible text layer if Compress ran after it. OCR
    // works fine on an already-rasterized PDF (it reads page images either
    // way), so putting it last is safe and is what actually keeps the
    // final result searchable, as the recipe's name promises.
    steps: ["images-to-pdf", "compress", "ocr"],
    stepOptions: A4_PAGES,
    status: "live",
  },
  {
    slug: "flatten-pdf",
    title: "Flatten PDF",
    description: "Rasterize every page and rebuild the PDF from the images, stripping anything but the visual page content.",
    steps: ["pdf-to-images", "images-to-pdf"],
    stepOptions: A4_PAGES,
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

/**
 * True when any of this recipe's steps runs at "preview" quality on web
 * (e.g. Compress or Convert images), matching the same single-tool
 * PreviewBadge pattern ToolsIndex/ToolDetail already use -- a recipe that
 * passes through a preview-quality step is itself only as good as that
 * step's own result.
 */
export function recipeHasPreviewStep(recipe: RecipeConfig): boolean {
  return recipe.steps.some((slug) => getTool(slug)?.status === "preview");
}
