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
    version: "0.8.0",
    date: "2026-11-24",
    highlights: [
      "New Text section with a word counter: words, characters, sentences, paragraphs and reading time as you type, plus the count for whatever you select.",
      "The word counter also shows your most-used words, a readability score, and how close you are to a limit (a tweet, an SMS, a meta description, or your own).",
      "Open a PDF, Word or text file into the word counter, or drop it on the window. Change case and clean up spacing and line breaks in one click, with Undo.",
      "Compare texts: paste two versions and see every word that was added or removed, inline or side by side.",
      "Like everything else in the app, your text stays on this computer and is never saved.",
      "The sidebar's tool list scrolls in short windows, so Settings is always in reach.",
    ],
  },
  {
    version: "0.7.1",
    date: "2026-11-24",
    highlights: [
      "Every screen is now translated into Spanish, French, Hindi, Marathi and Kannada: tool options, recipes and the recipe builder, results, error messages and update notices. 0.7.0 covered only the main screens.",
      "Counts read naturally in every language, for example “1 file” instead of “1 files”.",
      "Fixed the signature dialog's “Saved initialss” heading.",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-11-23",
    highlights: [
      "The app now speaks Spanish, French, Hindi, Marathi and Kannada. Pick a language at the top of Settings; on first launch it follows the language you chose in the installer, then your Windows language.",
      "The installer asks which language you'd like (English, Spanish, French or Hindi) and remembers it, so the question doesn't come back on updates.",
      "Hindi, Marathi and Kannada text uses fonts that ship with the app. Nothing is downloaded from another server.",
      "A new app icon: a page with one line blacked out, the same logo as iloathepdf.com.",
      "Security: updated the cookie-handling library (RUSTSEC-2026-0594).",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-11-22",
    highlights: [
      "Recipes, rebuilt: give every step its own settings, chain 18 tools (was 7), and run a recipe on several files at once.",
      "A visual recipe builder: drag tools into the chain, reorder them, and see what passes between steps. A step that can't work turns red and says why, with a one-click fix.",
      "24 ready-made recipes for everyday jobs: documents for a form upload, passport photo under 50 KB, unlock an e-Aadhaar and shrink it, merge with page numbers, mark as COPY, scan to archive and more. Find them all on the new Recipes screen.",
      "While a recipe runs, each step lights up and shows what it did. Passwords are asked for each time and never saved.",
      "Copy a recipe as a code and paste it on another computer to set up the same recipe there.",
      "Only a recipe's final result goes to your output folder; files from the steps before it go in an \"iLoathePDF recipe steps\" folder next to it.",
      "Security: updated the URL-parsing library to fix a crash it could hit on unusual nested addresses (RUSTSEC-2026-0592).",
    ],
  },
  {
    version: "0.5.3",
    date: "2026-11-17",
    highlights: [
      "Much smaller download: the installer is about 60 MB instead of over 300 MB. It no longer carries Microsoft's WebView2 runtime, which Windows already has; a small helper fetches it only on a PC that lacks it.",
      "Takes less space once installed: unused manuals, samples and libraries were left out. Output quality is unchanged.",
      "Fixed Compress, PDF/A and OCR failing on PCs without the Visual C++ runtime installed.",
      "Security: removed a zip library from the updater that had published advisories; it was never needed, since updates are a signed installer.",
    ],
  },
  {
    version: "0.5.2",
    date: "2026-11-17",
    highlights: [
      "Fixed updates failing on slower or unreliable connections: the download now picks up where it left off if the connection drops, instead of failing and starting over.",
      "Update errors now say what actually went wrong (the connection, or the file not passing the signature check) instead of one vague message.",
    ],
  },
  {
    version: "0.5.1",
    date: "2026-11-15",
    highlights: [
      "Security: updated the image libraries (Pillow 13 and HEIC support) that open your photos and scans, after published security advisories, and refreshed the app shell's Rust dependencies.",
      "Nothing about how your files are handled changed: they still never leave your computer.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-11-09",
    highlights: [
      "Updates install themselves: when the update check finds a new version, press Update now. It downloads in the background while you keep working, then Restart & update installs it and reopens the app.",
      "Optional: switch on background downloads in Settings and new versions are fetched as soon as they are found (the installer is large, so it is off by default). Nothing is ever installed without you pressing Restart & update.",
      "Updates are signed. The app checks every download against a key built into it and throws away anything that does not match. Versions before 0.5.0 cannot update themselves, so install 0.5.0 once by hand.",
    ],
  },
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
