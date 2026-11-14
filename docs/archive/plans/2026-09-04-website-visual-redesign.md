# Website Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give iLoathePDF's web app (`apps/web`) a distinct visual identity: fix the nav's redundant Compress link, deepen the light-mode color system, give each tool its own color identity across cards/pages/buttons, replace the theme toggle with a sliding sun/moon switch, and add motion to the landing page (an animated hero demo plus scroll reveals).

**Architecture:** All color changes flow through the existing CSS-variable system in `src/index.css` (`:root` / `:root[data-theme="dark"]` / `@theme inline`) — no component hardcodes a color. Per-tool identity is added as a new `tint` field on `ToolConfig`, read through a small `src/tools/tint.ts` utility, so every consumer (cards, badges, buttons) derives its color the same way. Motion uses the `motion` library already in the project (imported as `motion/react`, already used in `ToolPage.tsx`).

**Tech Stack:** React 19, Tailwind CSS v4 (`@theme`/`@theme inline`), `motion` (framer-motion successor), Vitest + `@testing-library/react`, TypeScript.

## Global Constraints

- No new npm dependencies — `motion` is already installed and used elsewhere ([ToolPage.tsx](../../../apps/web/src/components/ToolPage.tsx)).
- All colors are CSS custom properties defined in [index.css](../../../apps/web/src/index.css); components reference them via `var(--x)`, never hardcode hex/oklch values inline except where noted (the theme toggle's sun/moon glyph colors and the toggle-track gradients, which represent fixed sun/moon iconography rather than page-theme colors).
- Per-tool tint keys must match the existing hardcoded assignments in [icons.tsx](../../../apps/web/src/tools/icons.tsx): merge=a, split=b, organize=c, compress=d, pdf-to-images=e, images-to-pdf=f, convert-images=g. Changing this mapping would desync icon color from card/button color.
- Any new JS-driven (`motion`-based) animation must respect `prefers-reduced-motion` via `useReducedMotion()` from `motion/react` — the existing CSS media query in `index.css` (lines 209-214) only zeroes CSS transitions/animations, not `motion`'s JS-driven ones.
- Test with Vitest (`npm run test` in `apps/web`) and typecheck with `npm run typecheck`. Both must pass before each commit.
- Follow existing code conventions: Tailwind utility classes for static styling, inline `style` only for values that must be computed at runtime (per-tool colors).

---

### Task 1: Per-tool tint identity foundation

**Files:**
- Create: `apps/web/src/tools/tint.ts`
- Create: `apps/web/src/tools/tint.test.ts`
- Modify: `apps/web/src/tools/ToolConfig.ts`
- Modify: `apps/web/src/tools/registry.tsx`
- Modify: `apps/web/src/components/ToolPage.test.tsx`

**Interfaces:**
- Produces: `TintKey` type (`"a" | "b" | "c" | "d" | "e" | "f" | "g"`), `tintColor(tint: TintKey): string`, `tintWash(tint: TintKey, percent?: number): string` — all later tasks import these from `@/tools/tint`.
- Produces: `ToolConfig.tint: TintKey` — every entry in `TOOLS` now carries a tint; later tasks read `tool.tint`.

- [ ] **Step 1: Write the failing test for the tint utility**

Create `apps/web/src/tools/tint.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tintColor, tintWash } from "./tint";

describe("tintColor", () => {
  it("returns the CSS variable reference for a tint key", () => {
    expect(tintColor("a")).toBe("var(--tint-a)");
    expect(tintColor("g")).toBe("var(--tint-g)");
  });
});

describe("tintWash", () => {
  it("defaults to a 10% mix with the surface color", () => {
    expect(tintWash("d")).toBe("color-mix(in oklch, var(--tint-d) 10%, var(--surface))");
  });

  it("accepts a custom percentage", () => {
    expect(tintWash("b", 25)).toBe("color-mix(in oklch, var(--tint-b) 25%, var(--surface))");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/tools/tint.test.ts`
Expected: FAIL — `Cannot find module './tint'`

- [ ] **Step 3: Implement the tint utility**

Create `apps/web/src/tools/tint.ts`:

```ts
export type TintKey = "a" | "b" | "c" | "d" | "e" | "f" | "g";

export function tintColor(tint: TintKey): string {
  return `var(--tint-${tint})`;
}

export function tintWash(tint: TintKey, percent: number = 10): string {
  return `color-mix(in oklch, var(--tint-${tint}) ${percent}%, var(--surface))`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/tools/tint.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the `tint` field to `ToolConfig`**

In `apps/web/src/tools/ToolConfig.ts`, add the import and field:

```ts
import type { ComponentType, SVGProps } from "react";
import type { Engine } from "@/engines/types";
import type { TintKey } from "./tint";

export interface OptionsPanelProps<TOptions = Record<string, unknown>> {
  options: TOptions;
  onChange: (options: TOptions) => void;
  disabled: boolean;
  /** The currently selected input file(s), when available. Optional — most panels can ignore it. */
  files?: File[];
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
  tint: TintKey;
}
```

- [ ] **Step 6: Assign a tint to each tool in the registry**

In `apps/web/src/tools/registry.tsx`, add `tint` to each `TOOLS` entry, matching `icons.tsx`'s existing color assignment:

```tsx
export const TOOLS: ToolConfig[] = [
  { slug: "merge", name: "Merge PDF", description: "Combine PDFs in the order you choose, with page ranges per file.", category: "pdf", Icon: MergeIcon, accept: [".pdf"], multiple: true, defaultOptions: {}, OptionsPanel: MergeOptions, engine: mergeEngine, status: "live", tint: "a" },
  { slug: "split", name: "Split PDF", description: "Cut into ranges, chop every N pages, extract or delete a selection.", category: "pdf", Icon: SplitIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "ranges", ranges: "", n: 2 }, OptionsPanel: SplitOptions, engine: splitEngine, status: "live", tint: "b" },
  { slug: "organize", name: "Organize pages", description: "Reorder, rotate and drop pages on a page canvas.", category: "pdf", Icon: OrganizeIcon, accept: [".pdf"], multiple: false, defaultOptions: { order: [], rotate: {}, remove: [] }, OptionsPanel: OrganizeOptions, engine: organizeEngine, status: "live", tint: "c" },
  { slug: "compress", name: "Compress PDF", description: "Shrink for email, with the quality trade-off shown before you commit.", category: "pdf", Icon: CompressIcon, accept: [".pdf"], multiple: false, defaultOptions: { dpi: 96 }, OptionsPanel: CompressOptions, engine: compressEngine, status: "preview", tint: "d" },
  { slug: "pdf-to-images", name: "PDF to images", description: "Render pages to PNG or JPG at the DPI you pick.", category: "pdf", Icon: PdfToImagesIcon, accept: [".pdf"], multiple: false, defaultOptions: { dpi: 144, format: "png" }, OptionsPanel: PdfToImagesOptions, engine: pdfToImagesEngine, status: "live", tint: "e" },
  { slug: "images-to-pdf", name: "Images to PDF", description: "Scans and photos into one PDF, one image per page.", category: "image", Icon: ImagesToPdfIcon, accept: [".png", ".jpg", ".jpeg"], multiple: true, defaultOptions: { margin: 24 }, OptionsPanel: ImagesToPdfOptions, engine: imagesToPdfEngine, status: "live", tint: "f" },
  { slug: "convert-images", name: "Convert images", description: "PNG, JPG and WebP any direction — and HEIC off an iPhone.", category: "image", Icon: ConvertImagesIcon, accept: [".png", ".jpg", ".jpeg", ".webp", ".heic"], multiple: true, defaultOptions: { to: "png" }, OptionsPanel: ConvertImagesOptions, engine: convertImagesEngine, status: "preview", tint: "g" },
];
```

- [ ] **Step 7: Fix the now-broken `ToolPage.test.tsx` fixture**

`tint` is now a required field, so the `makeTool()` helper in `apps/web/src/components/ToolPage.test.tsx` fails to typecheck. In that file, add `tint: "a",` to the object returned by `makeTool` (after `status: "live",`):

```ts
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
    tint: "a",
    ...overrides,
  };
}
```

- [ ] **Step 8: Typecheck and run the full test suite**

Run: `cd apps/web && npm run typecheck && npm run test`
Expected: both succeed, no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/tools/tint.ts apps/web/src/tools/tint.test.ts apps/web/src/tools/ToolConfig.ts apps/web/src/tools/registry.tsx apps/web/src/components/ToolPage.test.tsx
git commit -m "$(cat <<'EOF'
Add per-tool tint identity foundation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Deepen the color system

**Files:**
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Produces: `--accent-deep` / `--color-accent-deep` (new CSS var, for pressed/active states), `--toggle-track-light` / `--toggle-track-dark` (new CSS vars, consumed by Task 4's `ThemeToggle`).
- Consumes: nothing new.

- [ ] **Step 1: Replace the `:root` color block**

In `apps/web/src/index.css`, replace the `:root { ... }` block (lines 52-82) with:

```css
:root {
  --bg: oklch(0.955 0.006 76);
  --surface: #ffffff;
  --surface-2: oklch(0.945 0.010 76);
  --surface-3: oklch(0.905 0.014 76);
  --border: oklch(0.87 0.012 76);
  --border-hi: oklch(0.78 0.016 76);
  --text: oklch(0.215 0.014 68);
  --muted: oklch(0.505 0.012 72);
  --faint: oklch(0.645 0.010 72);
  --accent: oklch(0.74 0.175 76);
  --accent-hi: oklch(0.68 0.178 70);
  --accent-deep: oklch(0.52 0.15 66);
  --accent-soft: oklch(0.95 0.06 82);
  --on-accent: oklch(0.2 0.05 66);
  --ok: oklch(0.545 0.115 162);
  --ok-soft: oklch(0.958 0.032 162);
  --danger: oklch(0.545 0.175 26);
  --danger-soft: oklch(0.958 0.030 26);
  --paper: #ffffff;
  --paper-line: oklch(0.902 0.006 76);
  --shadow-card: 0 1px 3px oklch(0.25 0.02 70 / 0.10), 0 8px 20px -6px oklch(0.25 0.02 70 / 0.16);
  --tint-a: oklch(0.575 0.145 265);
  --tint-b: oklch(0.575 0.145 310);
  --tint-c: oklch(0.575 0.145 200);
  --tint-d: oklch(0.575 0.145 162);
  --tint-e: oklch(0.575 0.145 78);
  --tint-f: oklch(0.575 0.145 28);
  --tint-g: oklch(0.575 0.145 340);
  --toggle-track-light: linear-gradient(135deg, oklch(0.86 0.06 230), oklch(0.78 0.08 242));
  --toggle-track-dark: linear-gradient(135deg, oklch(0.30 0.06 264), oklch(0.16 0.05 270));
  --ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);
}
```

- [ ] **Step 2: Replace the `:root[data-theme="dark"]` color block**

Replace the dark block (lines 84-112) with:

```css
:root[data-theme="dark"] {
  --bg: oklch(0.150 0.007 68);
  --surface: oklch(0.198 0.009 68);
  --surface-2: oklch(0.252 0.011 70);
  --surface-3: oklch(0.310 0.013 70);
  --border: oklch(0.285 0.011 70);
  --border-hi: oklch(0.42 0.014 72);
  --text: oklch(0.962 0.005 80);
  --muted: oklch(0.715 0.010 76);
  --faint: oklch(0.552 0.010 74);
  --accent: oklch(0.8 0.152 80);
  --accent-hi: oklch(0.87 0.14 84);
  --accent-deep: oklch(0.62 0.145 78);
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
```

- [ ] **Step 3: Register the new tokens in `@theme inline`**

In the `@theme inline { ... }` block (lines 114-134), add one line after `--color-accent-hi: var(--accent-hi);`:

```css
  --color-accent-deep: var(--accent-deep);
```

- [ ] **Step 4: Typecheck and run the full test suite**

Run: `cd apps/web && npm run typecheck && npm run test`
Expected: both succeed — this is a CSS-only change, no test assertions target it, but the full suite must still pass (nothing should reference old color values in a way that breaks).

- [ ] **Step 5: Manual visual check**

Run: `cd apps/web && npm run dev`
Open the site, toggle light/dark, confirm cards/panels now show visible separation from the page background and hover borders read more distinctly.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/index.css
git commit -m "$(cat <<'EOF'
Deepen light and dark mode color depth

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Fix the nav — remove the redundant Compress link

**Files:**
- Create: `apps/web/src/components/layout/SiteHeader.test.tsx`
- Modify: `apps/web/src/components/layout/SiteHeader.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (no other task depends on this).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/layout/SiteHeader.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SiteHeader } from "./SiteHeader";

