# Sign & Fill: signature, text, date, initials on PDFs

Status: approved (user going offline; design confirmed via Q&A, proceeding to implementation without further review round-trip)

## Problem

Two independent pieces of work:

1. The website's homepage shows a "network requests since load" counter and a
   "NETWORK PANEL" widget, both wired to `useRequestCount()`. They're
   self-referential (the site counts its own requests to prove it makes none)
   and read as confusing rather than reassuring. Remove them.
2. Neither the website nor the desktop app can add a signature, free text, a
   date, or initials to a PDF. Add a "Sign & Fill" tool to both, in that order
   (website first).

## Part 1 — remove the network panel/status

Delete from `apps/web/src/pages/Home.tsx`:
- The `{reqCount} network requests since load · 0 bytes sent` status chip.
- The "NETWORK PANEL" card (requests / bytes sent / cookies / engine).
- The now-unused `useRequestCount` import and `reqCount` variable.
- The "Verify it yourself: open DevTools → Network…" paragraph's reference to
  the panel stays conceptually fine (DevTools verification is still valid
  advice) but its layout partner (the two-column grid with the panel) becomes
  one column.

`RequestStatusContext`/`useRequestCount` itself is left in place only if
still used elsewhere; if this was its only consumer, remove it too (checked
during implementation).

## Part 2 — Sign & Fill

### Scope (v1, both platforms)

One combined tool. A user opens a PDF, adds any mix of:
- **Signature** — drawn (mouse/touch, freehand) or uploaded (image file).
- **Initials** — same capture mechanism as signature, kept as a distinct
  saved item.
- **Text** — free text box, size + one of a few color swatches.
- **Date** — a date value (defaults to today, editable via a date picker),
  rendered as text with the same size/color controls.

Elements are placed by clicking "Add …", which drops the new element in the
middle of the currently visible page; the user then drags it to position and
drags a corner handle to resize, the same way a sticker/annotation tool
works. One element at a time — no "stamp on every page" shortcut in v1.

Signatures/initials the user creates are remembered in browser storage
(`localStorage` on the website, the equivalent local app-data store on
desktop) so a returning user doesn't redraw every time. Nothing leaves the
device — consistent with the zero-upload promise.

Out of scope for v1: certificate-based/cryptographic signing, multi-page
duplication shortcuts, typed cursive-font signatures, collaborative/shared
signature libraries.

### Shared data model

```ts
type SignElement =
  | {
      id: string;
      kind: "signature" | "initials";
      pageIndex: number; // 0-based
      xPct: number; yPct: number;   // top-left, 0..1 of page box
      wPct: number; hPct: number;   // size, 0..1 of page box
      imageDataUrl: string;         // PNG, transparent where possible
    }
  | {
      id: string;
      kind: "text" | "date";
      pageIndex: number;
      xPct: number; yPct: number;
      wPct: number; hPct: number;
      text: string;
      fontSize: number;   // px at a 96-DPI reference page width
      color: "#000000" | "#1d4ed8" | "#b91c1c";
    };
```

Percent-based placement keeps the element resolution-independent between the
preview canvas (CSS pixels) and the export engine (PDF points): both convert
`(xPct, yPct, wPct, hPct)` against that page's own box, so the same math runs
in the browser engine (pdf-lib) and the sidecar engine (reportlab overlay).

Baking math (shared convention, bottom-left PDF origin):
```
x_pt      = xPct * pageWidthPt
box_top_pt = (1 - yPct) * pageHeightPt
y_pt      = box_top_pt - hPct * pageHeightPt   // bottom edge of the box
w_pt      = wPct * pageWidthPt
h_pt      = hPct * pageHeightPt
```
Images are drawn to fill `(x_pt, y_pt, w_pt, h_pt)`. Text is drawn with its
baseline near the box's vertical center, font size scaled by `pageWidthPt`
so it matches what was shown on screen.

### Website (`apps/web`)

- New tool `sign` in `TOOLS` (registry.tsx), category `pdf`, tint `h`.
- `ToolConfig` gains an optional `Workspace?: ComponentType<{ tool }>`. When
  present, `ToolDetail` renders it instead of the generic `ToolPage` (the
  drop-zone → options-sidebar → run layout doesn't fit a page canvas with
  draggable overlays). Existing tools are unaffected — `Workspace` is
  undefined for all of them.
