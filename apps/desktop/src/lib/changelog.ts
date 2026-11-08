/**
 * Release notes shown in Settings → About. Newest first.
 *
 * Cutting a release: add the new entry at the TOP, then bump the version
 * everywhere (package.json, src-tauri/Cargo.toml + Cargo.lock,
 * src-tauri/tauri.conf.json, sidecar/main.py, package-lock.json). The
 * `check:version` script (run in CI and before a release build) fails if any
 * of them disagree with this file's first entry.
 *
 * Plain data on purpose: no imports, so scripts/check-version.ts can load it
 * under plain Node.
 */
export interface Release {
  version: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  highlights: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: "0.4.0",
    date: "2026-11-09",
    highlights: [
      "Nine new tools: Crop PDF, Flatten PDF, PDF to PDF/A, PDF Reader, PDF Scanner, and TXT, CSV, HTML and ZIP to PDF (under a new “To PDF” group).",
      "Sign & Fill can now highlight and draw boxes on the page, as well as sign and add text.",
      "PDF to PDF/A is best-effort: it produces PDF/A-2b with Ghostscript but the result has not been checked with a validator.",
      "The desktop reader can search and zoom but not select text yet; TXT to PDF and its siblings use a system font, so scripts that need shaping (Devanagari, Arabic) are not supported.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-11-08",
    highlights: [
      "New, optional and off by default: Settings → Updates can tell you when a newer version is available. When on, the app asks GitHub for the latest release number and sends nothing about you or your files; nothing is downloaded or installed for you.",
      "The title bar shows UPDATE CHECK ON instead of OFFLINE while the check is enabled, and switching it off stops all requests.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-11-07",
    highlights: [
      "Fixed: every job failed with “file was moved or deleted” on Windows. Paths with backslashes are now handled correctly.",
      "New tools: Sign & Fill, Protect & Unlock, Watermark / Page numbers / Stamp, Redact, OCR to Searchable PDF and PDF to Excel.",
      "Recipes: one-drop multi-step chains — Merge → Compress, Scan to Searchable PDF, Flatten PDF and Merge → Extract Tables.",
      "Images to PDF: page size (fit / A4 / Letter), orientation, margin and an output name; move files up and down to set the order.",
      "Images: rotate and crop before converting, and scan pages with your camera.",
      "Organize: pages keep their own rotation, and the result is saved as “<name>-organized” instead of overwriting.",
      "Sign & Fill: the page list now scrolls properly for long PDFs.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-09-04",
    highlights: ["First release."],
  },
];

export const LATEST_RELEASE = CHANGELOG[0];
