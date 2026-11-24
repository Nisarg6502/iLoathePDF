# Changelog

All notable changes to the iLoathePDF desktop app. The same notes appear in the
app under Settings → About. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [0.9.0] - 2026-11-25

### Added
- iLoathePDF in File Explorer's right-click menu. Right-click PDFs for Merge
  PDFs, Compress, Split, Convert to images and Protect with password;
  right-click images for Convert to PDF, Convert image format and Make
  scanned PDF. Works with many files selected at once, and is labelled in the
  language you picked in the installer. On Windows 11 it is under
  "Show more options".
- Send to → iLoathePDF: the app picks the tool from the files you send
  (images → Images to PDF, several PDFs → Merge).
- Opening files with the app ("Open with", or dropping them on the app's
  icon) now loads them instead of being ignored.
- Files sent while the app is already open go to that window instead of
  starting a second copy, and the tool always opens for you to check before
  anything runs.

## [0.8.0] - 2026-11-24

### Added
- Text tools, in a new Text section of the sidebar and the home screen:
  - Word counter: words, characters (with and without spaces), sentences,
    paragraphs, reading and speaking time, and a count for the selection.
    Shows your most-used words and phrases, a readability score, and progress
    against a limit (tweet, SMS, meta description and more, or your own).
    Opens PDF, Word (.docx), .txt, .md and .csv files from a dialog or a drop
    on the window. Change case and clean-ups (extra spaces, line breaks, empty
    lines) with Undo.
  - Compare texts: word-by-word differences between two versions, inline or
    side by side, optionally ignoring case and extra spaces.
- Text never leaves the computer and is not saved.

### Changed
- The sidebar's tool list scrolls when the window is too short, so Settings
  and the collapse button always stay visible.

## [0.7.1] - 2026-11-24

### Changed
- Every screen is now translated into Spanish, French, Hindi, Marathi and
  Kannada: tool options, recipes and the recipe builder, results, error
  messages, settings and update notices. 0.7.0 covered only the main screens.
- Counted text has proper singular forms in every language, English included
  ("1 file" instead of "1 files").

### Fixed
- The signature dialog's "Saved initialss" heading.

## [0.7.0] - 2026-11-23

### Added
- Interface translations: Spanish, French, Hindi, Marathi and Kannada. Choose
  a language at the top of Settings. On first launch the app uses the
  installer's choice, then the Windows language. Anything not yet translated
  shows in English.
- The installer has a language screen (English, Spanish, French, Hindi) and
  remembers the choice, so it doesn't ask again on updates.
- Bundled Noto Sans Devanagari and Kannada fonts for Indian scripts, loaded
  only when that script is shown.

### Changed
- New app icon: the iLoathePDF mark, a page with one line redacted, the same
  logo as the website.

### Security
- Updated `cookie` to 0.18.3 (RUSTSEC-2026-0594).

## [0.6.0] - 2026-11-22

### Added
- Recipes rebuilt. Every step has its own settings, set once when you build
  the recipe or changed for a single run. 18 tools can be chained (was 7),
  including Split, Crop, Watermark/Page numbers/Stamp, Flatten, Protect and
  Unlock, PDF/A, PDF Scanner and the document converters.
- A visual recipe builder: drag tools into the chain or between steps, drag to
  reorder, and see what flows between steps. Steps that can't work turn red and
  say why, with a one-click fix; risky orders are flagged in amber.
- 24 ready-made recipes for everyday counter jobs: documents for a form upload,
  passport photo under 50 KB, signature under 20 KB, unlock an e-Aadhaar and
  shrink it, merge with page numbers, mark as COPY, scan to archive and more.
  A new Recipes screen lists them by category, with search.
- Recipes work on a batch: drop several files on a recipe whose first tool
  takes one file, and each goes through on its own.
- The run screen lights each step up as it runs and shows what it did.
  Passwords are asked for each time and never saved.
- Recipe codes: copy a recipe as a code and paste it on another computer.

