# iLoathePDF Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo into an `apps/desktop` + `apps/web` workspace and ship a real, working companion website: 5 of 7 tools (Merge, Split, Organize, PDF→images, Images→PDF) do real client-side PDF processing via `pdf-lib`/`pdf.js`; Compress and HEIC conversion ship with a real file flow but an honest "Preview" badge; deployed to GitHub Pages.

**Architecture:** A shared `ToolPage` shell (drop zone → options → run → result) driven by a per-tool `ToolConfig` (icon, options panel, `engine` function). Engines are pure functions operating on `ArrayBuffer`/`File` in, `Blob` out — independently unit-testable with Vitest, no DOM required except where `pdf.js` needs a canvas (jsdom provides one). Routing is real URLs via `react-router-dom`. Design tokens are ported verbatim from `apps/desktop/src/index.css`.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind v4, `react-router-dom`, `motion` (Framer Motion), `pdf-lib`, `pdfjs-dist`, Vitest.

## Global Constraints

- No network requests from tool engines — everything is File API → memory → Blob. (Spec: "Why it exists", "Data flow")
- Compress and the HEIC direction of Convert Images MUST show a visible "Preview" badge on both their tool card and their result state — never presented as final output. (Spec: "Engines — Phase 1 scope")
- Fonts (General Sans, Space Mono) are self-hosted under `apps/web/public/fonts`, not loaded from Fontshare/Google CDNs. (Spec: "Design fidelity")
- Theme preference persists to `localStorage` key `iloathepdf-web-theme`, defaults to `prefers-color-scheme`. (Spec: "Design fidelity")
- The request counter must reflect real `fetch`/`XMLHttpRequest` calls, not a static value. (Spec: "Authenticity feature")
- `apps/desktop`'s existing behavior, scripts, and passing CI must be unchanged after the restructure — only paths move. (Spec: "Repo layout")
- Routes: `/`, `/tools`, `/tools/:slug` (slugs: `merge`, `split`, `organize`, `compress`, `pdf-to-images`, `images-to-pdf`, `convert-images`), `/how-it-works`, `/privacy`, `/download`. (Spec: "Routing")

---

## File Structure

```
IHatePDF/
├── package.json                        # workspace root (new)
├── README.md                           # rewritten as monorepo pointer
├── apps/
│   ├── desktop/                        # current repo root, moved as-is
│   │   ├── package.json                # (was root package.json)
│   │   ├── README.md                   # (was root README.md, desktop-specific)
│   │   ├── HANDOVER.md, SPECS.md
│   │   ├── src/, src-tauri/, sidecar/, public/, scripts/, vendor/, design/
│   │   ├── index.html, lab.html, vite.config.ts, tsconfig*.json, pytest.ini
│   │   └── .venv/ (gitignored)
│   └── web/
│       ├── package.json
│       ├── vite.config.ts
│       ├── vitest.config.ts
│       ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│       ├── index.html
│       ├── public/fonts/               # self-hosted General Sans + Space Mono
│       └── src/
│           ├── main.tsx
│           ├── App.tsx                 # router setup
│           ├── index.css               # ported design tokens
│           ├── lib/
│           │   ├── theme.ts            # theme persistence + system default
│           │   ├── requestCounter.ts   # fetch/XHR wrapping
│           │   └── ranges.ts           # page-range parsing shared by engines
│           ├── engines/
│           │   ├── types.ts            # EngineInput / EngineResult
│           │   ├── merge.ts / merge.test.ts
│           │   ├── split.ts / split.test.ts
│           │   ├── organize.ts / organize.test.ts
│           │   ├── pdfToImages.ts / pdfToImages.test.ts
│           │   ├── imagesToPdf.ts / imagesToPdf.test.ts
│           │   ├── compress.ts / compress.test.ts
│           │   ├── convertImages.ts / convertImages.test.ts
│           │   └── testHelpers.ts      # synthetic PDF/image fixture builders
│           ├── tools/
│           │   ├── registry.ts         # ToolConfig[] — the 7 tools
│           │   ├── ToolConfig.ts       # the type itself
│           │   └── options/            # one OptionsPanel component per tool
│           │       ├── MergeOptions.tsx, SplitOptions.tsx, ...
│           │       └── (7 files)
│           ├── components/
│           │   ├── layout/
│           │   │   ├── SiteHeader.tsx, SiteFooter.tsx, ThemeToggle.tsx
│           │   ├── FileDropZone.tsx
│           │   ├── ResultCard.tsx
│           │   ├── PreviewBadge.tsx
│           │   └── ToolPage.tsx        # the shared shell + step state machine
│           └── pages/
│               ├── Home.tsx, ToolsIndex.tsx, ToolDetail.tsx
│               ├── HowItWorks.tsx, Privacy.tsx, Download.tsx
├── .github/workflows/
│   ├── ci.yml                          # paths updated to apps/desktop/**
│   └── deploy-web.yml                  # new: build+deploy apps/web to Pages
└── docs/                               # unchanged location (superpowers specs/plans)
```

---

### Task 1: Restructure the repo into `apps/desktop`

**Files:**
- Move (git mv): `src/`, `src-tauri/`, `sidecar/`, `public/`, `scripts/`, `vendor/`, `design/`, `index.html`, `lab.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `pytest.ini`, `package.json`, `package-lock.json`, `README.md`, `HANDOVER.md`, `SPECS.md` → same names under `apps/desktop/`
- Create: `package.json` (new workspace root, repo root)
- Create: `README.md` (new monorepo pointer, repo root)
- Modify: `.github/workflows/ci.yml` (working directories → `apps/desktop`)
- Leave in place: `.githooks/`, `docs/`, `.git/`, `.gitignore`

**Interfaces:**
- Produces: `apps/desktop` builds and typechecks exactly as the old root did. `npm install` at repo root installs both workspaces. This is a prerequisite for every later task — nothing in `apps/web` exists until this lands.

- [ ] **Step 1: Move desktop files with git mv, preserving history**

```bash
mkdir apps
git mv src apps/desktop/src
git mv src-tauri apps/desktop/src-tauri
git mv sidecar apps/desktop/sidecar
git mv public apps/desktop/public
git mv scripts apps/desktop/scripts
git mv vendor apps/desktop/vendor 2>/dev/null || mkdir -p apps/desktop/vendor
git mv design apps/desktop/design
git mv index.html apps/desktop/index.html
git mv lab.html apps/desktop/lab.html
git mv vite.config.ts apps/desktop/vite.config.ts
git mv tsconfig.json apps/desktop/tsconfig.json
git mv tsconfig.app.json apps/desktop/tsconfig.app.json
git mv tsconfig.node.json apps/desktop/tsconfig.node.json
git mv pytest.ini apps/desktop/pytest.ini
git mv package.json apps/desktop/package.json
git mv package-lock.json apps/desktop/package-lock.json
git mv README.md apps/desktop/README.md
git mv HANDOVER.md apps/desktop/HANDOVER.md
git mv SPECS.md apps/desktop/SPECS.md
```

`vendor/` is gitignored (holds AGPL Ghostscript), so `git mv` on it will fail if
it's empty/untracked on this machine — the `mkdir -p` fallback handles that;
if it does contain tracked files, the plain `git mv` succeeds instead and the
fallback is skipped by `||`.

- [ ] **Step 2: Fix the `@` alias base in `apps/desktop/vite.config.ts`**

The alias uses `__dirname`, which now resolves inside `apps/desktop` correctly
without changes — verify by reading the file, no edit needed:

```bash
cat apps/desktop/vite.config.ts
```

Expected: `path.resolve(__dirname, "./src")` — still correct since `__dirname`
moves with the file.

- [ ] **Step 3: Update `apps/desktop/src-tauri/tauri.conf.json` resource-relative paths if any are `../` outside the app**

```bash
grep -n '"\.\./' apps/desktop/src-tauri/tauri.conf.json
```

If this prints nothing, no change needed (the move keeps `src-tauri` and its
siblings at the same relative depth). If it prints a path that pointed above
the old repo root, adjust that one line to stay inside `apps/desktop`.

- [ ] **Step 4: Write the new workspace-root `package.json`**

```json
{
  "name": "iloathepdf-monorepo",
  "private": true,
  "workspaces": [
    "apps/desktop",
    "apps/web"
  ],
  "scripts": {
    "dev:desktop": "npm run tauri dev --workspace=apps/desktop",
    "dev:web": "npm run dev --workspace=apps/web",
    "build:web": "npm run build --workspace=apps/web",
    "test:web": "npm run test --workspace=apps/web"
  }
}
```

- [ ] **Step 5: Rewrite the repo-root `README.md` as a monorepo pointer**

```markdown
# iLoathePDF

Private, local-first PDF and image tools. Two ways to run them:

- **[Desktop app](apps/desktop/README.md)** — the full Windows app (Tauri +
  Rust + Python), no browser limits.
- **Web** *(coming up in this plan)* — the same tools running entirely in
  your browser tab, no install.

Both share one rule: your files never leave the machine they're opened on.

## Getting set up

```bash
npm install   # installs both apps/desktop and apps/web
```

Then see each app's own README for how to run it.
```

- [ ] **Step 6: Update `.github/workflows/ci.yml` to scope the existing jobs to `apps/desktop`**

Replace the `frontend`, `engine`, and `rust` jobs' checkout-relative commands
and add path filters so they only run on desktop changes:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  frontend:
    name: Frontend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/desktop
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: apps/desktop/package-lock.json
      - run: npm ci
      - name: Lint
        run: npm run lint
      - name: Typecheck
        run: npm run typecheck
      - name: Build
        run: npm run build

  engine:
    name: Document engine
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/desktop
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-python@v7
        with:
          python-version: "3.11"
          cache: pip
      - name: Install Ghostscript
        run: sudo apt-get update && sudo apt-get install -y ghostscript
      - run: pip install -r sidecar/requirements.txt
      - name: Test
        run: python -m pytest

  rust:
    name: Rust
    runs-on: windows-latest
    defaults:
      run:
        working-directory: apps/desktop
    steps:
      - uses: actions/checkout@v7
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: apps/desktop/src-tauri
      - name: Placeholder resource paths
        run: |
          New-Item -ItemType Directory -Force vendor
          New-Item -ItemType Directory -Force build/sidecar/iloathepdf-sidecar
        shell: pwsh

      - name: Format
        run: cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
      - name: Clippy
        run: cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

- [ ] **Step 7: Reinstall and verify the desktop app still builds**

```bash
npm install
npm run typecheck --workspace=apps/desktop
npm run build --workspace=apps/desktop
```

Expected: both commands succeed with no path-resolution errors. This is the
gate for the whole restructure — do not proceed to Task 2 until this passes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Restructure repo into apps/desktop + npm workspace root

Moves the existing app under apps/desktop unchanged, adds a workspace
root package.json, and repoints CI at the new paths, to make room for
apps/web alongside it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Scaffold `apps/web` and port design tokens

**Files:**
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`
- Create: `apps/web/tsconfig.json`, `apps/web/tsconfig.app.json`, `apps/web/tsconfig.node.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/index.css`
- Create: `apps/web/public/fonts/` (font files — see step 4)

**Interfaces:**
- Produces: a running `npm run dev --workspace=apps/web` dev server serving a blank themed page at `/`. Later tasks build on `App.tsx`'s router and `index.css`'s tokens.

- [ ] **Step 1: Write `apps/web/package.json`**

```json
{
  "name": "iloathepdf-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.app.json"
  },
  "dependencies": {
    "pdf-lib": "^1.17.1",
    "pdfjs-dist": "^6.3.289",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router-dom": "^7.18.3",
    "motion": "^13.2.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "@vitejs/plugin-react": "^6.1.0",
    "jsdom": "^26.0.0",
    "tailwindcss": "^4.3.3",
    "typescript": "~7.0.2",
    "vite": "^8.2.2",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 2: Write `apps/web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  base: "/iloathepdf-web/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

`base` matches the GitHub Pages project-page path set up in Task 18; adjust
there and here together if the repo/Pages URL differs.