describe("SiteHeader", () => {
  it("renders the primary nav without a redundant Compress link", () => {
    render(
      <MemoryRouter>
        <SiteHeader />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tools" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How it works" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Compress" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/layout/SiteHeader.test.tsx`
Expected: FAIL — a "Compress" link is found.

- [ ] **Step 3: Remove the Compress entry**

In `apps/web/src/components/layout/SiteHeader.tsx`, change `NAV_LINKS`:

```tsx
const NAV_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/tools", label: "Tools" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/privacy", label: "Privacy" },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/layout/SiteHeader.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/SiteHeader.tsx apps/web/src/components/layout/SiteHeader.test.tsx
git commit -m "$(cat <<'EOF'
Remove redundant Compress link from primary nav

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Redesign the theme toggle as a sliding switch

**Files:**
- Create: `apps/web/src/components/layout/ThemeToggle.test.tsx`
- Modify: `apps/web/src/components/layout/ThemeToggle.tsx`

**Interfaces:**
- Consumes: `getInitialTheme`, `applyTheme`, `persistTheme`, `Theme` from `@/lib/theme` (unchanged signatures).
- Consumes: `--toggle-track-light`, `--toggle-track-dark` from Task 2.
- Produces: nothing new (no other task depends on this component's internals).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/layout/ThemeToggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";
import { THEME_KEY } from "@/lib/theme";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("starts unchecked in light mode and switches to dark on click", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: /toggle color theme/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/layout/ThemeToggle.test.tsx`
Expected: FAIL — no element with `role="switch"` exists yet (current implementation is a plain button with no `role`/`aria-checked`).

- [ ] **Step 3: Implement the sliding switch**

Replace the full contents of `apps/web/src/components/layout/ThemeToggle.tsx`:

```tsx
import { useEffect, useState } from "react";
import { getInitialTheme, applyTheme, persistTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle color theme"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      className="relative flex h-7 w-13 flex-none items-center rounded-full border border-border-hi p-0.5 transition-[background] duration-300"
      style={{ background: isDark ? "var(--toggle-track-dark)" : "var(--toggle-track-light)" }}
    >
      {/* Sun/moon glyph colors are fixed iconography, not page-theme colors — they represent the switch's own two states regardless of the current site theme. */}
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute left-1.5 transition-opacity duration-200"
        style={{ opacity: isDark ? 0.35 : 1 }}
      >
        <circle cx="8" cy="8" r="3.4" fill="#f6c453" />
        <path
          d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1"
          stroke="#f6c453"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-1.5 transition-opacity duration-200"
        style={{ opacity: isDark ? 1 : 0.35 }}
      >
        <path d="M13.5 9.5A5.8 5.8 0 0 1 6.5 2.5a5.8 5.8 0 1 0 7 7z" fill="#cbd5f5" />
      </svg>
      <span
        className="relative z-10 size-6 flex-none rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-[var(--ease-out-strong)] active:scale-90"
        style={{ transform: isDark ? "translateX(24px)" : "translateX(0px)" }}
      />
    </button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/layout/ThemeToggle.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: succeeds.

- [ ] **Step 6: Manual visual check**

Run: `cd apps/web && npm run dev`
Click the toggle in the header, confirm the knob slides, the track gradient changes, and both sun/moon glyphs remain visible (one dimmed) in both states.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/layout/ThemeToggle.tsx apps/web/src/components/layout/ThemeToggle.test.tsx
git commit -m "$(cat <<'EOF'
Redesign theme toggle as a sliding sun/moon switch

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Tinted tool cards on the Tools index

**Files:**
- Modify: `apps/web/src/pages/ToolsIndex.tsx`

**Interfaces:**
- Consumes: `tool.tint` (Task 1), `tintColor`, `tintWash` from `@/tools/tint` (Task 1).

- [ ] **Step 1: Update the card markup**

In `apps/web/src/pages/ToolsIndex.tsx`, add the import and change the card `Link`:

```tsx
import { Link } from "react-router-dom";
import { TOOLS } from "@/tools/registry";
import { PreviewBadge } from "@/components/PreviewBadge";
import { tintColor, tintWash } from "@/tools/tint";

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
                className="rounded-[14px] border border-border p-5 transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
                style={{ background: tintWash(tool.tint, 5) }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = tintColor(tool.tint);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "";
                }}
              >
                <div className="flex items-start justify-between">
                  <tool.Icon className="size-5.5" />
                  {tool.status === "preview" && <PreviewBadge />}
                </div>
                <div className="mt-3 text-[15px] font-semibold">{tool.name}</div>
                <div className="mt-1 text-[13px] leading-relaxed text-muted">{tool.description}</div>
                <div className="mt-3 font-mono text-[11px]" style={{ color: tintColor(tool.tint) }}>
                  Open →
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and run the full test suite**

Run: `cd apps/web && npm run typecheck && npm run test`
Expected: both succeed (no test targets this page's markup directly; verify nothing else broke).

- [ ] **Step 3: Manual visual check**

Run: `cd apps/web && npm run dev`, open `/tools`, confirm each card shows a faint tint wash and hovers to its own tint border color (merge=blue-ish, split=magenta-ish, etc. per the hue values in `--tint-a..g`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/ToolsIndex.tsx
git commit -m "$(cat <<'EOF'
Give each tool card its own tint color on the Tools index

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Tinted tool detail header and primary action button

**Files:**
- Modify: `apps/web/src/pages/ToolDetail.tsx`
- Modify: `apps/web/src/components/ToolPage.tsx`

**Interfaces:**
- Consumes: `tool.tint` (Task 1), `tintColor`, `tintWash` from `@/tools/tint` (Task 1).

- [ ] **Step 1: Tint the icon badge in `ToolDetail.tsx`**

Replace the icon badge `<span>` in `apps/web/src/pages/ToolDetail.tsx`:

```tsx
import { useParams } from "react-router-dom";
import { getTool } from "@/tools/registry";
import { ToolPage } from "@/components/ToolPage";
import { PreviewBadge } from "@/components/PreviewBadge";
import { tintWash } from "@/tools/tint";

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
        <span
          className="grid size-9.5 flex-none place-items-center rounded-[11px] border border-border"
          style={{ background: tintWash(tool.tint, 14) }}
        >
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

- [ ] **Step 2: Tint the primary action button in `ToolPage.tsx`**

In `apps/web/src/components/ToolPage.tsx`, add the import at the top:

```tsx
import { tintColor } from "@/tools/tint";
```

Then replace the `run` button (around line 152-165):

```tsx
            <button
              type="button"
              onClick={run}
              disabled={step === "empty" || step === "running"}
              style={step === "empty" || step === "running" ? undefined : { background: tintColor(tool.tint) }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-accent text-sm font-semibold text-on-accent transition-transform duration-100 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint active:enabled:scale-[0.97]"
            >
              {step === "running" && (
                <svg className="spinner size-3.5" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                  <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              {step === "running" ? "Working…" : step === "done" ? "Run again" : "Run"}
            </button>
```

- [ ] **Step 3: Typecheck and run the full test suite**

Run: `cd apps/web && npm run typecheck && npm run test`
Expected: both succeed — `ToolPage.test.tsx` still passes since it doesn't assert button color, only behavior.

- [ ] **Step 4: Manual visual check**

Run: `cd apps/web && npm run dev`, open `/tools/merge`, drop a file, confirm the Run button turns the merge tool's tint color once a file is loaded, and `/tools/compress`'s icon badge shows a tinted background.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/ToolDetail.tsx apps/web/src/components/ToolPage.tsx
git commit -m "$(cat <<'EOF'
Carry tool tint color into detail page header and run button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Animated hero demo on the landing page

**Files:**
- Create: `apps/web/src/components/HeroDemo.tsx`
- Modify: `apps/web/src/pages/Home.tsx`

**Interfaces:**
- Produces: `HeroDemo` component (no props) — rendered by `Home.tsx` in place of the static mockup.

- [ ] **Step 1: Create the `HeroDemo` component**

Create `apps/web/src/components/HeroDemo.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const START_KB = 3140; // matches the displayed "3.14 MB"
const END_KB = 812;
const DURATION_MS = 1400;

function formatSize(kb: number): string {
  return kb >= 1000 ? `${(kb / 1000).toFixed(2)} MB` : `${kb} KB`;
}

export function HeroDemo() {
  const [played, setPlayed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sizeKb, setSizeKb] = useState(START_KB);
  const rafRef = useRef<number>();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!played) return;

    if (prefersReducedMotion) {
      setProgress(100);
      setSizeKb(END_KB);
      return;
    }

    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const pct = Math.min(1, elapsed / DURATION_MS);
      setProgress(pct * 100);
      setSizeKb(Math.round(START_KB - (START_KB - END_KB) * pct));
      if (pct < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [played, prefersReducedMotion]);

  const done = played && progress >= 100;
  const label = !played ? "READY" : done ? "DONE" : "PROCESSING";

  return (
    <motion.div
      onViewportEnter={() => setPlayed(true)}
      viewport={{ once: true, amount: 0.6 }}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]"
    >
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
          <span className="flex items-center gap-1.5">
            {done && (
              <motion.svg
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="var(--ok)"
                strokeWidth="2"
              >
                <path d="M2.5 8.4l3.2 3.2L13.5 4" strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
            )}
            <span className={`font-mono text-[10.5px] ${done ? "text-ok" : "text-accent"}`}>{label}</span>
          </span>
        </div>
        <div className="mt-4.5 rounded-xl border border-border bg-surface-2 p-5">
          <div className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">RESULT</div>
          <div className="mt-3 flex items-baseline gap-3 font-mono">
            <span className="text-[22px] text-faint line-through">3.14 MB</span>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--faint)" strokeWidth="1.5">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
            <span className="text-[38px] font-bold tracking-[-0.03em]">{formatSize(sizeKb)}</span>
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-3">
            <span className="bg-ok" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
            <span>{done ? "−75% smaller" : played ? "compressing…" : "waiting to start"}</span>
            <span>quality: balanced</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Swap the static mockup for `HeroDemo` in `Home.tsx`**

In `apps/web/src/pages/Home.tsx`, add the import:

```tsx
import { HeroDemo } from "@/components/HeroDemo";
```

Replace the entire static mockup block (the `<div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">...</div>` spanning lines 54-94) with:

```tsx
        <HeroDemo />
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: succeeds.

- [ ] **Step 4: Manual visual check**

Run: `cd apps/web && npm run dev`, open `/`, confirm the hero mock plays through PROCESSING → progress bar fill → size countdown → DONE with checkmark once, then stays at DONE on reload/re-scroll (does not loop). With OS-level "reduce motion" enabled, confirm it jumps straight to the DONE state without animating.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/HeroDemo.tsx apps/web/src/pages/Home.tsx
git commit -m "$(cat <<'EOF'
Animate the landing page hero into a live compress demo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Scroll reveals and tinted quick-links on the landing page

**Files:**
- Modify: `apps/web/src/pages/Home.tsx`

**Interfaces:**
- Consumes: `TOOLS` from `@/tools/registry`, `tintColor`/`tintWash` from `@/tools/tint` (Task 1).

- [ ] **Step 1: Pull the quick-links from the tool registry and add scroll reveals**

In `apps/web/src/pages/Home.tsx`, add imports:

```tsx
import { motion } from "motion/react";
import { TOOLS } from "@/tools/registry";
import { tintColor, tintWash } from "@/tools/tint";
```

Replace the "Seven tools, one page each" grid block (the hardcoded 4-item array and its `.map`, lines 103-119):

```tsx
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {["compress", "merge", "split", "organize"]
              .map((slug) => TOOLS.find((t) => t.slug === slug))
              .filter((t): t is (typeof TOOLS)[number] => Boolean(t))
              .map((tool, i) => (
                <motion.div
                  key={tool.slug}
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  whileInView={{ opacity: 1, transform: "translateY(0px)" }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.08, ease: [0.23, 1, 0.32, 1] }}
                >
                  <Link
                    to={`/tools/${tool.slug}`}
                    className="block rounded-[13px] border border-border p-4.5 transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
                    style={{ background: tintWash(tool.tint, 5) }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = tintColor(tool.tint);
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "";
                    }}
                  >
                    <tool.Icon className="size-5" />
                    <div className="mt-2.5 text-sm font-semibold">{tool.name}</div>
                    <div className="mt-1 text-[12.5px] leading-snug text-muted">{tool.description}</div>
                  </Link>
                </motion.div>
              ))}
          </div>
```

- [ ] **Step 2: Add scroll reveal to the "Why nothing uploads" cards**

Replace the three-card `.map` in the same file (the `{ n, title, body }` array's `.map`, lines 131-141):

```tsx
        <div className="mt-7 grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {[
            { n: "01", title: "Nothing loads except the page", body: "The tool code arrives with the page like any other script and runs in this tab. That is the last request the site makes." },
            { n: "02", title: "Your file stays put", body: "Files are read through the File API into memory the tab owns. No fetch, no form post, no signed URL." },
            { n: "03", title: "Result is a local save", body: "Output is a blob your browser writes to disk. Close the tab and every trace is gone." },
          ].map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, transform: "translateY(10px)" }}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="rounded-[13px] border border-border bg-surface p-5.5"
            >
              <span className="font-mono text-[11px] font-bold text-accent">{s.n}</span>
              <div className="mt-2.5 text-[15px] font-semibold">{s.title}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.body}</p>
            </motion.div>
          ))}
        </div>
```

- [ ] **Step 3: Typecheck and run the full test suite**

Run: `cd apps/web && npm run typecheck && npm run test`
Expected: both succeed.

- [ ] **Step 4: Manual visual check**

Run: `cd apps/web && npm run dev`, open `/`, scroll down, confirm the quick-link cards and the three "why" cards fade/slide in with a stagger as they enter view (once, not re-triggering on scroll-back), and quick-link cards show their tool's tint on hover.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/Home.tsx
git commit -m "$(cat <<'EOF'
Add scroll reveals and tinted quick-links to the landing page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
