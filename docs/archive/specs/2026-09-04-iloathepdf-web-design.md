# iLoathePDF Web — design spec

Date: 2026-09-04
Status: approved for implementation planning

## What this is

A real, working website companion to the iLoathePDF desktop app — not a marketing
mockup. Five of the seven tools run fully client-side (no server, no upload,
ever) using the same browser tab. The remaining two (Compress, and the HEIC
direction of Convert Images) ship with a real file-handling flow but an
honestly labeled "Preview" engine until a follow-up phase gives them full
parity with the desktop app.

Source design: Claude Design project `iLoathePDF Web.dc.html`
(project `55c3e3c8-f35c-46f8-b6da-e895b8c0ce03`), imported via the Claude
Design MCP. That design fully specs the Home, Tools index, Compress, How it
works, Privacy and Download screens; the other six tools appear only as
cards there.

## Why it exists

The desktop app's whole reason for existing is "the same convenience as
iLovePDF/SmallPDF, without the upload." A website extends that pitch to
people who won't install a Windows app: the same non-upload guarantee, proven
by running entirely in the tab, with the desktop app offered as the
no-browser-limits upgrade path.

## Repo layout

Same repo as the desktop app (`iLoathePDF`), restructured as an npm workspace:

```
IHatePDF/
├── apps/
│   ├── desktop/     ← current repo root content, moved here unchanged
│   │   ├── src/, src-tauri/, sidecar/, ...
│   └── web/         ← new
│       ├── src/
│       ├── public/
│       └── vite.config.ts
├── package.json     ← workspace root
└── README.md        ← gains a "two ways to run this" pointer
```

Rationale: one issue tracker, one license, one open-source surface — but
anyone who wants only the web app can `cd apps/web` and ignore the Rust/Python
toolchain entirely, and vice versa. This is a structural change to the
existing repo; `apps/desktop`'s internal paths, scripts, and CI need updating
to match, but its behavior does not change.

## Stack

Vite + React 19 + TypeScript + Tailwind v4 — the same stack as the desktop
app, so tokens, patterns and muscle memory carry over. Additional
dependencies specific to `apps/web`:

- `react-router-dom` (already used in the desktop app) for real URL routing
- `motion` (already a dependency) for animation
- `pdf-lib` — PDF creation/manipulation (merge, split, organize, images→PDF)
- `pdfjs-dist` (already a dependency) — PDF rendering (PDF→images, page
  thumbnails for Organize)

No new WASM toolchain is introduced in this phase. `pdf-lib` and `pdf.js` are
pure JS/existing WASM-bundled libraries; nothing here requires compiling a
new engine.

## Routing

Real URL routes, replacing the design's internal `page` state so pages are
bookmarkable and shareable:

| Route | Screen |
| --- | --- |
| `/` | Home |
| `/tools` | Tools index |
| `/tools/:slug` | One tool's workspace (7 slugs: merge, split, organize, compress, pdf-to-images, images-to-pdf, convert-images) |
| `/how-it-works` | Docs |
| `/privacy` | Privacy |
| `/download` | Download (desktop app) |

Nav highlighting, the sticky header, and the footer are shared layout, not
per-page.

## Design fidelity

Port the token set from the `.dc.html` verbatim: oklch color scales for light
and dark, `--bg/--surface/--surface-2/--surface-3/--border/--border-hi/--text/
--muted/--faint/--accent/--accent-hi/--accent-soft/--on-accent/--ok/--danger/
--paper/--shadow` etc., General Sans + Space Mono typefaces. Fonts are
self-hosted (not loaded from Fontshare/Google Fonts CDNs as the design draft
does) — consistent with the site's own "no third-party requests" claim in the
Privacy and Home copy. Theme toggle persists to `localStorage`
(`iloathepdf-web-theme`), defaulting to `prefers-color-scheme`.

Motion follows Emil Kowalski's restraint principles: spring-based (not
duration/easing keyframes) where it represents physical motion, always
interruptible, reserved for state changes that benefit from it (page
transitions, tool step transitions, result reveal) — not decorative flourish
on static content.

## Tool-page architecture

One shared `ToolPage` shell renders the drop zone → options rail → run →
result flow (matching the Compress screen's exact layout and step states:
`empty → ready → done`), parameterized per tool:

```ts
interface ToolConfig {
  slug: string;
  name: string;
  description: string;
  icon: IconComponent;
  accept: string[];           // file types accepted
  multiple: boolean;
  OptionsPanel: React.ComponentType<OptionsPanelProps>;
  engine: (input: EngineInput) => Promise<EngineResult>;
  status: 'live' | 'preview';
}
```