- `SignWorkspace.tsx`: drop a single PDF, render every page via
  `pdfjs-dist` onto stacked `<canvas>` elements (same technique as
  `pdfToImages.ts`), each wrapped in a relatively-positioned container so
  elements can be absolutely positioned by percent.
- `SignatureCapture.tsx`: modal with two tabs, Draw (freehand canvas,
  pointer events, "Clear"/"Save") and Upload (`<input type=file accept=
  image/*>`). On save, the ink's bounding box is trimmed (scan the alpha
  channel) so the placed box hugs the actual mark, then the PNG data URL is
  handed back and stored via `signatureStore.ts` (localStorage, last 3 per
  kind).
- `SignElementLayer.tsx`: renders the draggable/resizable boxes for the
  current page, pointer-based drag and corner-resize, clamped to the page
  bounds.
- `engines/sign.ts`: `pdf-lib` engine — loads the PDF, for each element
  embeds the PNG (`embedPng`) or draws text (`drawText`, standard Helvetica),
  using the baking math above, outputs `<name>-signed.pdf`.
- Elements list + "Add signature/initials/text/date" live in a right-hand
  panel next to the page canvas (reusing the app's panel visual language,
  not the generic `OptionsPanel`).

### Desktop (`apps/desktop`)

Rust is a generic JSON passthrough to the Python sidecar (`commands.rs` has
no per-op logic), so this needs no Rust changes — only a new sidecar op, its
protocol entry, and the React side.

- `sidecar/ops/pdf_sign.py`, dispatched as `pdf.sign`. Params: `input`,
  `output`, `elements: [{page, kind, x_pct, y_pct, w_pct, h_pct, image_b64?,
  text?, font_size?, color?}]`. For each page that has elements, builds an
  overlay PDF page with `reportlab.pdfgen.canvas.Canvas` sized to that page's
  `pikepdf` mediabox, draws each element with the baking math above, then
  merges with `pikepdf.Page.add_overlay()` (draws on top, keeps original
  content). New dependency: `reportlab` (added to `requirements.txt`).
- `sidecar/PROTOCOL.md`: document `pdf.sign` alongside the existing ops.
- `apps/desktop/src/lib/jobs.ts`: add `"pdf.sign"` to `OpName`, its params/
  result types, and the `OpMap` entry (frozen-contract file, per its own
  header comment — updated together with `PROTOCOL.md`).
- `apps/desktop/src/lib/tools.ts`: new `Tool` entry `sign`.
- `apps/desktop/src/lib/run.ts`: new `execute()` case building `PdfSignParams`
  from the workspace's element state.
- `apps/desktop/src/components/SignCanvas.tsx`: same interaction as the
  website's canvas/layer, built on `PdfPreviewDocument` (already renders
  pages to data URLs) instead of driving `pdfjs-dist` directly — reuses the
  existing thin wrapper rather than duplicating it.
- `apps/desktop/src/routes/ToolWorkspace.tsx`: today it special-cases
  `OrganizeCanvas` for the `organize` tool's main-canvas area; `sign` gets
  the same kind of special-case for `SignCanvas`, since it also doesn't fit
  the generic options-panel layout.
- Signature/initials memory: desktop has no `localStorage`-backed browser
  storage story yet other than `settings.ts` (a small JSON blob); saved
  signatures are added to that same local settings file.

### Testing

- Website: `engines/sign.test.ts` (baking math, embedding), a
  `SignWorkspace` interaction test if the existing test setup supports it,
  and a manual pass in the browser preview (draw a signature, place text/
  date, export, confirm the output PDF opens and shows everything in the
  right place).
- Desktop: `sidecar/tests/test_pdf_sign.py` covering coordinate math and
  overlay correctness (pytest, run headless — no Tauri window needed for
  this). The React canvas/drag interactions are exercised via `npm run dev`
  in a plain browser tab (the app's own browser-mode fallback), since a full
  Tauri window can't be driven from here.
