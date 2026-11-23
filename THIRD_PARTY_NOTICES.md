# Third-party notices

iLoathePDF's own code is [MIT licensed](LICENSE). The software below is
bundled into the desktop installer or the web app and keeps its own license.
This list covers the main components; each package's own license file (inside
its installed folder, and in the installer's `sidecar/` and `vendor/` folders)
is authoritative.

## Bundled into the desktop installer

| Component | Version | License | Role |
| --- | --- | --- | --- |
| [Ghostscript](https://ghostscript.com/) | 10.07.1 | **AGPL-3.0** | Compress, PDF to images, PDF/A, redaction, OCR page rendering |
| [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) | 5.5.3 | Apache-2.0 | OCR text recognition |
| [Tauri](https://tauri.app/) | 2.x | MIT or Apache-2.0 | Desktop shell |
| [pikepdf](https://github.com/pikepdf/pikepdf) / QPDF | 10.12.0 | MPL-2.0 (QPDF: Apache-2.0) | PDF structure, merge, split, encryption |
| [Pillow](https://python-pillow.org/) | 13.0.0 | MIT-CMU (HPND) | Image processing |
| [pillow-heif](https://github.com/bigcat88/pillow_heif) / libheif | 1.8.1 | BSD-3-Clause (libheif: **LGPL-3.0**) | HEIC support |
| [img2pdf](https://gitlab.mister-muffin.de/josch/img2pdf) | 0.6.3 | **LGPL-3.0** | Lossless images to PDF |
| [ReportLab](https://www.reportlab.com/opensource/) | 5.0.1 | BSD-3-Clause | Text, CSV, HTML to PDF |
| [pdfplumber](https://github.com/jsvine/pdfplumber) | 0.11.10 | MIT | Table extraction |
| [openpyxl](https://openpyxl.readthedocs.io/) | 3.1.5 | MIT | Excel output |
| [PyInstaller](https://pyinstaller.org/) | 6.22.2 | GPL-2.0-or-later with a bootloader exception | Freezes the engine into an executable |
| React, React Router, Motion, dnd-kit, Lucide, Tailwind CSS | see `package.json` | MIT / ISC / Apache-2.0 | Interface |
| [i18next](https://www.i18next.com/), [react-i18next](https://react.i18next.com/) | see `packages/i18n/package.json` | MIT | Interface translations |
| [pdf.js](https://mozilla.github.io/pdf.js/) | 6.3.x | Apache-2.0 | Page thumbnails and the reader |

### Where to get the source of the copyleft components

- **Ghostscript (AGPL-3.0)** is run as a separate program; iLoathePDF does not
  link to it. The corresponding source for the bundled version is published by
  Artifex at <https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/tag/gs10071>
  and <https://ghostscript.com/releases/>. If you want the exact source for a
  build you received and can't find it, open an issue and it will be provided.
- **img2pdf and libheif (LGPL-3.0)** ship as separate, replaceable libraries in
  the installer's `sidecar/` folder (PyInstaller one-folder layout), and their
  source is available from the links above and from their PyPI project pages.
- **PyInstaller's bootloader** is covered by its license exception, which
  permits distributing the frozen application under any license.

## Used by the web app

[pdf-lib](https://pdf-lib.js.org/) (MIT), [pdf.js](https://mozilla.github.io/pdf.js/)
(Apache-2.0), [fflate](https://github.com/101arrowz/fflate) (MIT),
[tesseract.js](https://github.com/naptha/tesseract.js) and its core (Apache-2.0),
`@pdfsmaller/pdf-encrypt` and `@pdfsmaller/pdf-decrypt` (MIT), React, React
Router, Motion, i18next and react-i18next (MIT). The English Tesseract language data is distributed
under Apache-2.0.

## Fonts (both apps, self-hosted, never fetched from a CDN)

- **General Sans**, Indian Type Foundry, under the
  [Fontshare Free Font License](https://www.fontshare.com/licenses/ffl)
  (free for personal and commercial use, including embedding in apps).
- **Space Mono**, Colophon Foundry, under the
  [SIL Open Font License 1.1](https://openfontlicense.org/).
- **Noto Sans Devanagari**, The Noto Project Authors, under the
  [SIL Open Font License 1.1](https://openfontlicense.org/), packaged by
  [Fontsource](https://fontsource.org/). Used for Hindi text; the web app
  only downloads it when a page shows Devanagari.

## Keeping this current

Run `npm ls --prod --all`, `pip-audit -r apps/desktop/sidecar/requirements.txt`
and `cargo tree` to see the full dependency graph, including transitive
packages not listed here. When you add a dependency that ships to users, add
a row above.