Registering a new tool is: write an `OptionsPanel`, write an `engine`
function, add one entry to the tool registry. This is the scalability the
7-tool site needs today and whatever tools get added later.

`EngineResult` carries the output blob(s), a human-readable summary (e.g.
"−75% smaller", "14 pages → 3 files"), and enough structure for the result
card to render without tool-specific UI code.

## Engines — Phase 1 scope

**Live (real output, no server):**

| Tool | Approach |
| --- | --- |
| Merge PDF | `pdf-lib`: load each PDF, copy pages in chosen order/ranges into one document |
| Split PDF | `pdf-lib`: extract page ranges / every-N-pages / selection into separate documents |
| Organize pages | `pdfjs-dist` for thumbnails, `pdf-lib` to reorder/rotate/delete and re-save |
| PDF to images | `pdfjs-dist`: render each page to canvas at chosen DPI, export PNG/JPG |
| Images to PDF | `pdf-lib`: embed each image (PNG/JPG) as a page at chosen size/margins |

**Preview (real file flow, output explicitly labeled provisional):**

| Tool | Why preview | What "Preview" means to the user |
| --- | --- | --- |
| Compress | Matching Ghostscript-grade compression quality client-side needs real tuning work, not just wiring | Result card shows a "Preview engine" badge and the estimate copy from the design ("close, not final") instead of presenting the number as the final answer |
| Convert images (HEIC direction only) | Needs a HEIC decoder, evaluated separately | PNG/JPG/WebP directions are live; HEIC→anything shows the same preview badge until a decoder is chosen |

A tool's `status: 'preview'` flag drives a visible badge in both the tool
card (Tools index) and the result state — never silent. This is not a
placeholder mockup: real files go in, real processing happens, the badge is
about output quality/completeness, not about whether the tool works at all.

## Authenticity feature: real request counter

The design's "0 requests / 0 bytes sent" panel (Home hero and Privacy page)
becomes real instead of a static prop: wrap `window.fetch` and
`XMLHttpRequest` at app startup to count actual outgoing requests, and
surface that count live. This makes the site's core claim independently
verifiable by anyone who opens DevTools, which is exactly what the Privacy
page copy invites them to do.

## Data flow

```
File (via <input> or drop) → File API → ArrayBuffer in tab memory
   → tool engine (pdf-lib / pdf.js, synchronous or Promise-based)
   → Blob result → object URL → download link / auto-save-as
```

No IndexedDB persistence, no service worker in this phase (explicitly
deferred — see Out of scope). Everything lives in memory for the tab's
lifetime and is released on navigation away from the tool page.

## Error handling

- Unsupported file type / corrupted PDF: inline error state in the drop
  zone, matching the desktop app's existing error-card visual language
  (`design/screenshots/09-components`) adapted to the web tokens.
- File too large for comfortable in-tab memory (soft warning above ~150MB,
  hard stop is left to the browser): a dismissible warning banner, pointing
  at the desktop app as the no-limits option — this mirrors the design's own
  "Large files... use the desktop app" card.
- Engine exceptions (malformed PDF that `pdf-lib` rejects, etc.): caught at
  the `ToolPage` level, rendered as a result-card error state with the raw
  message available on expand for debugging, never a blank page.

## Testing

- Unit tests (Vitest) for each engine function against fixture files
  (small real PDFs/images checked into `apps/web/src/engines/__fixtures__`)
  — merge produces N pages in the right order, split produces the right
  page counts, organize round-trips a reorder+rotate+delete correctly, etc.
- Component tests for `ToolPage` state transitions (empty → ready → done →
  error) independent of which engine is plugged in.
- No e2e/browser automation in Phase 1 scope; manual verification against
  the dev server before merge, per the desktop app's existing practice of
  browser-testing UI changes.

## Deployment

GitHub Actions workflow, triggered on push to `main` touching `apps/web/**`,
running `npm run build --workspace=apps/web` and deploying `apps/web/dist` to
GitHub Pages. Desktop app's existing CI (installer build, sidecar smoke test)
is untouched and scoped to `apps/desktop/**`.

## Out of scope (this spec)

- WASM-grade Compress engine matching Ghostscript quality
- Real HEIC decode
- Service-worker offline caching (mentioned in the design's "How it works"
  copy as aspirational; not built here — copy will be adjusted to not
  overclaim, or the feature becomes a fast-follow)
- Any additional tools beyond the existing seven
- Mobile-specific layout work beyond what falls out of responsive Tailwind
  usage naturally

Each of these is a candidate for its own follow-up spec once this phase
ships.