- [ ] **Step 3: Write `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 4: Copy the three tsconfig files, adjusted for `apps/web`**

`apps/web/tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`apps/web/tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

`apps/web/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 5: Write `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>iLoathePDF — PDF tools that never upload your files</title>
    <meta name="description" content="Merge, split, compress, organize and convert PDFs and images, entirely in your browser tab. No upload, no server, no account." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Source the font files from the desktop app and write `apps/web/src/index.css`**

```bash
mkdir -p apps/web/public/fonts
cp apps/desktop/public/fonts/*.woff2 apps/web/public/fonts/
```

`apps/web/src/index.css` — same token set as `apps/desktop/src/index.css`
(General Sans + Space Mono `@font-face`, the full oklch `:root` /
`:root[data-theme="dark"]` blocks, and the `@theme inline` Tailwind mapping),
minus the desktop-only rules that don't belong on a scrolling web page
(`overflow: hidden`, `user-select: none`, the custom scrollbar and slider
utilities are kept since the slider is reused by Compress's DPI control):

```css
@import "tailwindcss";

@font-face {
  font-family: "General Sans";
  src: url("/fonts/general-sans-400.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "General Sans";
  src: url("/fonts/general-sans-500.woff2") format("woff2");
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "General Sans";
  src: url("/fonts/general-sans-600.woff2") format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "General Sans";
  src: url("/fonts/general-sans-700.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Space Mono";
  src: url("/fonts/space-mono-400.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Space Mono";
  src: url("/fonts/space-mono-700.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

@theme {
  --font-sans: "General Sans", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  --font-mono: "Space Mono", ui-monospace, Consolas, monospace;
  --radius-card: 12px;
}

:root {
  --bg: oklch(0.965 0.005 76);
  --surface: #ffffff;
  --surface-2: oklch(0.972 0.006 76);
  --surface-3: oklch(0.938 0.008 76);
  --border: oklch(0.905 0.008 76);
  --border-hi: oklch(0.825 0.010 76);
  --text: oklch(0.215 0.014 68);
  --muted: oklch(0.505 0.012 72);
  --faint: oklch(0.645 0.010 72);
  --accent: oklch(0.775 0.155 78);
  --accent-hi: oklch(0.715 0.160 72);
  --accent-soft: oklch(0.958 0.048 82);
  --on-accent: oklch(0.235 0.045 68);
  --ok: oklch(0.545 0.115 162);
  --ok-soft: oklch(0.958 0.032 162);
  --danger: oklch(0.545 0.175 26);
  --danger-soft: oklch(0.958 0.030 26);
  --paper: #ffffff;
  --paper-line: oklch(0.902 0.006 76);
  --shadow-card: 0 1px 2px oklch(0.25 0.02 70 / 0.07), 0 6px 16px -4px oklch(0.25 0.02 70 / 0.1);
  --tint-a: oklch(0.575 0.145 265);
  --tint-b: oklch(0.575 0.145 310);
  --tint-c: oklch(0.575 0.145 200);
  --tint-d: oklch(0.575 0.145 162);
  --tint-e: oklch(0.575 0.145 78);
  --tint-f: oklch(0.575 0.145 28);
  --tint-g: oklch(0.575 0.145 340);
  --ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);
}

:root[data-theme="dark"] {
  --bg: oklch(0.158 0.007 68);
  --surface: oklch(0.203 0.008 68);
  --surface-2: oklch(0.245 0.009 70);
  --surface-3: oklch(0.292 0.010 70);
  --border: oklch(0.272 0.009 70);
  --border-hi: oklch(0.395 0.012 72);
  --text: oklch(0.962 0.005 80);
  --muted: oklch(0.715 0.010 76);
  --faint: oklch(0.552 0.010 74);
  --accent: oklch(0.8 0.152 80);
  --accent-hi: oklch(0.87 0.14 84);
  --accent-soft: oklch(0.295 0.055 78);
  --on-accent: oklch(0.185 0.035 68);
  --ok: oklch(0.805 0.125 162);
  --ok-soft: oklch(0.278 0.045 162);
  --danger: oklch(0.7 0.155 26);
  --danger-soft: oklch(0.295 0.06 26);
  --paper: oklch(0.958 0.004 80);
  --paper-line: oklch(0.858 0.006 78);
  --shadow-card: 0 0 0 1px oklch(0 0 0 / 0.22), 0 1px 2px oklch(0 0 0 / 0.42), 0 10px 24px -8px oklch(0 0 0 / 0.55);
  --tint-a: oklch(0.8 0.125 265);
  --tint-b: oklch(0.8 0.125 310);
  --tint-c: oklch(0.8 0.125 200);
  --tint-d: oklch(0.8 0.125 162);
  --tint-e: oklch(0.8 0.125 78);
  --tint-f: oklch(0.8 0.125 28);
  --tint-g: oklch(0.8 0.125 340);
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-border: var(--border);
  --color-border-hi: var(--border-hi);
  --color-text: var(--text);
  --color-muted: var(--muted);
  --color-faint: var(--faint);
  --color-accent: var(--accent);
  --color-accent-hi: var(--accent-hi);
  --color-accent-soft: var(--accent-soft);
  --color-on-accent: var(--on-accent);
  --color-ok: var(--ok);
  --color-ok-soft: var(--ok-soft);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-paper: var(--paper);
  --color-paper-line: var(--paper-line);
}

html, body, #root { min-height: 100%; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-wrap: pretty;
}

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb {
  background: var(--border-hi);
  border-radius: 8px;
  border: 3px solid transparent;
  background-clip: padding-box;
}
::-webkit-scrollbar-track { background: transparent; }

input[type="range"].ihp-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 20px;
  background: transparent;
  cursor: pointer;
}
input[type="range"].ihp-slider::-webkit-slider-runnable-track {
  height: 5px;
  border-radius: 99px;
  background: linear-gradient(to right, var(--accent) 0 var(--ihp-fill, 50%), var(--surface-3) var(--ihp-fill, 50%) 100%);
  box-shadow: inset 0 0 0 1px var(--border);
}
input[type="range"].ihp-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  height: 16px;
  width: 16px;
  margin-top: -5.5px;
  border-radius: 99px;
  background: var(--surface);
  border: 1px solid var(--border-hi);
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.18);
  transition: transform 140ms var(--ease-out-strong);
}
input[type="range"].ihp-slider:active::-webkit-slider-thumb { transform: scale(1.12); }
input[type="range"].ihp-slider:focus-visible::-webkit-slider-thumb {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 7: Write `apps/web/src/main.tsx` and a placeholder `App.tsx`**

`apps/web/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/iloathepdf-web">
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

`apps/web/src/App.tsx` (placeholder; Task 3 replaces the body with real
routes):
```tsx
export default function App() {
  return <div className="p-8 text-text">iLoathePDF Web — scaffold OK</div>;
}
```

- [ ] **Step 8: Install and verify the dev server boots**

```bash
npm install
npm run dev --workspace=apps/web
```

Expected: Vite prints a local URL; visiting it shows "iLoathePDF Web —
scaffold OK" styled with the body font/background from `index.css`. Stop the
server (Ctrl+C) once confirmed.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "$(cat <<'EOF'
Scaffold apps/web with ported design tokens

Vite + React 19 + TS + Tailwind v4, mirroring the desktop app's stack.
Fonts self-hosted, oklch token set copied from apps/desktop/src/index.css.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Theme persistence and the real request counter

**Files:**
- Create: `apps/web/src/lib/theme.ts`, `apps/web/src/lib/theme.test.ts`
- Create: `apps/web/src/lib/requestCounter.ts`, `apps/web/src/lib/requestCounter.test.ts`

**Interfaces:**
- Produces: `getInitialTheme(): 'light' | 'dark'`, `applyTheme(theme)`, `persistTheme(theme)` — consumed by `ThemeToggle` (Task 5) and `App.tsx`. `installRequestCounter(onChange: (count: number) => void): () => void` — consumed by `SiteHeader`/Home/Privacy (Tasks 5, 6, 9).

- [ ] **Step 1: Write the failing test for theme persistence**

```ts
// apps/web/src/lib/theme.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getInitialTheme, persistTheme, THEME_KEY } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads a persisted theme over the system preference", () => {
    localStorage.setItem(THEME_KEY, "light");
    expect(getInitialTheme()).toBe("light");
  });

  it("falls back to the system preference when nothing is persisted", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("dark"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    expect(getInitialTheme()).toBe("dark");
    vi.unstubAllGlobals();
  });

  it("persists a theme choice", () => {
    persistTheme("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run test --workspace=apps/web -- theme.test.ts
```

Expected: FAIL — `./theme` has no exports yet.

- [ ] **Step 3: Implement `apps/web/src/lib/theme.ts`**

```ts
export type Theme = "light" | "dark";
export const THEME_KEY = "iloathepdf-web-theme";

export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function persistTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npm run test --workspace=apps/web -- theme.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Write the failing test for the request counter**

```ts
// apps/web/src/lib/requestCounter.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { installRequestCounter } from "./requestCounter";

describe("installRequestCounter", () => {
  const originalFetch = window.fetch;
  afterEach(() => {
    window.fetch = originalFetch;
  });

  it("increments on every fetch call and reports via the callback", async () => {
    window.fetch = vi.fn(async () => new Response("ok"));
    const counts: number[] = [];
    const uninstall = installRequestCounter((n) => counts.push(n));

    await window.fetch("https://example.com");
    await window.fetch("https://example.com");

    expect(counts).toEqual([1, 2]);
    uninstall();
  });

  it("stops counting after uninstall", async () => {
    window.fetch = vi.fn(async () => new Response("ok"));
    const counts: number[] = [];
    const uninstall = installRequestCounter((n) => counts.push(n));
    uninstall();

    await window.fetch("https://example.com");

    expect(counts).toEqual([]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npm run test --workspace=apps/web -- requestCounter.test.ts
```

Expected: FAIL — `./requestCounter` has no exports yet.

- [ ] **Step 7: Implement `apps/web/src/lib/requestCounter.ts`**

```ts
export function installRequestCounter(onChange: (count: number) => void): () => void {
  let count = 0;
  const originalFetch = window.fetch;
  const wrappedFetch: typeof window.fetch = (...args) => {
    count += 1;
    onChange(count);
    return originalFetch(...args);
  };
  window.fetch = wrappedFetch;

  const OriginalXHR = window.XMLHttpRequest;
  class CountingXHR extends OriginalXHR {
    open(...args: Parameters<XMLHttpRequest["open"]>) {
      count += 1;
      onChange(count);
      // @ts-expect-error -- forwarding the exact arguments XHR.open received
      return super.open(...args);
    }
  }
  window.XMLHttpRequest = CountingXHR;

  return () => {
    window.fetch = originalFetch;
    window.XMLHttpRequest = OriginalXHR;
  };
}
```

- [ ] **Step 8: Run it to verify it passes**

```bash
npm run test --workspace=apps/web -- requestCounter.test.ts
```

Expected: 2 passed.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib
git commit -m "$(cat <<'EOF'
Add theme persistence and a real fetch/XHR request counter

The counter wraps window.fetch and XMLHttpRequest.open so the site's
'0 requests sent' claim is something a viewer can actually verify,
not a static prop.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Page-range parsing utility (shared by Merge, Split, Organize)

**Files:**
- Create: `apps/web/src/lib/ranges.ts`, `apps/web/src/lib/ranges.test.ts`

**Interfaces:**
- Produces: `parseRanges(spec: string, pageCount: number): number[]` — zero-based page indices, deduplicated, in the order the spec lists them, throwing `RangeError` on an out-of-bounds or malformed spec. Consumed by Tasks 11 (Merge), 12 (Split), 13 (Organize).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/ranges.test.ts
import { describe, it, expect } from "vitest";
import { parseRanges } from "./ranges";

describe("parseRanges", () => {
  it("parses a single range", () => {
    expect(parseRanges("1-3", 5)).toEqual([0, 1, 2]);
  });

  it("parses comma-separated ranges and singles, in spec order", () => {
    expect(parseRanges("1-2,5,3", 5)).toEqual([0, 1, 4, 2]);
  });

  it("dedupes overlapping ranges, keeping the first occurrence", () => {
    expect(parseRanges("1-3,2-4", 5)).toEqual([0, 1, 2, 3]);
  });

  it("treats an empty spec as every page", () => {
    expect(parseRanges("", 3)).toEqual([0, 1, 2]);
  });

  it("rejects a page number below 1", () => {
    expect(() => parseRanges("0-2", 5)).toThrow(RangeError);
  });

  it("rejects a page number above pageCount", () => {
    expect(() => parseRanges("1-6", 5)).toThrow(RangeError);
  });

  it("rejects a malformed spec", () => {
    expect(() => parseRanges("abc", 5)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace=apps/web -- ranges.test.ts
```

Expected: FAIL — `./ranges` has no exports yet.

- [ ] **Step 3: Implement `apps/web/src/lib/ranges.ts`**

```ts
/**
 * Parses a 1-based, human page-range spec ("1-3,5,7-9") into deduplicated
 * zero-based page indices, in the order the spec lists them. An empty spec
 * means every page.
 */
