# Changelog

All notable changes to the iLoathePDF desktop app. The same notes appear in the
app under Settings → About. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

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

[0.5.1]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.5.1
[0.5.0]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.5.0
[0.4.0]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.4.0
[0.3.0]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.3.0
[0.2.0]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.2.0
[0.1.0]: https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.1.0
