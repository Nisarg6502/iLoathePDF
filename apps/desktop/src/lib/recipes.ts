/**
 * Recipes: multi-step chains over the existing tools.
 *
 * A step is a tool id plus the settings it runs with; those settings are
 * merged over the tool's own `defaults` in tools.ts (see recipeRun.ts), so a
 * recipe only spells out what it changes.
 *
 * The built-ins are the everyday jobs people bring to a cyber cafe or a print
 * shop counter: squeezing a document under a form portal's size limit,
 * turning phone photos into a clean PDF, getting a passport photo or
 * signature down to the few KB an exam form asks for, unlocking an
 * e-Aadhaar, numbering and stamping pages before printing.
 *
 * Mirrors the web app's recipes/registry.tsx, adjusted to this app's engines
 * and option names (Compress has levels, Convert images also resizes, and
 * PDF/A and PDF to Excel are available here).
 *
 * Type-only imports, so scripts/check-recipe-steps.ts can load this file
 * under plain Node.
 */
import type { RecipeStep } from "./chain";

export type { RecipeStep } from "./chain";

export type RecipeCategory = "forms" | "scan" | "office" | "privacy";

export const CATEGORIES: { id: RecipeCategory; label: string; blurb: string }[] = [
  { id: "forms", label: "Forms & uploads", blurb: "Exam, job and government portals with strict size limits" },
  { id: "scan", label: "Scans & photos", blurb: "Phone pictures of paper, iPhone photos, scanned pages" },
  { id: "office", label: "Office & printing", blurb: "Join, number, stamp, split and archive documents" },
  { id: "privacy", label: "Privacy & passwords", blurb: "Lock, unlock and clean up files" },
];

export interface Recipe {
  id: string;
  title: string;
  description: string;
  /** Tool ids with their settings, in order. The recipe accepts what its first step accepts. */
  steps: RecipeStep[];
  category?: RecipeCategory;
  /** A short "good for" line, e.g. "SSC, UPSC, bank exams". */
  goodFor?: string;
  /** Shown first. */
  popular?: boolean;
  /** True for a user-built recipe (stored on this machine), absent for a built-in. */
  custom?: boolean;
}

/** A4 pages with a small margin: what a recipe wants from Images to PDF instead of the standalone "fit". */
export const A4_PAGE = { page_size: "a4", margin_mm: 8 };