export function parseRanges(spec: string, pageCount: number): number[] {
  const trimmed = spec.trim();
  if (trimmed === "") {
    return Array.from({ length: pageCount }, (_, i) => i);
  }

  const seen = new Set<number>();
  const result: number[] = [];

  for (const part of trimmed.split(",")) {
    const piece = part.trim();
    const rangeMatch = /^(\d+)-(\d+)$/.exec(piece);
    const singleMatch = /^(\d+)$/.exec(piece);

    let start: number;
    let end: number;
    if (rangeMatch) {
      start = Number(rangeMatch[1]);
      end = Number(rangeMatch[2]);
    } else if (singleMatch) {
      start = end = Number(singleMatch[1]);
    } else {
      throw new RangeError(`Invalid page range segment: "${piece}"`);
    }

    if (start < 1 || end < 1 || start > pageCount || end > pageCount) {
      throw new RangeError(
        `Page range "${piece}" is outside 1-${pageCount}`,
      );
    }

    const step = start <= end ? 1 : -1;
    for (let p = start; step > 0 ? p <= end : p >= end; p += step) {
      const index = p - 1;
      if (!seen.has(index)) {
        seen.add(index);
        result.push(index);
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test --workspace=apps/web -- ranges.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ranges.ts apps/web/src/lib/ranges.test.ts
git commit -m "$(cat <<'EOF'
Add shared page-range parser for Merge/Split/Organize engines

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Site layout — header, footer, theme toggle, router shell

**Files:**
- Create: `apps/web/src/components/layout/SiteHeader.tsx`
- Create: `apps/web/src/components/layout/SiteFooter.tsx`
- Create: `apps/web/src/components/layout/ThemeToggle.tsx`
- Create: `apps/web/src/components/layout/RequestStatusContext.tsx`
- Modify: `apps/web/src/App.tsx` (real router + layout, replaces the Task 2 placeholder)

**Interfaces:**
- Consumes: `getInitialTheme`, `applyTheme`, `persistTheme` from `lib/theme.ts` (Task 3); `installRequestCounter` from `lib/requestCounter.ts` (Task 3).
- Produces: `RequestStatusContext` exporting `useRequestCount(): number`, consumed by Home (Task 6) and Privacy (Task 9). `SiteHeader`/`SiteFooter` render the nav links from the Global Constraints route table; every page in Tasks 6-9 and 11-17 renders inside this layout via `<Outlet />`.

- [ ] **Step 1: Write `RequestStatusContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { installRequestCounter } from "@/lib/requestCounter";

const RequestCountContext = createContext(0);

export function RequestStatusProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const uninstall = installRequestCounter(setCount);
    return uninstall;
  }, []);

  return (
    <RequestCountContext.Provider value={count}>
      {children}
    </RequestCountContext.Provider>
  );
}

export function useRequestCount() {
  return useContext(RequestCountContext);
}
```

- [ ] **Step 2: Write `ThemeToggle.tsx`**

```tsx
import { useEffect, useState } from "react";
import { getInitialTheme, applyTheme, persistTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      title="Toggle theme"
      className="grid size-[30px] flex-none place-items-center rounded-lg border border-border text-muted hover:border-border-hi hover:text-text"
    >
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M9 2.2a6.8 6.8 0 0 0 0 13.6 6.8 6.8 0 0 1 0-13.6z" fill="currentColor" stroke="none" opacity="0.75" />
        <circle cx="9" cy="9" r="6.8" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 3: Write `SiteHeader.tsx`**

```tsx
import { NavLink, Link } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/tools", label: "Tools" },
  { to: "/tools/compress", label: "Compress" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/privacy", label: "Privacy" },
];

export function SiteHeader() {
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-bg">
      <div className="mx-auto flex h-[62px] max-w-6xl items-center gap-8 px-8">
        <Link to="/" className="flex flex-none items-center gap-2">
          <span className="grid size-[22px] place-items-center rounded-md bg-accent">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--on-accent)" strokeWidth="1.7">
              <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.4" />
              <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight">iLoathePDF</span>
        </Link>

        <nav className="flex items-center gap-0.5">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `rounded-lg px-2.5 py-1.5 text-[13.5px] hover:bg-surface-2 ${isActive ? "text-text" : "text-muted"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        <ThemeToggle />
        <Link
          to="/download"
          className="flex h-8 flex-none items-center gap-1.5 rounded-[9px] border border-border-hi bg-surface-2 px-3.5 text-[13px] font-semibold text-text hover:bg-surface-3"
        >
          Desktop app
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `SiteFooter.tsx`**

```tsx
import { Link } from "react-router-dom";
import { useRequestCount } from "./RequestStatusContext";

export function SiteFooter() {
  const reqCount = useRequestCount();

  return (
    <div className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-14 px-8 py-9">
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            <span className="size-[18px] rounded-[5px] bg-accent" />
            <span className="text-sm font-semibold tracking-tight">iLoathePDF</span>
          </div>
          <p className="mt-2.5 max-w-[34ch] text-[12.5px] leading-snug text-muted">
            Seven PDF and image tools that run on your machine. Browser or desktop, your choice.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-bold tracking-[0.13em] text-faint">TOOLS</span>
          <Link to="/tools" className="text-[12.5px] text-muted hover:text-text">All tools</Link>
          <Link to="/tools/compress" className="text-[12.5px] text-muted hover:text-text">Compress</Link>
          <Link to="/download" className="text-[12.5px] text-muted hover:text-text">Desktop app</Link>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-bold tracking-[0.13em] text-faint">ABOUT</span>
          <Link to="/how-it-works" className="text-[12.5px] text-muted hover:text-text">How it works</Link>
          <Link to="/privacy" className="text-[12.5px] text-muted hover:text-text">Privacy</Link>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-bold tracking-[0.13em] text-faint">STATUS</span>
          <span className="font-mono text-[11.5px] text-ok">local · wasm · offline ok</span>
          <span className="font-mono text-[11.5px] text-faint">{reqCount} requests this session</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire up `App.tsx` with the router shell**

```tsx
import { Routes, Route, Outlet } from "react-router-dom";
import { RequestStatusProvider } from "@/components/layout/RequestStatusContext";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Home } from "@/pages/Home";
import { ToolsIndex } from "@/pages/ToolsIndex";
import { ToolDetail } from "@/pages/ToolDetail";
import { HowItWorks } from "@/pages/HowItWorks";
import { Privacy } from "@/pages/Privacy";
import { Download } from "@/pages/Download";

function Layout() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <SiteHeader />
      <Outlet />
      <SiteFooter />
    </div>
  );
}

export default function App() {
  return (
    <RequestStatusProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="tools" element={<ToolsIndex />} />
          <Route path="tools/:slug" element={<ToolDetail />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="download" element={<Download />} />
        </Route>
      </Routes>
    </RequestStatusProvider>
  );
}
```

This references `Home`, `ToolsIndex`, `ToolDetail`, `HowItWorks`, `Privacy`,
`Download` from `src/pages/`, which don't exist yet — Tasks 6-9 create them.
Add minimal one-line placeholder exports now so the app compiles between
tasks:

```bash
mkdir -p apps/web/src/pages
for name in Home ToolsIndex ToolDetail HowItWorks Privacy Download; do
  cat > "apps/web/src/pages/$name.tsx" <<EOF
export function $name() {
  return <div className="mx-auto max-w-6xl px-8 py-14">$name — TODO</div>;
}
EOF
done
```

- [ ] **Step 6: Verify it compiles and renders**

```bash
npm run typecheck --workspace=apps/web
npm run dev --workspace=apps/web
```

Visit `/`, `/tools`, `/tools/compress`, `/how-it-works`, `/privacy`,
`/download` — each should show the header, footer, and that page's "TODO"
placeholder, with the active nav link highlighted. Stop the server once
confirmed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
Add site layout: header, footer, theme toggle, router shell

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Home page

**Files:**
- Modify: `apps/web/src/pages/Home.tsx` (replaces the Task 5 placeholder)

**Interfaces:**
- Consumes: `useRequestCount` from `RequestStatusContext` (Task 5), `Link` from `react-router-dom`.
- Produces: nothing consumed elsewhere — a leaf page.

- [ ] **Step 1: Implement `Home.tsx`**

Port the Home screen from the design 1:1 (hero copy, "app surface mock" card,
four-tool teaser grid linking into `/tools`, the three-step "why nothing
uploads" section, and the live network panel using `useRequestCount()`
instead of the design's static `{{ reqCount }}` prop):

```tsx
import { Link } from "react-router-dom";
import { useRequestCount } from "@/components/layout/RequestStatusContext";

export function Home() {
  const reqCount = useRequestCount();

  return (
    <div>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-8 pb-16 pt-12 md:grid-cols-2 md:gap-16">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <span className="size-1.5 rounded-sm bg-accent" />
            <span className="font-mono text-[10.5px] font-bold tracking-[0.15em] text-muted">
              SEVEN TOOLS · ZERO UPLOADS
            </span>
          </div>
          <h1 className="m-0 text-[clamp(38px,4.2vw,58px)] font-semibold leading-[1.02] tracking-[-0.035em] text-balance">
            Your files never leave this tab.
          </h1>
          <p className="mt-5 max-w-[44ch] text-[16.5px] leading-relaxed text-muted text-pretty">
            Merge, split, compress, organize and convert — running entirely
            on your own machine. There is no upload step, because there is
            nowhere to upload to.
          </p>
          <div className="mt-8 flex gap-2.5">
            <Link
              to="/tools/compress"
              className="inline-flex h-11 items-center gap-2 rounded-[11px] bg-accent px-5 text-[14.5px] font-semibold text-on-accent shadow-[var(--shadow-card)] hover:bg-accent-hi"
            >
              Open the tools
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <Link
              to="/download"
              className="inline-flex h-11 items-center rounded-[11px] border border-border-hi bg-surface px-4.5 text-[14.5px] font-medium text-text hover:bg-surface-2"
            >
              Get the desktop app
            </Link>
          </div>
          <div className="mt-6 flex w-fit items-center gap-3.5 rounded-[10px] border border-border bg-surface px-3.5 py-2.5">
            <span className="flex items-center gap-1.5 text-xs text-ok">
              <span className="size-1.5 rounded-full bg-ok" />
              Offline capable
            </span>
            <span className="h-3.5 w-px bg-border" />
            <span className="font-mono text-[11.5px] text-muted">
              {reqCount} network requests since load · 0 bytes sent
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
          <div className="flex h-[38px] items-center gap-2 border-b border-border bg-surface-2 px-3.5">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-border-hi" />
              <span className="size-2.5 rounded-full bg-border-hi" />
              <span className="size-2.5 rounded-full bg-border-hi" />
            </span>
            <span className="flex-1" />
            <span className="font-mono text-[10.5px] text-faint">iloathepdf.app/compress</span>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-6.5 place-items-center rounded-lg bg-surface-2">
                <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="var(--tint-d)" strokeWidth="1.5">
                  <rect x="2.5" y="2.5" width="13" height="13" rx="1.2" />
                  <path d="M5.5 5.5L8 8M8 8V5.6M8 8H5.6M12.5 12.5L10 10M10 10v2.4M10 10h2.4" />
                </svg>
              </span>
              <span className="text-[13.5px] font-semibold">Compress PDF</span>
              <span className="flex-1" />
              <span className="font-mono text-[10.5px] text-ok">DONE</span>
            </div>
            <div className="mt-4.5 rounded-xl border border-border bg-surface-2 p-5">
              <div className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">RESULT</div>
              <div className="mt-3 flex items-baseline gap-3 font-mono">
                <span className="text-[22px] text-faint line-through">3.14 MB</span>
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--faint)" strokeWidth="1.5">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
                <span className="text-[38px] font-bold tracking-[-0.03em]">812 KB</span>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-3">
                <span className="w-1/4 bg-ok" />
              </div>
              <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
                <span>−75% smaller</span>
                <span>quality: balanced</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-8 py-14">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="m-0 text-[26px] font-semibold tracking-[-0.025em]">Seven tools, one page each</h2>
            <Link to="/tools" className="text-[13.5px] text-accent">See all →</Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { to: "/tools/compress", title: "Compress PDF", desc: "Shrink for email, with the quality trade-off shown first." },
              { to: "/tools/merge", title: "Merge PDF", desc: "Combine in the order you choose, page ranges per file." },
              { to: "/tools/split", title: "Split PDF", desc: "Ranges, every N pages, extract or delete a selection." },
              { to: "/tools/organize", title: "Organize pages", desc: "Reorder, rotate and drop pages on a page canvas." },
            ].map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="rounded-[13px] border border-border bg-bg p-4.5 hover:border-border-hi hover:shadow-[var(--shadow-card)]"
              >
                <div className="mt-2.5 text-sm font-semibold">{t.title}</div>
                <div className="mt-1 text-[12.5px] leading-snug text-muted">{t.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-8 py-16">
        <h2 className="m-0 mb-1.5 text-[26px] font-semibold tracking-[-0.025em]">Why nothing uploads</h2>
        <p className="m-0 max-w-[56ch] text-[15px] text-muted">
          Merge, split and the other tools run against the same file
          structures the desktop app understands. Your browser runs them
          locally.
        </p>
        <div className="mt-7 grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {[
            { n: "01", title: "Nothing loads except the page", body: "The tool code arrives with the page like any other script and runs in this tab. That is the last request the site makes." },
            { n: "02", title: "Your file stays put", body: "Files are read through the File API into memory the tab owns. No fetch, no form post, no signed URL." },
            { n: "03", title: "Result is a local save", body: "Output is a blob your browser writes to disk. Close the tab and every trace is gone." },
          ].map((s) => (
            <div key={s.n} className="rounded-[13px] border border-border bg-surface p-5.5">
              <span className="font-mono text-[11px] font-bold text-accent">{s.n}</span>
              <div className="mt-2.5 text-[15px] font-semibold">{s.title}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-[1fr_300px]">
          <div className="flex items-center gap-3 rounded-[13px] border border-border bg-surface px-5 py-4.5">
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" className="flex-none">
              <circle cx="8" cy="8" r="6.3" />
              <path d="M8 5.2v.2M8 7.4v3.4" />
            </svg>
            <span className="text-[13.5px] leading-relaxed text-muted">
              Verify it yourself: open DevTools → Network, run any tool, and
              watch the request list stay exactly where it is.{" "}
              <Link to="/privacy" className="text-accent">More on privacy</Link>
            </span>
          </div>
          <div className="rounded-[13px] border border-border bg-surface px-5 py-4.5 font-mono">
            <div className="text-[10px] font-bold tracking-[0.13em] text-faint">NETWORK PANEL</div>
            <div className="mt-3 flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted">requests</span><span>{reqCount}</span></div>
              <div className="flex justify-between"><span className="text-muted">bytes sent</span><span>0</span></div>
              <div className="flex justify-between"><span className="text-muted">cookies</span><span>0</span></div>
              <div className="flex justify-between border-t border-border pt-1.5"><span className="text-muted">engine</span><span className="text-ok">local</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Note: the Home hero card's "812 KB" numbers are illustrative marketing copy
(a static example screenshot), same as the source design — this is distinct
from the actual Compress tool page (Task 16), which processes real files.

- [ ] **Step 2: Verify visually**

```bash
npm run dev --workspace=apps/web
```

Visit `/`. Confirm layout matches the design's Home screen at both a wide
and narrow viewport, and both themes via the header toggle.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Home.tsx
git commit -m "$(cat <<'EOF'
Implement Home page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Tool registry, ToolConfig type, and Tools index page

**Files:**
- Create: `apps/web/src/tools/ToolConfig.ts`
- Create: `apps/web/src/tools/registry.ts`
- Create: `apps/web/src/engines/types.ts`
- Modify: `apps/web/src/pages/ToolsIndex.tsx` (replaces the Task 5 placeholder)
- Create: `apps/web/src/components/PreviewBadge.tsx`

**Interfaces:**
- Produces: `EngineInput`, `EngineResult` types (Task 11-17 engines implement against these). `ToolConfig` type and `TOOLS: ToolConfig[]` registry — Task 8 (`ToolDetail`/`ToolPage`) and Tasks 11-17 (registering each engine) both depend on this. `PreviewBadge` component — reused by `ToolsIndex` cards and `ToolPage`'s result state (Task 8).
- This task registers all 7 tools with **placeholder engines** that throw; Tasks 11-17 replace each placeholder with the real implementation one at a time.

- [ ] **Step 1: Write `engines/types.ts`**

```ts
export interface EngineInput {
  files: File[];
  options: Record<string, unknown>;
  onProgress?: (fraction: number) => void;
}

export interface EngineOutputFile {
  name: string;
  blob: Blob;
}

export interface EngineResult {
  files: EngineOutputFile[];
  summary: string; // e.g. "−75% smaller", "14 pages → 3 files"
  isPreview: boolean;
}

export type Engine = (input: EngineInput) => Promise<EngineResult>;
```

- [ ] **Step 2: Write `tools/ToolConfig.ts`**

```ts
import type { ComponentType, SVGProps } from "react";
import type { Engine } from "@/engines/types";

export interface OptionsPanelProps<TOptions = Record<string, unknown>> {
  options: TOptions;
  onChange: (options: TOptions) => void;
  disabled: boolean;
}

export interface ToolConfig {
  slug: string;
  name: string;
  description: string;
  category: "pdf" | "image";
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  accept: string[];
  multiple: boolean;
  defaultOptions: Record<string, unknown>;
  OptionsPanel: ComponentType<OptionsPanelProps>;
  engine: Engine;
  status: "live" | "preview";
}
```

- [ ] **Step 3: Write `components/PreviewBadge.tsx`**

```tsx
export function PreviewBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent-hi bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-on-accent">
      PREVIEW
    </span>
  );
}
```

- [ ] **Step 4: Write a shared placeholder options panel and 7 placeholder engines, then `tools/registry.ts`**

```tsx
// apps/web/src/tools/options/PlaceholderOptions.tsx
export function PlaceholderOptions() {
  return <p className="text-[12.5px] text-muted">No options yet.</p>;
}
```

```ts
// apps/web/src/tools/registry.ts
import type { ToolConfig } from "./ToolConfig";
import { PlaceholderOptions } from "./options/PlaceholderOptions";

const notImplemented: ToolConfig["engine"] = async () => {
  throw new Error("This tool's engine has not been implemented yet.");
};

const IconStub = () => (
  <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="14" height="14" rx="2" />
  </svg>
);

export const TOOLS: ToolConfig[] = [
  { slug: "merge", name: "Merge PDF", description: "Combine PDFs in the order you choose, with page ranges per file.", category: "pdf", Icon: IconStub, accept: [".pdf"], multiple: true, defaultOptions: {}, OptionsPanel: PlaceholderOptions, engine: notImplemented, status: "live" },
  { slug: "split", name: "Split PDF", description: "Cut into ranges, chop every N pages, extract or delete a selection.", category: "pdf", Icon: IconStub, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: PlaceholderOptions, engine: notImplemented, status: "live" },
  { slug: "organize", name: "Organize pages", description: "Reorder, rotate and drop pages on a page canvas.", category: "pdf", Icon: IconStub, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: PlaceholderOptions, engine: notImplemented, status: "live" },
  { slug: "compress", name: "Compress PDF", description: "Shrink for email, with the quality trade-off shown before you commit.", category: "pdf", Icon: IconStub, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: PlaceholderOptions, engine: notImplemented, status: "preview" },
  { slug: "pdf-to-images", name: "PDF to images", description: "Render pages to PNG or JPG at the DPI you pick.", category: "pdf", Icon: IconStub, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: PlaceholderOptions, engine: notImplemented, status: "live" },
  { slug: "images-to-pdf", name: "Images to PDF", description: "Scans and photos into one PDF, one image per page.", category: "image", Icon: IconStub, accept: [".png", ".jpg", ".jpeg"], multiple: true, defaultOptions: {}, OptionsPanel: PlaceholderOptions, engine: notImplemented, status: "live" },
  { slug: "convert-images", name: "Convert images", description: "PNG, JPG and WebP any direction — and HEIC off an iPhone.", category: "image", Icon: IconStub, accept: [".png", ".jpg", ".jpeg", ".webp", ".heic"], multiple: true, defaultOptions: {}, OptionsPanel: PlaceholderOptions, engine: notImplemented, status: "preview" },
];

export function getTool(slug: string): ToolConfig | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
```

- [ ] **Step 5: Implement `ToolsIndex.tsx`**

```tsx
import { Link } from "react-router-dom";
import { TOOLS } from "@/tools/registry";
import { PreviewBadge } from "@/components/PreviewBadge";

export function ToolsIndex() {
  const pdfTools = TOOLS.filter((t) => t.category === "pdf");
  const imageTools = TOOLS.filter((t) => t.category === "image");

  return (
    <div className="mx-auto max-w-6xl px-8 py-13">
      <h1 className="m-0 text-4xl font-semibold tracking-[-0.032em]">All tools</h1>
      <p className="mt-2.5 max-w-[58ch] text-[15.5px] text-muted">
        Each one runs locally. Pick a tool, drop a file, get a file — the
        same seven that ship in the desktop app.
      </p>

      {[
        { label: "PDF TOOLS", tools: pdfTools },
        { label: "IMAGE TOOLS", tools: imageTools },
      ].map((group) => (
        <div key={group.label}>
          <div className="mt-9 flex items-center gap-3">
            <span className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-faint">{group.label}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.tools.map((tool) => (
              <Link
                key={tool.slug}
                to={`/tools/${tool.slug}`}
                className="rounded-[14px] border border-border bg-surface p-5 hover:border-accent hover:shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between">
                  <tool.Icon className="size-5.5" />
                  {tool.status === "preview" && <PreviewBadge />}
                </div>
                <div className="mt-3 text-[15px] font-semibold">{tool.name}</div>
                <div className="mt-1 text-[13px] leading-relaxed text-muted">{tool.description}</div>
                <div className="mt-3 font-mono text-[11px] text-accent">Open →</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Verify**

```bash
npm run typecheck --workspace=apps/web
npm run dev --workspace=apps/web
```

Visit `/tools`. Confirm 5 tools show no badge, Compress and Convert images
show a "PREVIEW" badge, and each card links to `/tools/<slug>` (which still
shows the Task 5 `ToolDetail` placeholder — that's expected until Task 8).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/tools apps/web/src/engines/types.ts apps/web/src/components/PreviewBadge.tsx apps/web/src/pages/ToolsIndex.tsx
git commit -m "$(cat <<'EOF'
Add tool registry, ToolConfig, and the Tools index page

Registers all 7 tools with placeholder engines; Tasks 11-17 replace
each placeholder with a real implementation one at a time.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Shared `ToolPage` shell (drop zone → options → run → result)

**Files:**
- Create: `apps/web/src/components/FileDropZone.tsx`
- Create: `apps/web/src/components/ResultCard.tsx`
- Create: `apps/web/src/components/ToolPage.tsx`
- Create: `apps/web/src/components/ToolPage.test.tsx`
- Modify: `apps/web/src/pages/ToolDetail.tsx` (replaces the Task 5 placeholder)

**Interfaces:**
- Consumes: `ToolConfig`, `getTool` from `tools/registry.ts` (Task 7); `EngineResult` from `engines/types.ts` (Task 7); `PreviewBadge` (Task 7).
- Produces: `ToolPage` is the shell every one of the 7 tool pages renders through — no later task edits this file, they only add engines/options that plug into it via the registry.

- [ ] **Step 1: Write the failing test for `ToolPage`'s state machine**

```tsx
// apps/web/src/components/ToolPage.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToolPage } from "./ToolPage";
import type { ToolConfig } from "@/tools/ToolConfig";

function makeTool(overrides: Partial<ToolConfig> = {}): ToolConfig {
  return {
    slug: "test-tool",
    name: "Test Tool",
    description: "A tool for testing.",
    category: "pdf",
    Icon: () => <svg />,
    accept: [".pdf"],
    multiple: false,
    defaultOptions: {},
    OptionsPanel: () => <div>options</div>,
    engine: async () => ({
      files: [{ name: "out.pdf", blob: new Blob(["x"]) }],
      summary: "Done",
      isPreview: false,
    }),
    status: "live",
    ...overrides,
  };
}

describe("ToolPage", () => {
  it("starts empty, moves to ready after a file is added, and to done after run", async () => {
    const tool = makeTool();
    render(<ToolPage tool={tool} />);

    expect(screen.getByText(/drop a file here/i)).toBeInTheDocument();

    const file = new File(["content"], "input.pdf", { type: "application/pdf" });
    const input = screen.getByTestId("file-input");
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("input.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
    expect(screen.getByText("out.pdf")).toBeInTheDocument();
  });

  it("shows an error state when the engine throws", async () => {
    const tool = makeTool({
      engine: async () => {
        throw new Error("boom");
      },
    });
    render(<ToolPage tool={tool} />);

    const file = new File(["content"], "input.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: /run/i }));

    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Add test dependencies and run to verify it fails**

```bash
npm install -D @testing-library/react @testing-library/jest-dom --workspace=apps/web
```

Add to `apps/web/vitest.config.ts`'s `test` block: `setupFiles: ["./src/test-setup.ts"]`,
and create `apps/web/src/test-setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

```bash
npm run test --workspace=apps/web -- ToolPage.test.tsx
```

Expected: FAIL — `./ToolPage` does not exist yet.

- [ ] **Step 3: Write `FileDropZone.tsx`**

```tsx
import { useRef, type DragEvent } from "react";

export function FileDropZone({
  accept,
  multiple,
  onFiles,
}: {
  accept: string[];
  multiple: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="flex min-h-[400px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface hover:border-accent hover:bg-accent-soft"
    >
      <input
        ref={inputRef}
        data-testid="file-input"
        type="file"
        accept={accept.join(",")}
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))}
      />
      <span className="grid size-18 place-items-center rounded-[22px] bg-accent-soft">
        <svg width="32" height="32" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="1.4">
          <path d="M10 13.5V4M10 4L6.8 7.2M10 4l3.2 3.2" />
          <path d="M3.5 12.5V15a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 16.5 15v-2.5" />
        </svg>
      </span>
      <div className="text-center">
        <div className="text-lg font-semibold">Drop a file here</div>
        <div className="mt-1 text-[13.5px] text-muted">or click anywhere in this box to browse</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `ResultCard.tsx`**

```tsx
import { PreviewBadge } from "./PreviewBadge";
import type { EngineResult } from "@/engines/types";

export function ResultCard({
  result,
  onReset,
}: {
  result: EngineResult;
  onReset: () => void;
}) {
  return (
    <div className="flex min-h-[400px] flex-col justify-center rounded-2xl border border-border bg-surface p-8">
      <div className="flex items-center gap-2">
        <span className="size-1.75 rounded-full bg-ok" />
        <span className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-ok">DONE · ON THIS MACHINE</span>
        {result.isPreview && <PreviewBadge />}
      </div>
      <div className="mt-5 text-lg font-semibold">{result.summary}</div>
      <div className="mt-5 flex flex-col gap-2.5">
        {result.files.map((f) => (
          <div key={f.name} className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 p-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium">{f.name}</div>
            </div>
            <a
              href={URL.createObjectURL(f.blob)}
              download={f.name}
              className="rounded-[9px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-hi"
            >
              Download
            </a>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-5 w-fit rounded-[11px] border border-border px-4 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text"
      >
        Start over
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Implement `ToolPage.tsx`**

```tsx
import { useState } from "react";
import type { ToolConfig } from "@/tools/ToolConfig";
import type { EngineResult } from "@/engines/types";
import { FileDropZone } from "./FileDropZone";
import { ResultCard } from "./ResultCard";

type Step = "empty" | "ready" | "running" | "done" | "error";

const LARGE_FILE_WARNING_BYTES = 150 * 1024 * 1024; // ~150 MB, per spec's browser-memory ceiling

export function ToolPage({ tool }: { tool: ToolConfig }) {
  const [step, setStep] = useState<Step>("empty");
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<Record<string, unknown>>(tool.defaultOptions);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedSizeWarning, setDismissedSizeWarning] = useState(false);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const showSizeWarning = totalBytes > LARGE_FILE_WARNING_BYTES && !dismissedSizeWarning;

  function handleFiles(newFiles: File[]) {
    setFiles(newFiles);
    setDismissedSizeWarning(false);
    setStep("ready");
  }

  function reset() {
    setFiles([]);
    setResult(null);
    setError(null);
    setOptions(tool.defaultOptions);
    setStep("empty");
  }

  async function run() {
    setStep("running");
    setError(null);
    try {
      const engineResult = await tool.engine({ files, options });
      setResult(engineResult);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mt-3.5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_344px]">
        <div>
          {step === "empty" && (
            <FileDropZone accept={tool.accept} multiple={tool.multiple} onFiles={handleFiles} />
          )}

          {(step === "ready" || step === "running") && (
            <div className="min-h-[400px] rounded-2xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">INPUT</span>
                <button type="button" onClick={reset} className="text-[12.5px] text-muted hover:text-danger">
                  Remove
                </button>
              </div>
              <ul className="flex flex-col gap-2">
                {files.map((f) => (
                  <li key={f.name} className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 p-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{f.name}</div>
                      <div className="mt-0.5 font-mono text-[11.5px] text-muted">
                        {(f.size / 1024).toFixed(0)} KB
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showSizeWarning && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3.5">
              <span className="mt-0.5 flex-none text-[13px]">⚠</span>
              <div className="flex-1 text-[12.5px] leading-relaxed text-muted">
                {(totalBytes / (1024 * 1024)).toFixed(0)} MB is a lot for one browser tab — this may
                run slowly or the tab may run out of memory. The desktop app has no such limit.
              </div>
              <button
                type="button"
                onClick={() => setDismissedSizeWarning(true)}
                className="flex-none text-[12.5px] text-muted hover:text-text"
              >
                Dismiss
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="min-h-[400px] rounded-2xl border border-danger bg-danger-soft p-8">
              <div className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-danger">ERROR</div>
              <p className="mt-3 text-sm text-text">{error}</p>
              <button
                type="button"
                onClick={reset}
                className="mt-5 rounded-[11px] border border-border px-4 py-2 text-sm text-muted hover:bg-surface-2"
              >
                Start over
              </button>
            </div>
          )}

          {step === "done" && result && <ResultCard result={result} onReset={reset} />}
        </div>

        <div className="sticky top-[82px] overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-3.5 text-[12.5px] font-semibold">Options</div>
          <div className="p-4">
            <tool.OptionsPanel
              options={options}
              onChange={setOptions}
              disabled={step === "running" || step === "done"}
            />
          </div>
          <div className="border-t border-border bg-surface-2 px-4 py-3.5">
            <button
              type="button"
              onClick={run}
              disabled={step === "empty" || step === "running"}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-accent text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
            >
              {step === "running" ? "Working…" : step === "done" ? "Run again" : "Run"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run to verify it passes**

```bash
npm run test --workspace=apps/web -- ToolPage.test.tsx
```

Expected: 2 passed.

- [ ] **Step 7: Wire up `ToolDetail.tsx`**

```tsx
import { useParams } from "react-router-dom";
import { getTool } from "@/tools/registry";
import { ToolPage } from "@/components/ToolPage";
import { PreviewBadge } from "@/components/PreviewBadge";

export function ToolDetail() {
  const { slug } = useParams<{ slug: string }>();
  const tool = slug ? getTool(slug) : undefined;

  if (!tool) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-14">
        <h1 className="text-2xl font-semibold">Tool not found</h1>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto flex max-w-6xl items-start gap-3.5 px-8 pt-8">
        <span className="grid size-9.5 flex-none place-items-center rounded-[11px] border border-border bg-surface">
          <tool.Icon className="size-5" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{tool.name}</h1>
            {tool.status === "preview" && <PreviewBadge />}
          </div>
          <p className="mt-1 text-sm text-muted">{tool.description}</p>
        </div>
      </div>
      <ToolPage tool={tool} />
    </div>
  );
}
```

- [ ] **Step 8: Verify visually and commit**

```bash
npm run dev --workspace=apps/web
```

Visit `/tools/merge` (still using the placeholder engine — clicking Run will
show the error state with "This tool's engine has not been implemented yet.",
which is expected until Task 11).

```bash
git add apps/web/src/components apps/web/src/pages/ToolDetail.tsx apps/web/src/test-setup.ts apps/web/vitest.config.ts apps/web/package.json apps/web/package-lock.json
git commit -m "$(cat <<'EOF'
Add the shared ToolPage shell: drop zone, options rail, run, result

One component drives every tool's empty/ready/running/done/error
states; Tasks 11-17 plug in real engines without touching this file.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: How it works, Privacy, and Download pages

**Files:**
- Modify: `apps/web/src/pages/HowItWorks.tsx`
- Modify: `apps/web/src/pages/Privacy.tsx`
- Modify: `apps/web/src/pages/Download.tsx`

**Interfaces:**
- Consumes: `useRequestCount` (Task 5/3) in `Privacy.tsx`.
- Produces: nothing consumed elsewhere — three leaf pages.

- [ ] **Step 1: Implement `HowItWorks.tsx`**

Port the design's four-step explanation and the browser-vs-desktop
comparison table, adjusted to not overclaim features not yet built (no WASM
bundle size claim, no service-worker offline claim — those are out of scope
per the spec):

```tsx
export function HowItWorks() {
  const steps = [
    { n: "01", title: "The tool code arrives with the page", body: "The site is a normal web app: HTML, CSS and JS load like any other page. After that, opening a tool makes no further requests." },
    { n: "02", title: "Your file is read, not uploaded", body: "Dropping a file hands the browser a local handle. The bytes go into memory the tab owns. There is no fetch() anywhere in the tool code." },
    { n: "03", title: "Processing happens in your browser", body: "Merge, split, organize and the PDF/image conversions run against the file in memory using pdf-lib and pdf.js — the same libraries, running locally, every time." },
    { n: "04", title: "The result is a download", body: "Output comes back as a blob and your browser saves it wherever downloads go. Nothing persists in the tab once you close it." },
  ];

  const rows = [
    ["File size ceiling", "~200 MB", "Disk-bound"],
    ["Batch / whole folders", "No", "Yes"],
    ["Saves to a folder you pick", "Downloads only", "Yes"],
    ["Ghostscript-grade compression", "Preview only", "Full"],
    ["Install required", "None", "14 MB installer"],
  ];

  return (
    <div className="mx-auto max-w-[820px] px-8 py-14">
      <h1 className="m-0 text-4xl font-semibold tracking-[-0.032em]">How it works</h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        The desktop app and this website process the same kinds of files. On
        Windows the engine is native (Rust + Python + Ghostscript); in the
        browser it's pdf-lib and pdf.js, running against the file you drop.
        Neither one has a server behind it.
      </p>

      <div className="mt-10 flex flex-col">
        {steps.map((s) => (
          <div key={s.n} className="grid grid-cols-[80px_1fr] gap-6 border-t border-border py-6 last:border-b">
            <span className="font-mono text-xs font-bold text-accent">{s.n}</span>
            <div>
              <div className="text-[17px] font-semibold">{s.title}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-[22px] font-semibold tracking-[-0.02em]">Where the browser has limits</h2>
      <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">
        Being honest about this is the point of the desktop build.
      </p>
      <div className="mt-5 overflow-hidden rounded-[14px] border border-border">
        <div className="grid grid-cols-3 border-b border-border bg-surface-2 px-4.5 py-3 font-mono text-[10.5px] font-bold tracking-[0.12em] text-faint">
          <span /><span>BROWSER</span><span>DESKTOP</span>
        </div>
        {rows.map((row) => (
          <div key={row[0]} className="grid grid-cols-3 items-center border-b border-border px-4.5 py-3.5 text-[13.5px] last:border-b-0">
            <span>{row[0]}</span>
            <span className="text-muted">{row[1]}</span>
            <span className="text-muted">{row[2]}</span>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-[22px] font-semibold tracking-[-0.02em]">Browser support</h2>
      <div className="mt-4 flex flex-wrap gap-2.5 font-mono text-[11.5px]">
        {["Chrome 111+", "Edge 111+", "Firefox 113+", "Safari 16.4+"].map((b) => (
          <span key={b} className="rounded-lg border border-border bg-surface px-3 py-1.5">{b}</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `Privacy.tsx`**

```tsx
import { Link } from "react-router-dom";
import { useRequestCount } from "@/components/layout/RequestStatusContext";

export function Privacy() {
  const reqCount = useRequestCount();
  const items = [
    ["Upload your file", "there is no endpoint that accepts one."],
    ["Set cookies", "your theme choice is the one exception, kept in this browser via localStorage."],
    ["Load web fonts or scripts from third parties", "fonts and code are served from this domain."],
    ["Ask who you are", "no sign-up, no email, no usage cap tied to an identity."],
  ];

  return (
    <div className="mx-auto max-w-[820px] px-8 py-14">
      <h1 className="m-0 text-4xl font-semibold tracking-[-0.032em]">Privacy</h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        Short version: this site has no server-side processing, no accounts,
        no analytics and no cookies beyond a theme preference. There is
        nothing to write a policy about, so here is what happens instead.
      </p>

      <div className="mt-8 rounded-[14px] border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <span className="size-1.75 rounded-full bg-ok" />
          <span className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-ok">THIS SESSION</span>
        </div>
        <div className="mt-4.5 grid grid-cols-2 gap-4 font-mono sm:grid-cols-4">
          <div>
            <div className="text-[30px] font-bold tracking-[-0.03em]">{reqCount}</div>
            <div className="mt-0.5 text-[10.5px] text-muted">REQUESTS</div>
          </div>
          <div>
            <div className="text-[30px] font-bold tracking-[-0.03em]">0</div>
            <div className="mt-0.5 text-[10.5px] text-muted">BYTES SENT</div>
          </div>
          <div>
            <div className="text-[30px] font-bold tracking-[-0.03em]">0</div>
            <div className="mt-0.5 text-[10.5px] text-muted">TRACKERS</div>
          </div>
        </div>
        <p className="mt-4.5 text-[13px] leading-relaxed text-muted">
          Counted by the page itself, live, from every fetch() and
          XMLHttpRequest call. Confirm it in DevTools → Network: load the
          site, run a tool, and the request list stays where it is.
        </p>
      </div>

      <h2 className="mt-11 text-xl font-semibold tracking-[-0.02em]">What the site does not do</h2>
      <div className="mt-4 flex flex-col">
        {items.map(([title, body]) => (
          <div key={title} className="flex items-start gap-3 border-t border-border py-3.5 last:border-b">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--faint)" strokeWidth="1.5" className="mt-0.5 flex-none">
              <circle cx="8" cy="8" r="6.3" />
              <path d="M4 4l8 8" />
            </svg>
            <div>
              <span className="text-sm font-medium">{title}</span>
              <span className="text-sm text-muted"> — {body}</span>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-11 text-xl font-semibold tracking-[-0.02em]">The desktop build goes further</h2>
      <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">
        A browser can always be told to make a request by something else on
        the page. The Windows app removes that possibility: it ships with no
        networking code, no analytics, no auto-updater and no web fonts.
        Nothing in it can be switched on.
      </p>
      <Link to="/download" className="mt-4.5 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
        Get the desktop app
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Implement `Download.tsx`**

```tsx
import { Link } from "react-router-dom";

export function Download() {
  const perks = [
    ["Files of any size", "Limited by your disk, not by tab memory."],
    ["Batch and folders", "Point it at 300 scans and walk away."],
    ["Output where you want it", "Per-tool destinations, remembered."],
    ["Ghostscript compression", "The full engine, not the browser preview."],
    ["Zero network code", "Not \"we don't send\" — it cannot send."],
  ];

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-14">
      <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[1fr_400px]">
        <div>
          <span className="font-mono text-[10.5px] font-bold tracking-[0.15em] text-accent">WINDOWS</span>
          <h1 className="mt-4 text-[40px] font-semibold leading-[1.05] tracking-[-0.035em]">
            The same seven tools, with no browser in the way.
          </h1>
          <p className="mt-4 max-w-[48ch] text-base leading-relaxed text-muted">
            Bigger files, whole folders at once, output saved where you want
            it. Contains no networking code at all — the build cannot phone
            home even if you ask it to.
          </p>
          <p className="mt-6 text-[13.5px] leading-relaxed text-muted">
            Builds are published from{" "}
            <a href="https://github.com/Nisarg6502/IHatePDF/releases" className="text-accent">
              the project's GitHub Releases
            </a>{" "}
            once available.
          </p>
          <p className="mt-6 text-[13.5px] leading-relaxed text-muted">
            No installer for macOS or Linux yet. Both work fine in the
            browser version — <Link to="/tools" className="text-accent">open the tools</Link> instead.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-border px-4.5 py-3.5 text-[12.5px] font-semibold">
            What the desktop app adds
          </div>
          <div className="px-4.5 pb-3.5 pt-1.5">
            {perks.map(([title, body]) => (
              <div key={title} className="flex items-start gap-2.5 border-b border-border py-3.5 last:border-b-0">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--ok)" strokeWidth="1.8" className="mt-0.5 flex-none">
                  <path d="M2.5 8.4l3.2 3.2L13.5 4" />
                </svg>
                <div>
                  <div className="text-[13.5px] font-medium">{title}</div>
                  <div className="text-[12.5px] text-muted">{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

Note: this deliberately does not fabricate a version number, file size, or
SHA-256 hash the way the design mock does — those are real facts about a
real release artifact that don't exist yet. Points to GitHub Releases
instead; update with real download links once `apps/desktop`'s installer CI
publishes one.

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck --workspace=apps/web
npm run dev --workspace=apps/web
```

Visit `/how-it-works`, `/privacy`, `/download` in both themes.

```bash
git add apps/web/src/pages/HowItWorks.tsx apps/web/src/pages/Privacy.tsx apps/web/src/pages/Download.tsx
git commit -m "$(cat <<'EOF'
Implement How it works, Privacy, and Download pages

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Shared engine test helpers (synthetic fixtures)

**Files:**
- Create: `apps/web/src/engines/testHelpers.ts`

**Interfaces:**
- Produces: `makeTestPdf(pageCount: number, opts?: { pageSize?: [number, number] }): Promise<Uint8Array>`, `makeTestPng(width: number, height: number): Promise<Uint8Array>` — consumed by every engine test in Tasks 11-17.

- [ ] **Step 1: Implement `testHelpers.ts`**

```ts
import { PDFDocument, rgb } from "pdf-lib";

export async function makeTestPdf(
  pageCount: number,
  opts: { pageSize?: [number, number] } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const [w, h] = opts.pageSize ?? [200, 300];
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([w, h]);
    page.drawText(`Page ${i + 1}`, { x: 20, y: h - 40, size: 18, color: rgb(0, 0, 0) });
  }
  return doc.save();
}

// A minimal valid 1x1 PNG, red pixel — enough for engines that only need a
// decodable image, not a realistic photo.
export function makeTestPng(): Uint8Array {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run typecheck --workspace=apps/web
```

Expected: no errors. (No test file for this task itself — it's exercised by
every engine test starting with Task 11.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/engines/testHelpers.ts
git commit -m "$(cat <<'EOF'
Add synthetic PDF/PNG fixture builders for engine tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Merge PDF engine (live)

**Files:**
- Create: `apps/web/src/engines/merge.ts`, `apps/web/src/engines/merge.test.ts`
- Create: `apps/web/src/tools/options/MergeOptions.tsx`
- Modify: `apps/web/src/tools/registry.ts` (swap `merge`'s `engine`/`OptionsPanel` for the real ones)

**Interfaces:**
- Consumes: `parseRanges` (Task 4), `makeTestPdf` (Task 10), `Engine`/`EngineInput`/`EngineResult` (Task 7).
- Produces: `mergeEngine: Engine`, consumed only by the registry entry in this task.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/engines/merge.test.ts
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergeEngine } from "./merge";
import { makeTestPdf } from "./testHelpers";

async function toFile(bytes: Uint8Array, name: string) {
  return new File([bytes], name, { type: "application/pdf" });
}

describe("mergeEngine", () => {
  it("concatenates all pages of all files in the given file order", async () => {
    const a = await toFile(await makeTestPdf(2), "a.pdf");
    const b = await toFile(await makeTestPdf(3), "b.pdf");

    const result = await mergeEngine({ files: [a, b], options: {} });

    expect(result.files).toHaveLength(1);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(5);
    expect(result.isPreview).toBe(false);
    expect(result.summary).toContain("5 pages");
  });

  it("applies a per-file page range when given one", async () => {
    const a = await toFile(await makeTestPdf(5), "a.pdf");

    const result = await mergeEngine({
      files: [a],
      options: { ranges: { "a.pdf": "1-2,5" } },
    });

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
  });

  it("rejects an empty file list", async () => {
    await expect(mergeEngine({ files: [], options: {} })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace=apps/web -- merge.test.ts
```

Expected: FAIL — `./merge` does not exist yet.

- [ ] **Step 3: Implement `engines/merge.ts`**

```ts
import { PDFDocument } from "pdf-lib";
import { parseRanges } from "@/lib/ranges";
import type { Engine } from "./types";

export const mergeEngine: Engine = async ({ files, options }) => {
  if (files.length === 0) {
    throw new Error("Add at least one PDF to merge.");
  }

  const ranges = (options.ranges as Record<string, string> | undefined) ?? {};
  const out = await PDFDocument.create();
  let totalPages = 0;

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const src = await PDFDocument.load(bytes);
    const spec = ranges[file.name] ?? "";
    const indices = parseRanges(spec, src.getPageCount());
    const pages = await out.copyPages(src, indices);
    pages.forEach((p) => out.addPage(p));
    totalPages += pages.length;
  }

  const bytes = await out.save();
  return {
    files: [{ name: "merged.pdf", blob: new Blob([bytes], { type: "application/pdf" }) }],
    summary: `${files.length} files → 1 file, ${totalPages} pages`,
    isPreview: false,
  };
};
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test --workspace=apps/web -- merge.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Write `MergeOptions.tsx`**

```tsx
import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function MergeOptions({ disabled }: OptionsPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-relaxed text-muted">
        Files merge in the order you added them. Per-file page ranges are
        coming to this panel — for now every page of every file is included.
      </p>
      <label className="flex items-center gap-2 text-[12.5px] text-faint">
        <input type="checkbox" disabled={disabled} />
        Reverse file order
      </label>
    </div>
  );
}
```

(Kept intentionally simple for Phase 1 — a full drag-to-reorder file list
with per-file range inputs is a natural fast-follow once the engine
contract above is proven out; the `options.ranges` shape already supports
it without an engine change.)

- [ ] **Step 6: Register the real engine and options panel**

In `apps/web/src/tools/registry.ts`, import `mergeEngine` and `MergeOptions`,
and change the `merge` entry's `engine: notImplemented` →
`engine: mergeEngine` and `OptionsPanel: PlaceholderOptions` →
`OptionsPanel: MergeOptions`.

- [ ] **Step 7: Verify end-to-end in the browser**

```bash
npm run dev --workspace=apps/web
```

Visit `/tools/merge`, drop two real small PDFs, click Run, confirm the
result card shows a download link and the page count matches the sum of the
inputs.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/engines/merge.ts apps/web/src/engines/merge.test.ts apps/web/src/tools/options/MergeOptions.tsx apps/web/src/tools/registry.ts
git commit -m "$(cat <<'EOF'
Implement the Merge PDF engine (live)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Split PDF engine (live)

**Files:**
- Create: `apps/web/src/engines/split.ts`, `apps/web/src/engines/split.test.ts`
- Create: `apps/web/src/tools/options/SplitOptions.tsx`
- Modify: `apps/web/src/tools/registry.ts`

**Interfaces:**
- Consumes: `parseRanges` (Task 4), `makeTestPdf` (Task 10), `Engine` types (Task 7).
- Produces: `splitEngine: Engine`, consumed only by the registry entry in this task.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/engines/split.test.ts
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { splitEngine } from "./split";
import { makeTestPdf } from "./testHelpers";

async function toFile(bytes: Uint8Array) {
  return new File([bytes], "in.pdf", { type: "application/pdf" });
}

describe("splitEngine", () => {
  it("splits by explicit ranges into one file per range", async () => {
    const file = await toFile(await makeTestPdf(6));
    const result = await splitEngine({
      files: [file],
      options: { mode: "ranges", ranges: "1-2,3-6" },
    });

    expect(result.files).toHaveLength(2);
    const first = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    const second = await PDFDocument.load(await result.files[1].blob.arrayBuffer());
    expect(first.getPageCount()).toBe(2);
    expect(second.getPageCount()).toBe(4);
  });

  it("splits every N pages", async () => {
    const file = await toFile(await makeTestPdf(5));
    const result = await splitEngine({
      files: [file],
      options: { mode: "everyN", n: 2 },
    });

    expect(result.files).toHaveLength(3);
    const counts = await Promise.all(
      result.files.map(async (f) => (await PDFDocument.load(await f.blob.arrayBuffer())).getPageCount()),
    );
    expect(counts).toEqual([2, 2, 1]);
  });

  it("extracts a selection into a single file", async () => {
    const file = await toFile(await makeTestPdf(5));
    const result = await splitEngine({
      files: [file],
      options: { mode: "extract", ranges: "1,3,5" },
    });

    expect(result.files).toHaveLength(1);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
  });

  it("deletes a selection, keeping the rest as one file", async () => {
    const file = await toFile(await makeTestPdf(5));
    const result = await splitEngine({
      files: [file],
      options: { mode: "delete", ranges: "2,4" },
    });

    expect(result.files).toHaveLength(1);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
  });

  it("rejects everyN mode with n < 1", async () => {
    const file = await toFile(await makeTestPdf(3));
    await expect(
      splitEngine({ files: [file], options: { mode: "everyN", n: 0 } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace=apps/web -- split.test.ts
```

Expected: FAIL — `./split` does not exist yet.

- [ ] **Step 3: Implement `engines/split.ts`**

```ts
import { PDFDocument } from "pdf-lib";
import { parseRanges } from "@/lib/ranges";
import type { Engine } from "./types";

type SplitMode = "ranges" | "everyN" | "extract" | "delete";

async function buildPdf(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

export const splitEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to split.");

  const mode = options.mode as SplitMode;
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const pageCount = src.getPageCount();
  const baseName = file.name.replace(/\.pdf$/i, "");

  if (mode === "ranges") {
    const specs = String(options.ranges ?? "").split(",").map((s) => s.trim());
    const outputs = await Promise.all(
      specs.map(async (spec, i) => {
        const indices = parseRanges(spec, pageCount);
        const pdfBytes = await buildPdf(src, indices);
        return { name: `${baseName}-part${i + 1}.pdf`, blob: new Blob([pdfBytes], { type: "application/pdf" }) };
      }),
    );
    return { files: outputs, summary: `${pageCount} pages → ${outputs.length} files`, isPreview: false };
  }

  if (mode === "everyN") {
    const n = Number(options.n);
    if (!Number.isInteger(n) || n < 1) throw new Error("Pages per file must be at least 1.");
    const outputs: { name: string; blob: Blob }[] = [];
    for (let start = 0; start < pageCount; start += n) {
      const indices = Array.from(
        { length: Math.min(n, pageCount - start) },
        (_, i) => start + i,
      );
      const pdfBytes = await buildPdf(src, indices);
      outputs.push({ name: `${baseName}-part${outputs.length + 1}.pdf`, blob: new Blob([pdfBytes], { type: "application/pdf" }) });
    }
    return { files: outputs, summary: `${pageCount} pages → ${outputs.length} files of up to ${n} pages`, isPreview: false };
  }

  if (mode === "extract") {
    const indices = parseRanges(String(options.ranges ?? ""), pageCount);
    const pdfBytes = await buildPdf(src, indices);
    return {
      files: [{ name: `${baseName}-extracted.pdf`, blob: new Blob([pdfBytes], { type: "application/pdf" }) }],
      summary: `${indices.length} of ${pageCount} pages extracted`,
      isPreview: false,
    };
  }

  if (mode === "delete") {
    const toRemove = new Set(parseRanges(String(options.ranges ?? ""), pageCount));
    const indices = Array.from({ length: pageCount }, (_, i) => i).filter((i) => !toRemove.has(i));
    const pdfBytes = await buildPdf(src, indices);
    return {
      files: [{ name: `${baseName}-deleted.pdf`, blob: new Blob([pdfBytes], { type: "application/pdf" }) }],
      summary: `${toRemove.size} pages removed, ${indices.length} remain`,
      isPreview: false,
    };
  }

  throw new Error(`Unknown split mode: ${String(mode)}`);
};
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test --workspace=apps/web -- split.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Write `SplitOptions.tsx`**

```tsx
import type { OptionsPanelProps } from "@/tools/ToolConfig";

const MODES = [
  { value: "ranges", label: "By ranges", hint: "e.g. 1-3,4-6 → two files" },
  { value: "everyN", label: "Every N pages", hint: "chop into fixed-size chunks" },
  { value: "extract", label: "Extract a selection", hint: "one file with just those pages" },
  { value: "delete", label: "Delete a selection", hint: "one file with those pages removed" },
];

export function SplitOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const mode = (options.mode as string) ?? "ranges";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`cursor-pointer rounded-lg border p-2.5 ${mode === m.value ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
          >
            <input
              type="radio"
              name="split-mode"
              className="sr-only"
              checked={mode === m.value}
              disabled={disabled}
              onChange={() => onChange({ ...options, mode: m.value })}
            />
            <div className="text-[12.5px] font-semibold">{m.label}</div>
            <div className="text-[11.5px] text-muted">{m.hint}</div>
          </label>
        ))}
      </div>

      {mode === "everyN" ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">Pages per file</span>
          <input
            type="number"
            min={1}
            disabled={disabled}
            value={(options.n as number) ?? 1}
            onChange={(e) => onChange({ ...options, n: Number(e.target.value) })}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
        </label>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">Page ranges</span>
          <input
            type="text"
            placeholder="1-3,5"
            disabled={disabled}
            value={(options.ranges as string) ?? ""}
            onChange={(e) => onChange({ ...options, ranges: e.target.value })}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
        </label>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Register, verify, commit**

In `registry.ts`, set `split`'s `defaultOptions: { mode: "ranges", ranges: "", n: 2 }`,
`engine: splitEngine`, `OptionsPanel: SplitOptions`.

```bash
npm run dev --workspace=apps/web
```

Visit `/tools/split`, try each mode against a real PDF, confirm the file
count and page counts in the result.

```bash
git add apps/web/src/engines/split.ts apps/web/src/engines/split.test.ts apps/web/src/tools/options/SplitOptions.tsx apps/web/src/tools/registry.ts
git commit -m "$(cat <<'EOF'
Implement the Split PDF engine (live)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Organize pages engine (live)

**Files:**
- Create: `apps/web/src/engines/organize.ts`, `apps/web/src/engines/organize.test.ts`
- Create: `apps/web/src/tools/options/OrganizeOptions.tsx`
- Modify: `apps/web/src/tools/registry.ts`

**Interfaces:**
- Consumes: `makeTestPdf` (Task 10), `Engine` types (Task 7).
- Produces: `organizeEngine: Engine`, consumed only by the registry entry in this task. `options.order: number[]` (0-based original indices in output order), `options.rotate: Record<number, 90|180|270>` (original index → degrees), `options.remove: number[]` (original indices to drop).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/engines/organize.test.ts
import { describe, it, expect } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { organizeEngine } from "./organize";
import { makeTestPdf } from "./testHelpers";

async function toFile(bytes: Uint8Array) {
  return new File([bytes], "in.pdf", { type: "application/pdf" });
}

describe("organizeEngine", () => {
  it("reorders pages per the given order", async () => {
    const file = await toFile(await makeTestPdf(3));
    const result = await organizeEngine({
      files: [file],
      options: { order: [2, 0, 1], rotate: {}, remove: [] },
    });

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
  });

  it("removes pages listed in remove", async () => {
    const file = await toFile(await makeTestPdf(4));
    const result = await organizeEngine({
      files: [file],
      options: { order: [0, 1, 2, 3], rotate: {}, remove: [1, 3] },
    });

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(2);
  });

  it("rotates pages by the given degrees", async () => {
    const file = await toFile(await makeTestPdf(2));
    const result = await organizeEngine({
      files: [file],
      options: { order: [0, 1], rotate: { 0: 90 }, remove: [] },
    });

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPage(0).getRotation()).toEqual(degrees(90));
    expect(out.getPage(1).getRotation()).toEqual(degrees(0));
  });

  it("rejects a rotation that isn't a multiple of 90", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      organizeEngine({ files: [file], options: { order: [0], rotate: { 0: 45 }, remove: [] } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace=apps/web -- organize.test.ts
```

Expected: FAIL — `./organize` does not exist yet.

- [ ] **Step 3: Implement `engines/organize.ts`**

```ts
import { PDFDocument, degrees } from "pdf-lib";
import type { Engine } from "./types";

export const organizeEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to organize.");

  const order = (options.order as number[] | undefined) ?? [];
  const rotate = (options.rotate as Record<number, number> | undefined) ?? {};
  const remove = new Set((options.remove as number[] | undefined) ?? []);

  for (const deg of Object.values(rotate)) {
    if (deg % 90 !== 0) throw new Error(`Rotation must be a multiple of 90 degrees, got ${deg}.`);
  }

  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const keptOriginalIndices = order.filter((i) => !remove.has(i));

  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, keptOriginalIndices);
  pages.forEach((page, i) => {
    const originalIndex = keptOriginalIndices[i];
    const deg = rotate[originalIndex];
    if (deg) page.setRotation(degrees((page.getRotation().angle + deg) % 360));
    out.addPage(page);
  });

  const outBytes = await out.save();
  return {
    files: [{ name: file.name.replace(/\.pdf$/i, "-organized.pdf"), blob: new Blob([outBytes], { type: "application/pdf" }) }],
    summary: `${src.getPageCount()} pages in → ${pages.length} pages out`,
    isPreview: false,
  };
};
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test --workspace=apps/web -- organize.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Write a minimal `OrganizeOptions.tsx`**

Full drag-and-drop thumbnail reordering (matching the desktop app's
`OrganizeCanvas`) is a substantial UI on its own — Phase 1 ships a
functionally complete but simple list-based editor; the engine above already
supports whatever richer UI replaces it later, since it only needs
`order`/`rotate`/`remove` arrays of original page indices.

```tsx
import { useEffect, useState } from "react";
import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function OrganizeOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const order = (options.order as number[]) ?? [];
  const remove = new Set((options.remove as number[]) ?? []);
  const [pageCount, setPageCount] = useState(order.length);

  useEffect(() => {
    if (order.length === 0 && pageCount > 0) {
      onChange({ ...options, order: Array.from({ length: pageCount }, (_, i) => i) });
    }
  }, [pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange({ ...options, order: next });
  }

  function toggleRemove(pageIndex: number) {
    const next = new Set(remove);
    next.has(pageIndex) ? next.delete(pageIndex) : next.add(pageIndex);
    onChange({ ...options, remove: Array.from(next) });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Page count (from your PDF)</span>
        <input
          type="number"
          min={1}
          disabled={disabled}
          value={pageCount || ""}
          onChange={(e) => setPageCount(Number(e.target.value))}
          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
        />
      </label>
      <ul className="flex flex-col gap-1.5">
        {order.map((pageIndex, position) => (
          <li key={pageIndex} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12.5px]">
            <span className={remove.has(pageIndex) ? "text-faint line-through" : ""}>Page {pageIndex + 1}</span>
            <span className="flex-1" />
            <button type="button" disabled={disabled} onClick={() => move(position, position - 1)}>↑</button>
            <button type="button" disabled={disabled} onClick={() => move(position, position + 1)}>↓</button>
            <button type="button" disabled={disabled} onClick={() => toggleRemove(pageIndex)}>
              {remove.has(pageIndex) ? "Keep" : "Remove"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Register, verify, commit**

In `registry.ts`, set `organize`'s `defaultOptions: { order: [], rotate: {}, remove: [] }`,
`engine: organizeEngine`, `OptionsPanel: OrganizeOptions`.

```bash
npm run dev --workspace=apps/web
```

Visit `/tools/organize`, drop a real multi-page PDF, set the page count,
reorder/remove a couple of pages, Run, confirm the output page count.

```bash
git add apps/web/src/engines/organize.ts apps/web/src/engines/organize.test.ts apps/web/src/tools/options/OrganizeOptions.tsx apps/web/src/tools/registry.ts
git commit -m "$(cat <<'EOF'
Implement the Organize pages engine (live)

Reorder/rotate/remove work against original page indices; ships with
a simple list editor, ready for a richer drag-and-drop UI later.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: PDF to images engine (live)

**Files:**
- Create: `apps/web/src/engines/pdfToImages.ts`, `apps/web/src/engines/pdfToImages.test.ts`
- Create: `apps/web/src/tools/options/PdfToImagesOptions.tsx`
- Modify: `apps/web/src/tools/registry.ts`

**Interfaces:**
- Consumes: `makeTestPdf` (Task 10), `Engine` types (Task 7), `pdfjs-dist`.
- Produces: `pdfToImagesEngine: Engine`, consumed only by the registry entry in this task.

- [ ] **Step 1: Write the failing test**

`pdf.js` rendering needs a real `<canvas>`, which jsdom doesn't implement
pixel operations for — install `canvas` as a dev dependency so
`getContext("2d")` actually rasterizes in the Vitest/jsdom environment:

```bash
npm install -D canvas --workspace=apps/web
```

```ts
// apps/web/src/engines/pdfToImages.test.ts
import { describe, it, expect } from "vitest";
import { pdfToImagesEngine } from "./pdfToImages";
import { makeTestPdf } from "./testHelpers";

describe("pdfToImagesEngine", () => {
  it("renders one PNG per page at the requested DPI", async () => {
    const bytes = await makeTestPdf(3);
    const file = new File([bytes], "in.pdf", { type: "application/pdf" });

    const result = await pdfToImagesEngine({
      files: [file],
      options: { dpi: 96, format: "png" },
    });

    expect(result.files).toHaveLength(3);
    expect(result.files[0].name).toBe("in-page-1.png");
    expect(result.files[0].blob.type).toBe("image/png");
    expect(result.summary).toContain("3 pages");
  });

  it("supports jpg output", async () => {
    const bytes = await makeTestPdf(1);
    const file = new File([bytes], "in.pdf", { type: "application/pdf" });

    const result = await pdfToImagesEngine({ files: [file], options: { dpi: 96, format: "jpg" } });

    expect(result.files[0].blob.type).toBe("image/jpeg");
  });

  it("rejects a DPI outside 72-300", async () => {
    const bytes = await makeTestPdf(1);
    const file = new File([bytes], "in.pdf", { type: "application/pdf" });

    await expect(
      pdfToImagesEngine({ files: [file], options: { dpi: 500, format: "png" } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace=apps/web -- pdfToImages.test.ts
```

Expected: FAIL — `./pdfToImages` does not exist yet.

- [ ] **Step 3: Implement `engines/pdfToImages.ts`**

```ts
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { Engine } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const pdfToImagesEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to render.");

  const dpi = Number(options.dpi ?? 144);
  if (dpi < 72 || dpi > 300) throw new Error("DPI must be between 72 and 300.");
  const format = (options.format as string) === "jpg" ? "jpg" : "png";
  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";

  const bytes = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const baseName = file.name.replace(/\.pdf$/i, "");
  const outputs: { name: string; blob: Blob }[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const scale = dpi / 72;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable.");

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), mimeType, 0.92);
    });

    outputs.push({ name: `${baseName}-page-${pageNum}.${format}`, blob });
  }

  return {
    files: outputs,
    summary: `${doc.numPages} pages rendered at ${dpi} DPI`,
    isPreview: false,
  };
};
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test --workspace=apps/web -- pdfToImages.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Write `PdfToImagesOptions.tsx`**

```tsx
import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function PdfToImagesOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const dpi = (options.dpi as number) ?? 144;
  const format = (options.format as string) ?? "png";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold">Image DPI</span>
          <span className="font-mono text-[11.5px] text-muted">{dpi}</span>
        </div>
        <input
          type="range"
          min={72}
          max={300}
          step={1}
          disabled={disabled}
          value={dpi}
          onChange={(e) => onChange({ ...options, dpi: Number(e.target.value) })}
          className="ihp-slider"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Format</span>
        <div className="flex gap-1.5">
          {["png", "jpg"].map((f) => (
            <button
              key={f}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...options, format: f })}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] ${format === f ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Register, verify, commit**

In `registry.ts`, set `pdf-to-images`'s `defaultOptions: { dpi: 144, format: "png" }`,
`engine: pdfToImagesEngine`, `OptionsPanel: PdfToImagesOptions`.

```bash
npm run dev --workspace=apps/web
```

Visit `/tools/pdf-to-images`, drop a real PDF, run at a couple of DPIs,
confirm one image downloads per page and looks correct.

```bash
git add apps/web/src/engines/pdfToImages.ts apps/web/src/engines/pdfToImages.test.ts apps/web/src/tools/options/PdfToImagesOptions.tsx apps/web/src/tools/registry.ts apps/web/package.json apps/web/package-lock.json
git commit -m "$(cat <<'EOF'
Implement the PDF to images engine (live)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Images to PDF engine (live)

**Files:**
- Create: `apps/web/src/engines/imagesToPdf.ts`, `apps/web/src/engines/imagesToPdf.test.ts`
- Create: `apps/web/src/tools/options/ImagesToPdfOptions.tsx`
- Modify: `apps/web/src/tools/registry.ts`

**Interfaces:**
- Consumes: `makeTestPng` (Task 10), `Engine` types (Task 7).
- Produces: `imagesToPdfEngine: Engine`, consumed only by the registry entry in this task.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/engines/imagesToPdf.test.ts
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { imagesToPdfEngine } from "./imagesToPdf";
import { makeTestPng } from "./testHelpers";

function toFile(bytes: Uint8Array, name: string) {
  return new File([bytes], name, { type: "image/png" });
}

describe("imagesToPdfEngine", () => {
  it("creates one page per image, in file order", async () => {
    const a = toFile(makeTestPng(), "a.png");
    const b = toFile(makeTestPng(), "b.png");

    const result = await imagesToPdfEngine({ files: [a, b], options: { margin: 0 } });

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(2);
    expect(result.summary).toContain("2 images");
  });

  it("rejects an empty file list", async () => {
    await expect(imagesToPdfEngine({ files: [], options: {} })).rejects.toThrow();
  });

  it("rejects a negative margin", async () => {
    const a = toFile(makeTestPng(), "a.png");
    await expect(
      imagesToPdfEngine({ files: [a], options: { margin: -5 } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace=apps/web -- imagesToPdf.test.ts
```

Expected: FAIL — `./imagesToPdf` does not exist yet.

- [ ] **Step 3: Implement `engines/imagesToPdf.ts`**

```ts
import { PDFDocument } from "pdf-lib";
import type { Engine } from "./types";

const A4 = [595.28, 841.89] as const; // points

export const imagesToPdfEngine: Engine = async ({ files, options }) => {
  if (files.length === 0) throw new Error("Add at least one image.");

  const margin = Number(options.margin ?? 24);
  if (margin < 0) throw new Error("Margin cannot be negative.");

  const doc = await PDFDocument.create();

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
    const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);

    const [pageW, pageH] = A4;
    const page = doc.addPage([pageW, pageH]);
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;

    page.drawImage(image, {
      x: (pageW - w) / 2,
      y: (pageH - h) / 2,
      width: w,
      height: h,
    });
  }

  const outBytes = await doc.save();
  return {
    files: [{ name: "images.pdf", blob: new Blob([outBytes], { type: "application/pdf" }) }],
    summary: `${files.length} images → 1 PDF, ${files.length} pages`,
    isPreview: false,
  };
};
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test --workspace=apps/web -- imagesToPdf.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Write `ImagesToPdfOptions.tsx`**

```tsx
import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function ImagesToPdfOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const margin = (options.margin as number) ?? 24;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold">Margin (points)</span>
      <input
        type="number"
        min={0}
        disabled={disabled}
        value={margin}
        onChange={(e) => onChange({ ...options, margin: Number(e.target.value) })}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
      />
      <span className="text-[11.5px] text-muted">Each image is centered on its own A4 page.</span>
    </label>
  );
}
```

- [ ] **Step 6: Register, verify, commit**

In `registry.ts`, set `images-to-pdf`'s `defaultOptions: { margin: 24 }`,
`engine: imagesToPdfEngine`, `OptionsPanel: ImagesToPdfOptions`.

```bash
npm run dev --workspace=apps/web
```

Visit `/tools/images-to-pdf`, drop 2-3 real JPG/PNG photos, Run, confirm a
downloadable PDF with one page per image.

```bash
git add apps/web/src/engines/imagesToPdf.ts apps/web/src/engines/imagesToPdf.test.ts apps/web/src/tools/options/ImagesToPdfOptions.tsx apps/web/src/tools/registry.ts
git commit -m "$(cat <<'EOF'
Implement the Images to PDF engine (live)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Compress engine (preview) and Convert images engine (live PNG/JPG/WebP, preview HEIC)

**Files:**
- Create: `apps/web/src/engines/compress.ts`, `apps/web/src/engines/compress.test.ts`
- Create: `apps/web/src/engines/convertImages.ts`, `apps/web/src/engines/convertImages.test.ts`
- Create: `apps/web/src/tools/options/CompressOptions.tsx`
- Create: `apps/web/src/tools/options/ConvertImagesOptions.tsx`
- Modify: `apps/web/src/tools/registry.ts`

**Interfaces:**
- Consumes: `makeTestPdf`, `makeTestPng` (Task 10), `pdfjs-dist` (already a dependency from Task 14), `Engine` types (Task 7).
- Produces: `compressEngine: Engine`, `convertImagesEngine: Engine`, consumed only by their registry entries.

- [ ] **Step 1: Write the failing tests for Compress**

```ts
// apps/web/src/engines/compress.test.ts
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { compressEngine } from "./compress";
import { makeTestPdf } from "./testHelpers";

describe("compressEngine", () => {
  it("returns a smaller (or equal) PDF, marked as a preview", async () => {
    const bytes = await makeTestPdf(3);
    const file = new File([bytes], "in.pdf", { type: "application/pdf" });

    const result = await compressEngine({ files: [file], options: { dpi: 96 } });

    expect(result.isPreview).toBe(true);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(3);
    expect(result.summary).toMatch(/preview/i);
  });

  it("rejects a DPI outside 72-300", async () => {
    const bytes = await makeTestPdf(1);
    const file = new File([bytes], "in.pdf", { type: "application/pdf" });
    await expect(
      compressEngine({ files: [file], options: { dpi: 30 } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace=apps/web -- compress.test.ts
```

Expected: FAIL — `./compress` does not exist yet.

- [ ] **Step 3: Implement `engines/compress.ts`**

This is deliberately the simplest thing that produces a genuinely smaller,
genuinely valid PDF: rasterize each page at a lower DPI via `pdf.js` and
rebuild the PDF with `pdf-lib`, one JPEG per page. It does **not** preserve
selectable text — that gap (and matching Ghostscript's quality/text-vector
preservation) is exactly why the result is labeled `isPreview: true`.

```ts
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PDFDocument } from "pdf-lib";
import type { Engine } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const compressEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to compress.");

  const dpi = Number(options.dpi ?? 96);
  if (dpi < 72 || dpi > 300) throw new Error("DPI must be between 72 and 300.");

  const originalBytes = await file.arrayBuffer();
  const srcDoc = await pdfjsLib.getDocument({ data: originalBytes }).promise;
  const out = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= srcDoc.numPages; pageNum++) {
    const page = await srcDoc.getPage(pageNum);
    const scale = dpi / 72;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable.");
    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const jpegBlob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), "image/jpeg", 0.7);
    });
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
    const image = await out.embedJpg(jpegBytes);

    const outPage = out.addPage([viewport.width, viewport.height]);
    outPage.drawImage(image, { x: 0, y: 0, width: viewport.width, height: viewport.height });
  }

  const outBytes = await out.save();
  const originalSize = originalBytes.byteLength;
  const newSize = outBytes.byteLength;
  const pct = originalSize > 0 ? Math.round((1 - newSize / originalSize) * 100) : 0;

  return {
    files: [{ name: file.name.replace(/\.pdf$/i, "-compressed.pdf"), blob: new Blob([outBytes], { type: "application/pdf" }) }],
    summary: `Preview engine: ${pct >= 0 ? "−" : "+"}${Math.abs(pct)}% size, text is not preserved as selectable yet`,
    isPreview: true,
  };
};
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test --workspace=apps/web -- compress.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Write the failing tests for Convert images**

```ts
// apps/web/src/engines/convertImages.test.ts
import { describe, it, expect } from "vitest";
import { convertImagesEngine } from "./convertImages";
import { makeTestPng } from "./testHelpers";

describe("convertImagesEngine", () => {
  it("converts PNG to JPG (live)", async () => {
    const file = new File([makeTestPng()], "a.png", { type: "image/png" });
    const result = await convertImagesEngine({ files: [file], options: { to: "jpg" } });

    expect(result.isPreview).toBe(false);
    expect(result.files[0].name).toBe("a.jpg");
    expect(result.files[0].blob.type).toBe("image/jpeg");
  });

  it("converts PNG to WebP (live)", async () => {
    const file = new File([makeTestPng()], "a.png", { type: "image/png" });
    const result = await convertImagesEngine({ files: [file], options: { to: "webp" } });

    expect(result.files[0].blob.type).toBe("image/webp");
  });

  it("marks HEIC input as preview and does not silently produce a wrong file", async () => {
    const file = new File([new Uint8Array([0, 1, 2])], "a.heic", { type: "image/heic" });
    const result = await convertImagesEngine({ files: [file], options: { to: "jpg" } });

    expect(result.isPreview).toBe(true);
    expect(result.summary).toMatch(/heic/i);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

```bash
npm run test --workspace=apps/web -- convertImages.test.ts
```

Expected: FAIL — `./convertImages` does not exist yet.

- [ ] **Step 7: Implement `engines/convertImages.ts`**

```ts
import type { Engine, EngineOutputFile } from "./types";

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

function isHeic(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || /\.heic$|\.heif$/i.test(file.name);
}

async function convertOne(file: File, to: string): Promise<EngineOutputFile> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable.");
  context.drawImage(bitmap, 0, 0);

  const mimeType = MIME_BY_FORMAT[to];
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), mimeType, 0.92);
  });

  const newName = file.name.replace(/\.[^.]+$/, "") + "." + to;
  return { name: newName, blob };
}

export const convertImagesEngine: Engine = async ({ files, options }) => {
  if (files.length === 0) throw new Error("Add at least one image.");

  const to = (options.to as string) ?? "png";
  if (!(to in MIME_BY_FORMAT)) throw new Error(`Unsupported target format: ${to}`);

  const heicFiles = files.filter(isHeic);
  const liveFiles = files.filter((f) => !isHeic(f));

  const converted = await Promise.all(liveFiles.map((f) => convertOne(f, to)));

  if (heicFiles.length > 0) {
    return {
      files: converted,
      summary:
        converted.length > 0
          ? `${converted.length} converted · ${heicFiles.length} HEIC file(s) need the full engine (preview) and were skipped`
          : `HEIC decoding is a preview feature — 0 of ${heicFiles.length} file(s) converted yet`,
      isPreview: true,
    };
  }

  return {
    files: converted,
    summary: `${converted.length} image(s) converted to ${to.toUpperCase()}`,
    isPreview: false,
  };
};
```

- [ ] **Step 8: Run to verify it passes**

```bash
npm run test --workspace=apps/web -- convertImages.test.ts
```

Expected: 3 passed.

- [ ] **Step 9: Write `CompressOptions.tsx` and `ConvertImagesOptions.tsx`**

```tsx
// apps/web/src/tools/options/CompressOptions.tsx
import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function CompressOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const dpi = (options.dpi as number) ?? 96;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold">Image DPI</span>
          <span className="font-mono text-[11.5px] text-muted">{dpi}</span>
        </div>
        <input
          type="range"
          min={72}
          max={300}
          disabled={disabled}
          value={dpi}
          onChange={(e) => onChange({ ...options, dpi: Number(e.target.value) })}
          className="ihp-slider"
        />
      </div>
      <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">
        Preview engine: pages are rasterized, so this trades away selectable
        text for now. The desktop app's Ghostscript engine keeps text
        selectable — see the Download page.
      </div>
    </div>
  );
}
```

```tsx
// apps/web/src/tools/options/ConvertImagesOptions.tsx
import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function ConvertImagesOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const to = (options.to as string) ?? "png";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold">Convert to</span>
      <div className="flex gap-1.5">
        {["png", "jpg", "webp"].map((f) => (
          <button
            key={f}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...options, to: f })}
            className={`rounded-lg border px-3 py-1.5 text-[12.5px] ${to === f ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] text-muted">
        HEIC input is accepted but shows a preview result until a decoder
        ships — see the tool card badge.
      </p>
    </div>
  );
}
```

- [ ] **Step 10: Register both, verify, commit**

In `registry.ts`:
- `compress`: `defaultOptions: { dpi: 96 }`, `engine: compressEngine`, `OptionsPanel: CompressOptions`.
- `convert-images`: `defaultOptions: { to: "png" }`, `engine: convertImagesEngine`, `OptionsPanel: ConvertImagesOptions`.

```bash
npm run dev --workspace=apps/web
```

Visit `/tools/compress` with a real PDF — confirm the result shows the
PREVIEW badge and a real size delta. Visit `/tools/convert-images` with a
real PNG/JPG — confirm live conversion; with a `.heic` file, confirm the
PREVIEW badge and explanatory summary rather than a broken/blank output.

```bash
git add apps/web/src/engines/compress.ts apps/web/src/engines/compress.test.ts apps/web/src/engines/convertImages.ts apps/web/src/engines/convertImages.test.ts apps/web/src/tools/options/CompressOptions.tsx apps/web/src/tools/options/ConvertImagesOptions.tsx apps/web/src/tools/registry.ts
git commit -m "$(cat <<'EOF'
Implement Compress (preview) and Convert images (live + HEIC preview) engines

Compress rasterizes+re-embeds per page, honestly labeled preview since
it doesn't preserve selectable text like the desktop Ghostscript
engine does. Convert images is live for PNG/JPG/WebP in all
directions; HEIC input is accepted but flagged preview, never silently
mishandled.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Replace the tool registry's placeholder icons with real per-tool SVG icons

**Files:**
- Create: `apps/web/src/tools/icons.tsx`
- Modify: `apps/web/src/tools/registry.ts` (swap every `Icon: IconStub` for its real icon)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere — purely visual polish, closing out the `IconStub` placeholder from Task 7.

- [ ] **Step 1: Write `tools/icons.tsx`**

Port the 7 tool icons directly from the design (each already has its own
`<svg>` markup and tint color variable in the source `.dc.html` — Compress,
Merge, Split, Organize, PDF-to-images, Images-to-PDF, Convert-images):

```tsx
import type { SVGProps } from "react";

export function CompressIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-d)" strokeWidth="1.5" {...props}>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.2" />
      <path d="M5.5 5.5L8 8M8 8V5.6M8 8H5.6M12.5 12.5L10 10M10 10v2.4M10 10h2.4" />
    </svg>
  );
}

export function MergeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-a)" strokeWidth="1.5" {...props}>
      <rect x="1.5" y="2" width="5.5" height="4.5" rx="1" />
      <rect x="1.5" y="11.5" width="5.5" height="4.5" rx="1" />
      <rect x="11" y="6.5" width="5.5" height="5" rx="1" />
      <path d="M7 4.3h2.2V9h1.8M7 13.7h2.2V9" />
    </svg>
  );
}

export function SplitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-b)" strokeWidth="1.5" {...props}>
      <rect x="2" y="2.5" width="5" height="13" rx="1" />
      <rect x="11" y="2.5" width="5" height="13" rx="1" />
      <path d="M9 1v3.5M9 7v3.5M9 13v3.5" />
    </svg>
  );
}

export function OrganizeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-c)" strokeWidth="1.5" {...props}>
      <rect x="2" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="10" width="6" height="6" rx="1" />
      <rect x="10" y="10" width="6" height="6" rx="1" />
      <path d="M10 5h6M13 2v6" />
    </svg>
  );
}

export function PdfToImagesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-e)" strokeWidth="1.5" {...props}>
      <rect x="2" y="2" width="8.5" height="11" rx="1" />
      <rect x="7.5" y="6.5" width="8.5" height="9.5" rx="1" />
      <circle cx="10.4" cy="9.6" r="1" />
    </svg>
  );
}

export function ImagesToPdfIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-f)" strokeWidth="1.5" {...props}>
      <rect x="2" y="3" width="8.5" height="8.5" rx="1" />
      <circle cx="4.8" cy="5.8" r="1" />
      <rect x="7.5" y="7" width="8.5" height="9" rx="1" />
    </svg>
  );
}

export function ConvertImagesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-g)" strokeWidth="1.5" {...props}>
      <rect x="2" y="2" width="7.5" height="7.5" rx="1" />
      <rect x="8.5" y="8.5" width="7.5" height="7.5" rx="1" />
      <path d="M11.6 5.6h3.4M14 3.2l1.4 2.4-1.4 2.4M6.4 12.4H3M5 14.8L3.6 12.4 5 10" />
    </svg>
  );
}
```

- [ ] **Step 2: Wire each icon into `registry.ts`**

Import all 7 from `./icons` and replace each tool's `Icon: IconStub` with its
matching icon (`compress` → `CompressIcon`, `merge` → `MergeIcon`, etc.). The
`IconStub` fallback and its definition can now be deleted from `registry.ts`.

- [ ] **Step 3: Verify and commit**

```bash
npm run typecheck --workspace=apps/web
npm run dev --workspace=apps/web
```

Visit `/tools` and confirm each card shows its distinct tinted icon, in both
themes.

```bash
git add apps/web/src/tools/icons.tsx apps/web/src/tools/registry.ts
git commit -m "$(cat <<'EOF'
Replace placeholder tool icons with the design's real per-tool icons

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: GitHub Pages deployment workflow

**Files:**
- Create: `.github/workflows/deploy-web.yml`

**Interfaces:**
- Consumes: `apps/web`'s `build` script (Task 2).
- Produces: nothing consumed by other tasks — this is the last task in the plan.

- [ ] **Step 1: Write `.github/workflows/deploy-web.yml`**

```yaml
name: Deploy web

on:
  push:
    branches: [main]
    paths:
      - "apps/web/**"
      - ".github/workflows/deploy-web.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: apps/web/package-lock.json
      - run: npm ci
      - name: Typecheck
        run: npm run typecheck
      - name: Test
        run: npm run test
      - name: Build
        run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify the build step locally (the part CI will run)**

```bash
npm run typecheck --workspace=apps/web
npm run test --workspace=apps/web
npm run build --workspace=apps/web
```

Expected: all three succeed; `apps/web/dist` is created with `index.html`
and hashed asset files.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-web.yml
git commit -m "$(cat <<'EOF'
Add GitHub Pages deployment workflow for apps/web

Builds and deploys on push to main when apps/web changes, gated on
typecheck + test + build all passing first.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Tell the user what remains outside this plan**

This workflow needs GitHub Pages enabled once, by a human with repo admin
access: repo Settings → Pages → Build and deployment → Source: "GitHub
Actions". This plan does not and cannot do that step — flag it back to the
user rather than attempting it.

---

## Post-plan checklist (manual, not a task)

- [ ] Confirm `apps/desktop`'s CI (frontend/engine/rust jobs) is still green
  after Task 1's restructure, on an actual pushed branch/PR — the plan
  verifies local build/typecheck, but path-filtered CI triggers only run in
  GitHub's environment.
- [ ] Enable GitHub Pages in repo settings (Task 18, Step 4).
- [ ] Update `Download.tsx`'s GitHub Releases link once `apps/desktop`'s
  installer CI actually publishes a release artifact.
- [ ] File follow-up specs for the explicitly out-of-scope items: a
  WASM/Ghostscript-quality Compress engine, real HEIC decoding, and a
  richer drag-and-drop Organize UI (the current list-based editor is
  functional but minimal).
