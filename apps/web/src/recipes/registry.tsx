/**
 * Recipes: multi-step chains over the existing tools.
 *
 * A step is a tool slug plus the settings it runs with; those settings are
 * merged over the tool's own `defaultOptions` in tools/registry.tsx (see
 * runRecipe.ts), so a recipe only spells out what it changes.
 *
 * The built-ins below are the everyday jobs people bring to a cyber cafe or
 * a print shop counter: squeezing a document under a form portal's size
 * limit, turning phone photos into a clean PDF, getting a passport photo or
 * signature down to the few KB an exam form asks for, unlocking an e-Aadhaar,
 * numbering and stamping pages before printing.
 */
import { getTool } from "@/tools/registry";
import type { RecipeStep } from "./chain";
import { getCustomRecipe } from "./customRecipes";

export type { RecipeStep } from "./chain";

export type RecipeCategory = "forms" | "scan" | "office" | "privacy";

export const CATEGORIES: { id: RecipeCategory; label: string; blurb: string }[] = [
  { id: "forms", label: "Forms & uploads", blurb: "Exam, job and government portals with strict size limits" },
  { id: "scan", label: "Scans & photos", blurb: "Phone pictures of paper, iPhone photos, scanned pages" },
  { id: "office", label: "Office & printing", blurb: "Join, number, stamp and split documents" },
  { id: "privacy", label: "Privacy & passwords", blurb: "Lock, unlock and clean up files" },
];

export interface RecipeConfig {
  slug: string;
  title: string;
  description: string;
  steps: RecipeStep[];
  status: "live" | "desktop-only";
  category?: RecipeCategory;
  /** A short "good for" line on the card, e.g. "SSC, UPSC, bank exams". */
  goodFor?: string;
  /** Shown first in the gallery. */
  popular?: boolean;
  /** True for a user-built recipe (stored in this browser), false/absent for a built-in. */
  custom?: boolean;
}

/** A4 pages with a small margin: what a recipe wants from Images to PDF instead of the standalone "fit to image". */
export const A4_PAGE = { page_size: "a4", margin_mm: 8 };