export const RECIPES: Recipe[] = [
  // ---- Forms & uploads -----------------------------------------------------
  {
    id: "form-upload-pdf",
    title: "Documents for a form upload",
    description: "Join certificates, marksheets and ID into one PDF and shrink it to fit a portal's size limit.",
    goodFor: "College, job and scholarship applications",
    category: "forms",
    popular: true,
    steps: [{ tool: "merge", options: { outputName: "documents" } }, { tool: "compress", options: { level: "strong" } }],
  },
  {
    id: "photos-to-upload-pdf",
    title: "Phone photos to an upload-ready PDF",
    description: "Clean up photos of paper pages like a scanner would, join them, and keep the PDF small.",
    goodFor: "Forms that ask for a single PDF",
    category: "forms",
    popular: true,
    steps: [{ tool: "scan", options: { mode: "enhanced", page_size: "a4" } }, { tool: "compress", options: { level: "strong" } }],
  },
  {
    id: "passport-photo-small",
    title: "Passport photo under 50 KB",
    description: "Any photo, iPhone HEIC included, to a small, resized JPG that exam and job portals accept.",
    goodFor: "SSC, UPSC, bank and state exam forms",
    category: "forms",
    popular: true,
    steps: [{ tool: "convert-image", options: { format: "jpg", quality: 65, resizeMode: "max", max_px: 420, strip_metadata: true } }],
  },
  {
    id: "signature-small",
    title: "Signature image under 20 KB",
    description: "A photo or scan of a signature, shrunk to the tiny JPG most application forms ask for.",
    goodFor: "Exam and job application forms",
    category: "forms",
    steps: [{ tool: "convert-image", options: { format: "jpg", quality: 60, resizeMode: "max", max_px: 300, strip_metadata: true } }],
  },
  {
    id: "pdf-to-jpg-upload",
    title: "PDF pages to small JPGs",
    description: "For portals that only take images: every page as its own compact JPG.",
    goodFor: "Uploading a certificate where only JPG is allowed",
    category: "forms",
    steps: [
      { tool: "pdf-to-image", options: { format: "jpg", dpi: 150 } },
      { tool: "convert-image", options: { format: "jpg", quality: 70, resizeMode: "max", max_px: 1600 } },
    ],
  },
  {
    id: "unlock-and-shrink",
    title: "Unlock and shrink",
    description: "Remove the password from a downloaded PDF, like an e-Aadhaar or a bank statement, then make it small enough to upload.",
    goodFor: "e-Aadhaar, bank statements, payslips",
    category: "forms",
    popular: true,
    steps: [{ tool: "protect", options: { mode: "unlock" } }, { tool: "compress", options: { level: "balanced" } }],
  },

  // ---- Scans & photos ------------------------------------------------------
  {
    id: "scan-to-searchable-pdf",
    title: "Scan to searchable PDF",
    description: "Turn photographed pages into one small PDF you can search and copy text from.",
    goodFor: "Notes, books, old letters",
    category: "scan",
    popular: true,
    steps: [{ tool: "image-to-pdf", options: A4_PAGE }, { tool: "compress" }, { tool: "ocr" }],
  },
  {
    id: "iphone-photos-to-jpg",
    title: "iPhone photos to JPG",
    description: "Convert HEIC photos into JPGs that open anywhere, resized for WhatsApp, email or printing.",
    goodFor: "Photos that won't open on Windows",
    category: "scan",
    steps: [{ tool: "convert-image", options: { format: "jpg", quality: 85, resizeMode: "max", max_px: 2400 } }],
  },
  {
    id: "bw-scan-for-printing",
    title: "Black & white scan for printing",
    description: "Photos of documents to crisp black-on-white A4 pages that print cleanly and save toner.",
    goodFor: "Printing copies at the counter",
    category: "scan",
    steps: [{ tool: "scan", options: { mode: "bw", page_size: "a4" } }, { tool: "compress", options: { level: "balanced" } }],
  },
  {
    id: "trim-scan-borders",
    title: "Trim scan borders",
    description: "Cut the dark edges off scanned pages, then shrink the result.",
    goodFor: "Scanner glass shadows, phone-scan edges",
    category: "scan",
    steps: [{ tool: "crop", options: { top: 3, right: 3, bottom: 3, left: 3 } }, { tool: "compress", options: { level: "balanced" } }],
  },
  {
    id: "scan-to-archive",
    title: "Scan to archive",
    description: "Photos of pages to one searchable PDF/A, the format offices and courts keep for the long term.",
    goodFor: "Record rooms, deeds, long-term storage",
    category: "scan",
    steps: [{ tool: "scan", options: { mode: "enhanced", page_size: "a4" } }, { tool: "ocr" }, { tool: "pdfa" }],
  },
  {
    id: "flatten-pdf",
    title: "Rebuild as pictures",
    description: "Turn every page into a picture and rebuild the PDF, stripping everything but what you see.",
    goodFor: "Stubborn PDFs that won't print right",
    category: "scan",
    steps: [{ tool: "pdf-to-image" }, { tool: "image-to-pdf", options: A4_PAGE }],
  },

  // ---- Office & printing ---------------------------------------------------
  {
    id: "merge-compress",
    title: "Merge and compress for email",
    description: "Combine PDFs, then shrink the result so it fits in an email.",
    goodFor: "Email attachment limits",
    category: "office",
    steps: [{ tool: "merge" }, { tool: "compress" }],
  },
  {
    id: "merge-number-pages",
    title: "Merge with page numbers",
    description: "Join documents into one file and number every page, ready to print or submit.",
    goodFor: "Project files, tender documents, theses",
    category: "office",
    popular: true,
    steps: [
      { tool: "merge", options: { outputName: "combined" } },
      { tool: "watermark", options: { mode: "page_numbers", pages: "all", pageNumberPosition: "bottom-center", pageNumberFormat: "n-of-total" } },
    ],
  },
  {
    id: "stamp-copy",
    title: "Mark as COPY",
    description: "Put COPY across every page, then rebuild the pages as pictures so the mark can't simply be deleted.",
    goodFor: "Sharing ID or certificate copies",
    category: "office",
    steps: [
      { tool: "watermark", options: { mode: "watermark", pages: "all", watermarkText: "COPY", watermarkOpacity: 0.3, watermarkPlacement: "tiled" } },
      { tool: "pdf-to-image", options: { format: "jpg", dpi: 150 } },
      { tool: "image-to-pdf", options: { page_size: "fit" } },
    ],
  },
  {
    id: "split-every-page",
    title: "Every page as its own PDF",
    description: "Split a PDF into single pages and keep each one small.",
    goodFor: "Uploading documents one by one",
    category: "office",
    steps: [{ tool: "split", options: { mode: "every", every: 1 } }, { tool: "compress", options: { level: "balanced" } }],
  },
  {
    id: "text-files-to-one-pdf",
    title: "Text files to one PDF",
    description: "Turn several .txt files into PDFs and join them into one, in the order you add them.",
    goodFor: "Notes, logs, plain-text letters",
    category: "office",
    steps: [{ tool: "txt-to-pdf" }, { tool: "merge", options: { outputName: "notes" } }],
  },
  {
    id: "zip-to-small-pdf",
    title: "ZIP to one small PDF",
    description: "Everything inside a ZIP (photos, PDFs, text) joined into one PDF and compressed.",
    goodFor: "Files sent as a ZIP over email or WhatsApp",
    category: "office",
    steps: [{ tool: "zip-to-pdf", options: { page_size: "a4" } }, { tool: "compress", options: { level: "balanced" } }],
  },
  {
    id: "merge-extract-tables",
    title: "Merge and extract tables",
    description: "Combine PDF reports, then extract every table into one spreadsheet.",
    goodFor: "Bank statements, reports",
    category: "office",
    steps: [{ tool: "merge" }, { tool: "pdf-to-excel" }],
  },
  {
    id: "merge-to-pdfa",
    title: "Merge for archiving",
    description: "Join documents and convert the result to PDF/A for long-term storage.",
    goodFor: "Office records, submissions that ask for PDF/A",
    category: "office",
    steps: [{ tool: "merge", options: { outputName: "archive" } }, { tool: "pdfa" }],
  },

  // ---- Privacy & passwords -------------------------------------------------
  {
    id: "merge-and-lock",
    title: "Merge and lock",
    description: "Join documents into one PDF that needs a password to open.",
    goodFor: "Sending personal documents by email",
    category: "privacy",
    steps: [{ tool: "merge", options: { outputName: "documents" } }, { tool: "protect", options: { mode: "protect" } }],
  },
  {
    id: "confidential-lock",
    title: "Confidential and locked",
    description: "Stamp CONFIDENTIAL across every page, then lock the PDF with a password.",
    goodFor: "Salary slips, contracts, medical reports",
    category: "privacy",
    steps: [
      { tool: "watermark", options: { mode: "watermark", pages: "all", watermarkText: "CONFIDENTIAL", watermarkOpacity: 0.25 } },
      { tool: "protect", options: { mode: "protect" } },
    ],
  },
  {
    id: "clean-copy-locked",
    title: "Clean copy, then lock",
    description: "Rebuild every page as a picture, dropping hidden text, links and form data, then lock it.",
    goodFor: "Sharing a document with nothing hidden in it",
    category: "privacy",
    steps: [
      { tool: "pdf-to-image", options: { format: "jpg", dpi: 150 } },
      { tool: "image-to-pdf", options: { page_size: "fit" } },
      { tool: "protect", options: { mode: "protect" } },
    ],
  },
  {
    id: "unlock-print-ready",
    title: "Unlock for printing",
    description: "Remove a PDF's password and bake in filled form fields so it prints exactly as it looks.",
    goodFor: "Filled forms and locked e-documents",
    category: "privacy",
    steps: [{ tool: "protect", options: { mode: "unlock" } }, { tool: "flatten" }],
  },
];
