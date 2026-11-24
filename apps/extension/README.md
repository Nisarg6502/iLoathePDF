# iLoathePDF browser extension

A Manifest V3 extension for Chrome and Edge (Firefox works too) that does two
things, entirely on your computer:

1. **Fit to this form.** Next to every `<input type="file">` on a page it shows a
   small **Fit** button. Click it and the fitter opens over the page: it has
   already read what the field wants (its `accept` and `multiple` attributes, a
   size attribute such as `data-max-size`, and size and format words near the
   field: "Max 200 KB", "Size should be less than 100 kb", "between 20KB and
   50KB", "JPG/JPEG only"). Correct anything it got wrong, drop or pick your
   files, and it converts and compresses them until they fit, then puts the
   result into the page's field (with the `input` and `change` events React,
   Angular and Vue forms listen for) and shows the final size. If the limit
   can't be met it says so and offers the closest result.
2. **Images to PDF from any page.** Right-click an image, **Add image to PDF**.
   The toolbar popup lists what you collected (reorder, remove, or add images
   from your computer) and **Make PDF** builds and downloads the PDF.

Nothing is uploaded. The extension makes no network requests except to load
its own files, and, for "Add image to PDF", to read the one image you
right-clicked from wherever the page loaded it (usually straight from the
browser's cache).

## Build

From the repository root:

```sh
npm ci
npm run build --workspace=apps/extension      # -> apps/extension/dist
npm run test --workspace=apps/extension       # vitest (jsdom + node-canvas)
npm run typecheck --workspace=apps/extension
npm run zip --workspace=apps/extension        # -> apps/extension/release/*-chrome.zip and *-firefox.zip
```

`npm run build` runs Vite three times (see `vite.config.ts`): the popup and
fitter pages as ES modules, then the content script and the background worker
as single classic scripts. `public/` (icons, `_locales`) is copied as is and
`manifest.json` is generated from `src/manifest.ts`, which documents every
permission.

## Load it unpacked

- **Chrome / Edge:** open `chrome://extensions` (or `edge://extensions`), turn
  on Developer mode, click **Load unpacked** and pick `apps/extension/dist`.
- **Firefox (128+):** run `npm run zip`, open `about:debugging#/runtime/this-firefox`,
  click **Load Temporary Add-on…** and pick
  `release/iloathepdf-extension-<version>-firefox.zip`. The Firefox package
  differs only in its manifest: a background *script* instead of a service
  worker, and an add-on id.

To try the Fit button, serve `test-page/form.html` from any local static
server (for example `python -m http.server` in `apps/extension/test-page`),
open it, and click the toolbar button. Each field on that page prints what it
received.

## Permissions, and why

| Permission | Why |
| --- | --- |
| `activeTab` | Temporary access to the current tab, only after you click the toolbar button or one of our right-click items. Used to show the Fit buttons on that page and to read an image you right-clicked. No install warning. |
| `scripting` | To put the content script into that tab, and into sites you chose "Always show" for. |
| `contextMenus` | The "Add image to PDF" and "Fit a file to this form" items. |
| `optional_host_permissions: <all_urls>` | **Not granted at install.** The popup asks for one site (`https://example.com/*`) when you tick "Always show Fit buttons on example.com", or for every site if you tick that. Granting all sites also lets "Add image to PDF" read images from CDNs that don't allow cross-origin reads. |
| `web_accessible_resources: fit.html` (with `use_dynamic_url`) | The fitter opens as an iframe over the page. Its URL changes every browser session, so pages can't load it on their own. |

**The trade-off we chose.** A content script declared for `<all_urls>` would
show the Fit buttons on every page with no clicks, but it would also run on
every page you visit and make the browser warn "Read and change all your data
on all websites" at install. For a privacy tool we made that opt-in: by default
the buttons appear on a page after one click on the toolbar button (or the
right-click item), and you can make that permanent per site, or everywhere,
from the popup. Removing it in the popup (or in the browser's extension
settings) removes both the permission and the registered script.

There is no `storage`, `downloads`, `tabs` or `<all_urls>` host permission at
install. The PDF is downloaded with a plain `<a download>` from the popup.

## Where things run

| Code | Runs in | Does |
| --- | --- | --- |
| `src/content/*` | The web page (isolated world, closed shadow root) | Finds file inputs, reads their constraints, places the buttons, opens the fitter iframe, puts the finished file into the input. No file processing. |
| `src/fit/*` (`fit.html`) | Extension page, in an iframe over the page | All conversion: the website's `compressImages` (`compressImage`), `convertImages`, `imagesToPdf`, `compress` (PDF) and `pdfToImages` engines, imported straight from `apps/web/src/engines`. |
| `src/popup/*` (`popup.html`) | Extension page | Images to PDF with the `imagesToPdf` engine; the per-site switch. |
| `src/background/*` | Service worker (Chrome/Edge), event page (Firefox) | Right-click items; fetches the right-clicked image's bytes and stores them in the extension's IndexedDB. |

The fitter and the content script talk over a private `MessageChannel`: the
content script posts one port to the iframe, addressed to the extension's own
origin, so the page can't read the constraints or the files.

The engines are not copied: Vite's `@` alias points at `apps/web/src`, so
there is one copy of each. `tesseract.js` (pulled in by `compress.ts` via
`ocr.ts`) is aliased to a stub in the extension build: OCR isn't shipped, and
this keeps its library and default CDN URLs out of the bundle. pdf.js runs
with its worker bundled as `assets/pdf.worker-*.mjs`; the pages' CSP is the
MV3 default, `script-src 'self' 'wasm-unsafe-eval'`.

## How fitting works

- **Size limits** are parsed by `src/shared/sizeLimit.ts`. A form's "KB" may be
  checked as 1000 or 1024 bytes, so a maximum is read in decimal units and a
  minimum in binary ones; a file inside both passes either check.
- **Format**: `accept` decides, narrowed by format words near the field
  ("image/*" plus "JPG only" means JPEG). A PNG that has to shrink becomes a
  JPEG when the field takes JPEG.
- **Images** (`src/shared/fit.ts`): highest JPEG/WebP quality (92 down to 60)
  that fits at full size; if even 60 is too big, fewer pixels at the highest
  quality that fits. PNG targets shrink pixels only. An image below a minimum
  is re-encoded at top quality and, if needed, enlarged.
- **Images to one PDF** when the field wants a PDF, or takes one file and you
  picked several: each image gets a share of the budget.
- **PDF to smaller PDF**: re-rendered at the highest DPI (150 down to 72) that
  fits, using the website's Compress engine. Text in the result is no longer
  selectable; the fitter says so. A PDF that already fits is left alone.
- **PDF to image** when the field only takes images (first page for a
  one-file field).

## Not in v1

- Talking to the iLoathePDF desktop app (native messaging), e.g. to use its
  Ghostscript engine for text-preserving PDF compression. Planned.
- File inputs inside web components' shadow DOM, and cross-origin iframes the
  page loads from another site (activeTab doesn't cover them; "Always show on
  every site" does).
- HEIC, SVG, Word documents as input; merging several PDFs into one.
- Pixel-dimension requirements ("200 x 230 pixels") are not read yet.
- In Firefox, choosing files in the popup's "Add from computer" can close the
  popup; use right-click or the fitter's standalone page instead.