export const RECIPES: RecipeConfig[] = [
  // ---- Forms & uploads -----------------------------------------------------
  {
    slug: "form-upload-pdf",
    title: "Documents for a form upload",
    description: "Join certificates, marksheets and ID into one PDF and shrink it to fit a portal's size limit.",
    goodFor: "College, job and scholarship applications",
    category: "forms",
    popular: true,
    status: "live",
    steps: [
      { tool: "merge", options: { outputName: "documents" } },
      { tool: "compress", options: { dpi: 80 } },
    ],
  },
  {
    slug: "photos-to-upload-pdf",
    title: "Phone photos to an upload-ready PDF",
    description: "Clean up photos of paper pages like a scanner would, join them, and keep the PDF small.",
    goodFor: "Forms that ask for a single PDF",
    category: "forms",
    popular: true,
    status: "live",
    steps: [
      { tool: "scan", options: { mode: "enhanced", page_size: "a4", outputName: "scan" } },
      { tool: "compress", options: { dpi: 96 } },
    ],
  },
  {
    slug: "passport-photo-small",
    title: "Passport photo under 50 KB",
    description: "Any PNG, JPG or WebP photo to a small, resized JPG that exam and job portals accept.",
    goodFor: "SSC, UPSC, bank and state exam forms",
    category: "forms",
    popular: true,
    status: "live",
    steps: [
      { tool: "convert-images", options: { to: "jpg", quality: 92 } },
      { tool: "compress-images", options: { quality: 65, format: "jpg", maxDimension: 420 } },
    ],
  },
  {
    slug: "signature-small",
    title: "Signature image under 20 KB",
    description: "A photo or scan of a signature, shrunk to the tiny JPG most application forms ask for.",
    goodFor: "Exam and job application forms",
    category: "forms",
    status: "live",
    steps: [
      { tool: "convert-images", options: { to: "jpg", quality: 92 } },
      { tool: "compress-images", options: { quality: 60, format: "jpg", maxDimension: 300 } },
    ],
  },
  {
    slug: "pdf-to-jpg-upload",
    title: "PDF pages to small JPGs",
    description: "For portals that only take images: every page as its own compact JPG.",
    goodFor: "Uploading a certificate where only JPG is allowed",
    category: "forms",
    status: "live",
    steps: [
      { tool: "pdf-to-images", options: { dpi: 150, format: "jpg" } },
      { tool: "compress-images", options: { quality: 70, format: "jpg", maxDimension: 1600 } },
    ],
  },
  {
    slug: "unlock-and-shrink",
    title: "Unlock and shrink",
    description: "Remove the password from a downloaded PDF, like an e-Aadhaar or a bank statement, then make it small enough to upload.",
    goodFor: "e-Aadhaar, bank statements, payslips",
    category: "forms",
    popular: true,
    status: "live",
    steps: [
      { tool: "protect", options: { mode: "unlock" } },
      { tool: "compress", options: { dpi: 110 } },
    ],
  },

  // ---- Scans & photos ------------------------------------------------------
  {
    slug: "scan-to-searchable-pdf",
    title: "Scan to searchable PDF",
    description: "Turn photographed pages into one small PDF you can search and copy text from.",
    goodFor: "Notes, books, old letters",
    category: "scan",
    popular: true,
    status: "live",
    // OCR must run LAST: web's Compress rasterizes every page and rebuilds a
    // PDF with no text objects, which would destroy OCR's text layer if it
    // ran after OCR. The chain rules (chain.ts) warn about exactly this.
    steps: [
      { tool: "images-to-pdf", options: A4_PAGE },
      { tool: "compress" },
      { tool: "ocr" },
    ],
  },
  {
    slug: "photos-for-sharing",
    title: "Big photos to light JPGs",
    description: "Turn heavy PNG or camera photos into JPGs a fraction of the size, for WhatsApp, email or printing.",
    goodFor: "Camera photos, screenshots",
    category: "scan",
    status: "live",
    steps: [
      { tool: "convert-images", options: { to: "jpg", quality: 90 } },
      { tool: "compress-images", options: { quality: 80, format: "jpg", maxDimension: 2400 } },
    ],
  },
  {
    slug: "bw-scan-for-printing",
    title: "Black & white scan for printing",
    description: "Photos of documents to crisp black-on-white A4 pages that print cleanly and save toner.",
    goodFor: "Printing copies at the counter",
    category: "scan",
    status: "live",
    steps: [
      { tool: "scan", options: { mode: "bw", page_size: "a4", outputName: "scan" } },
      { tool: "compress", options: { dpi: 150 } },
    ],
  },
  {
    slug: "trim-scan-borders",
    title: "Trim scan borders",
    description: "Cut the dark edges off scanned pages, then shrink the result.",
    goodFor: "Scanner glass shadows, phone-scan edges",
    category: "scan",
    status: "live",
    steps: [
      { tool: "crop", options: { top: 3, right: 3, bottom: 3, left: 3 } },
      { tool: "compress", options: { dpi: 120 } },
    ],
  },
  {
    slug: "flatten-pdf",
    title: "Rebuild as pictures",
    description: "Turn every page into a picture and rebuild the PDF, stripping everything but what you see.",
    goodFor: "Stubborn PDFs that won't print right",
    category: "scan",
    status: "live",
    steps: [
      { tool: "pdf-to-images" },
      { tool: "images-to-pdf", options: A4_PAGE },
    ],
  },

  // ---- Office & printing ---------------------------------------------------
  {
    slug: "merge-compress",
    title: "Merge and compress for email",
    description: "Combine PDFs, then shrink the result so it fits in an email.",
    goodFor: "Email attachment limits",
    category: "office",
    status: "live",
    steps: [{ tool: "merge" }, { tool: "compress" }],
  },
  {
    slug: "merge-number-pages",
    title: "Merge with page numbers",
    description: "Join documents into one file and number every page, ready to print or submit.",
    goodFor: "Project files, tender documents, theses",
    category: "office",
    popular: true,
    status: "live",
    steps: [
      { tool: "merge", options: { outputName: "combined" } },
      { tool: "watermark", options: { mode: "page_numbers", pages: "all", page_numbers: { position: "bottom-center", format: "n-of-total", start: 1 } } },
    ],
  },
  {
    slug: "stamp-copy",
    title: "Mark as COPY",
    description: "Put a diagonal COPY across every page and bake it into the page so it can't simply be deleted.",
    goodFor: "Sharing ID or certificate copies",
    category: "office",
    status: "live",
    steps: [
      { tool: "watermark", options: { mode: "watermark", pages: "all", watermark: { content: "text", text: "COPY", opacity: 0.3, rotation: 45, placement: "tiled" } } },
      { tool: "compress", options: { dpi: 130 } },
    ],
  },
  {
    slug: "split-every-page",
    title: "Every page as its own PDF",
    description: "Split a PDF into single pages and keep each one small.",
    goodFor: "Uploading documents one by one",
    category: "office",
    status: "live",
    steps: [
      { tool: "split", options: { mode: "everyN", n: 1 } },
      { tool: "compress", options: { dpi: 110 } },
    ],
  },
  {
    slug: "text-files-to-one-pdf",
    title: "Text files to one PDF",
    description: "Turn several .txt files into PDFs and join them into one, in the order you add them.",
    goodFor: "Notes, logs, plain-text letters",
    category: "office",
    status: "live",
    steps: [{ tool: "txt-to-pdf" }, { tool: "merge", options: { outputName: "notes" } }],
  },
  {
    slug: "zip-to-small-pdf",
    title: "ZIP to one small PDF",
    description: "Everything inside a ZIP (photos, PDFs, text) joined into one PDF and compressed.",
    goodFor: "Files sent as a ZIP over email or WhatsApp",
    category: "office",
    status: "live",
    steps: [{ tool: "zip-to-pdf", options: { page_size: "a4" } }, { tool: "compress", options: { dpi: 110 } }],
  },
  {
    slug: "merge-extract-tables",
    title: "Merge and extract tables",
    description: "Combine PDF reports, then extract every table into one spreadsheet.",
    category: "office",
    status: "desktop-only",
    steps: [{ tool: "merge" }, { tool: "pdf-to-excel" }],
  },

  // ---- Privacy & passwords -------------------------------------------------
  {
    slug: "merge-and-lock",
    title: "Merge and lock",
    description: "Join documents into one PDF that needs a password to open.",
    goodFor: "Sending personal documents by email",
    category: "privacy",
    status: "live",
    steps: [{ tool: "merge", options: { outputName: "documents" } }, { tool: "protect", options: { mode: "protect" } }],
  },
  {
    slug: "confidential-lock",
    title: "Confidential and locked",
    description: "Stamp CONFIDENTIAL across every page, then lock the PDF with a password.",
    goodFor: "Salary slips, contracts, medical reports",
    category: "privacy",
    status: "live",
    steps: [
      { tool: "watermark", options: { mode: "watermark", pages: "all", watermark: { content: "text", text: "CONFIDENTIAL", opacity: 0.25, rotation: 45, placement: "single" } } },
      { tool: "protect", options: { mode: "protect" } },
    ],
  },
  {
    slug: "clean-copy-locked",
    title: "Clean copy, then lock",
    description: "Rebuild every page as a picture, dropping hidden text, links and form data, then lock it.",
    goodFor: "Sharing a document with nothing hidden in it",
    category: "privacy",
    status: "live",
    steps: [{ tool: "compress", options: { dpi: 150 } }, { tool: "protect", options: { mode: "protect" } }],
  },
  {
    slug: "unlock-print-ready",
    title: "Unlock for printing",
    description: "Remove a PDF's password and bake in filled form fields so it prints exactly as it looks.",
    goodFor: "Filled forms and locked e-documents",
    category: "privacy",
    status: "live",
    steps: [{ tool: "protect", options: { mode: "unlock" } }, { tool: "flatten" }],
  },
];

export function getRecipe(slug: string): RecipeConfig | undefined {
  return RECIPES.find((r) => r.slug === slug) ?? getCustomRecipe(slug);
}

/**
 * True when any of this recipe's steps runs at "preview" quality on web
 * (e.g. Compress or Convert images), matching the single-tool PreviewBadge
 * pattern ToolsIndex/ToolDetail use.
 */
export function recipeHasPreviewStep(recipe: RecipeConfig): boolean {
  return recipe.steps.some((s) => getTool(s.tool)?.status === "preview");
}