### Security
- Updated the `url` library to 2.5.9 (RUSTSEC-2026-0592: a stack overflow on
  nested `blob:` URLs).

### Changed
- Only a recipe's final result is written to the output folder. Files from the
  steps before it go into an "iLoathePDF recipe steps" folder next to it.

## [0.5.3] - 2026-11-17

### Changed
- Much smaller installer. It no longer bundles Microsoft's full WebView2 runtime
  (~250 MB), which Windows 11 and updated Windows 10 already have. A 2 MB
  bootstrapper fetches it only on a PC that lacks it.
- Smaller install on disk: the bundled Ghostscript now ships without its
  manuals, examples and an unused VC++ installer, and the document engine
  leaves out the Tk GUI toolkit and the AVIF codec it never used. The app
  binary is built with link-time optimisation. Output quality is unchanged.

### Fixed
- Compress, PDF/A and OCR could fail to start Ghostscript on a PC without the
  Visual C++ runtime installed. The runtime DLLs now ship next to Ghostscript.

### Security
- The in-app updater no longer includes the `zip` library
  (RUSTSEC-2026-0545, RUSTSEC-2026-0548). It was only used for .zip update
  bundles, and updates are a signed setup .exe.

## [0.5.2] - 2026-11-17

### Fixed
- Updates failing on slower or unreliable connections: the installer download
  now resumes where it left off if the connection drops, instead of failing
  and starting over.
- Update errors now say what went wrong (the connection, or the file not
  passing the signature check) rather than one vague message.

## [0.5.1] - 2026-11-15

### Security
- Updated the image library (Pillow 13) and HEIC support (pillow-heif 1.8),
  which parse untrusted images and had published security advisories.
- Refreshed Rust dependencies of the app shell (tokio, rustix and others).

## [0.5.0] - 2026-11-09

### Added
- In-app updates: when the update check finds a new version, **Update now**
  downloads it in the background and **Restart & update** installs it and
  reopens the app.
- Optional background downloads (Settings), off by default.

### Security
- Updates are signed; the app verifies every download against a key built into
  it and discards anything that doesn't match. Versions before 0.5.0 can't
  update themselves, so install 0.5.0 once by hand.

## [0.4.0] - 2026-11-09

### Added
- Nine new tools: Crop PDF, Flatten PDF, PDF to PDF/A, PDF Reader, PDF Scanner,
  and TXT, CSV, HTML and ZIP to PDF.
- Sign & Fill can highlight and draw boxes on the page.

### Known limitations
- PDF to PDF/A is best-effort (PDF/A-2b via Ghostscript, not run through a
  validator).
- The desktop reader can search and zoom but not select text yet; text-to-PDF
  tools don't support scripts that need shaping (Devanagari, Arabic).

## [0.3.0] - 2026-11-08

### Added
- Optional update check (Settings → Updates), off by default. It asks GitHub
  for the latest release number and sends nothing about you or your files.
- The title bar shows UPDATE CHECK ON instead of OFFLINE while it is enabled.

## [0.2.0] - 2026-11-07

### Added
- Tools: Sign & Fill, Protect & Unlock, Watermark / Page numbers / Stamp,
  Redact, OCR to Searchable PDF and PDF to Excel.
- Recipes: Merge → Compress, Scan to Searchable PDF, Flatten PDF and
  Merge → Extract Tables.
- Images to PDF: page size, orientation, margin, output name and ordering.
- Images: rotate and crop before converting; scan pages with a camera.

### Changed
- Organize keeps each page's rotation and saves as `<name>-organized` rather
  than overwriting.

### Fixed
- Every job failed with "file was moved or deleted" on Windows because of how
  backslash paths were handled.
- The Sign & Fill page list now scrolls for long PDFs.

## [0.1.0] - 2026-09-04

First release.

[0.6.0]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.6.0
[0.5.3]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.5.3
[0.5.2]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.5.2
[0.5.1]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.5.1
[0.5.0]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.5.0
[0.4.0]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.4.0
[0.3.0]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.3.0
[0.2.0]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.2.0
[0.1.0]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.1.0
