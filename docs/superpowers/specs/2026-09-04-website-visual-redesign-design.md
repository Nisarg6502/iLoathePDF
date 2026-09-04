# iLoathePDF Web: Visual Redesign

## Context

`apps/web` is the real, working browser version of iLoathePDF (React + Tailwind v4 + `motion`, deployed via `.github/workflows/deploy-web.yml`). Current feedback on the site:

1. The nav has a redundant "Compress" link sitting next to "Tools" with no equivalent for the other six tools — an IA mistake, not intentional emphasis.
2. Light mode's palette reads as generic — flat surfaces, faint borders/shadows, insufficient depth.
3. The landing page has no motion or "wow" moment — the hero mockup is a static screenshot, sections render instantly with no scroll choreography.
4. The whole site looks visually flat/uniform — a small set of `--tint-a` through `--tint-g` colors already exist ([icons.tsx](../../../apps/web/src/tools/icons.tsx)) but are only applied to 18px icon glyphs, nowhere else.
5. The theme toggle ([ThemeToggle.tsx](../../../apps/web/src/components/layout/ThemeToggle.tsx)) is a plain rotating-icon button — functional but forgettable.

Out of scope for this spec: the Download page's actual distribution mechanism (no installer/release exists yet — separate follow-up, a product/infra decision not a design one).

## Goals

- Fix the nav IA mistake.
- Give light mode real depth and a more distinctive accent so it stops reading as a generic template.
- Give each tool a visible color identity that carries from its icon through its card and its detail page, without diluting the single global brand accent used for site-wide chrome.
- Make the landing page feel like a live product demo, not a brochure: an animated hero mockup plus scroll-triggered reveals.
- Replace the theme toggle with something more tactile and intuitive than a rotating circle.

## Design

### 1. Nav fix

[SiteHeader.tsx](../../../apps/web/src/components/layout/SiteHeader.tsx): remove the hardcoded `{ to: "/tools/compress", label: "Compress" }` entry from `NAV_LINKS`. Resulting nav: Home / Tools / How it works / Privacy, with the theme toggle and "Desktop app" CTA staying pinned right, unchanged in position.

### 2. Color system

All changes live in [index.css](../../../apps/web/src/index.css) `:root` and `:root[data-theme="dark"]` blocks — no component needs to hardcode a new color, everything consumes CSS variables already wired through `@theme inline`.

**Light mode (`:root`)**:
- Widen the separation between `--bg`, `--surface`, `--surface-2`, `--surface-3` — currently they sit within ~0.03 oklch lightness of each other, which is why panels blend together. Target roughly double that spread while staying in the warm-paper hue family (hue ~76, low chroma) so the palette doesn't shift identity, just gains contrast.
- Deepen `--accent` chroma/lightness slightly so it reads less pastel; add `--accent-deep` (a darker, more saturated shade) for active/pressed states on primary buttons — replaces relying solely on `--accent-hi` (a *lighter* shade) for interaction feedback, which currently makes hover and press look similar.
- Increase `--border-hi` contrast and strengthen `--shadow-card`'s opacity/spread slightly so cards visibly lift off the page.

**Dark mode (`:root[data-theme="dark"]`)**: mirror the same relative adjustments (wider surface separation, `--accent-deep` addition) for consistency — it's already the stronger of the two, so changes here are smaller.

**Tint colors** (`--tint-a` through `--tint-g`): values unchanged, only their usage expands (see §3).

### 3. Per-tool color identity

Each tool already has an assigned tint color via its icon component. Extend that same color to:

- **Tool cards** (Home's "Seven tools, one page each" quick-links in [Home.tsx](../../../apps/web/src/pages/Home.tsx), and the grid in [ToolsIndex.tsx](../../../apps/web/src/pages/ToolsIndex.tsx)): add a subtle tinted top border or corner wash using the tool's tint variable; on hover, the border color transitions to the tool's tint instead of the generic `--accent`/`--border-hi`.
- **Tool detail page** ([ToolDetail.tsx](../../../apps/web/src/pages/ToolDetail.tsx)): the icon badge's background tints toward the tool's color (currently plain `bg-surface`).
- **Primary action button** inside each tool's flow (in [ToolPage.tsx](../../../apps/web/src/components/ToolPage.tsx) / the per-tool `OptionsPanel`s): background uses the tool's tint instead of the global `--accent`.

This requires each tool's config to expose its tint variable name (or the tint is derived by index/slug — implementation detail for the plan) so cards, detail pages, and buttons can reference it consistently, rather than each icon file hardcoding its own `var(--tint-x)` independently as today.

The global `--accent` remains reserved for site-wide chrome that isn't tool-specific: nav elements, the "Desktop app" CTA, the Home hero's primary "Open the tools" button.

### 4. Theme toggle

Replace [ThemeToggle.tsx](../../../apps/web/src/components/layout/ThemeToggle.tsx)'s rotating-circle button with a sliding pill switch:

- Track: ~52×28px rounded pill. Sun glyph anchored on the light side, moon glyph anchored on the dark side, both always rendered in the track (inactive side dimmed via opacity).
- Knob: circular, slides between the two ends on toggle using `--ease-out-strong`. Scales down slightly (`active:scale-[0.94]`, matching existing press-feedback convention elsewhere in the app) on press.
- Track background itself transitions between a light sky tone and a dark navy tone (not just a neutral gray), so the toggle's own color communicates the mode, not just the icon position.
- Preserve existing behavior: `getInitialTheme`/`applyTheme`/`persistTheme` from [theme.ts](../../../apps/web/src/lib/theme.ts) are unchanged; this is a presentation-only swap.

### 5. Landing page motion

Uses the `motion` library (already a dependency, already used in [ToolPage.tsx](../../../apps/web/src/components/ToolPage.tsx)).

**Hero mockup** ([Home.tsx](../../../apps/web/src/pages/Home.tsx) lines ~54-94, the fake browser-window compress result): becomes a scroll-triggered mini-demo, playing once when it enters the viewport (`whileInView`, not an infinite loop — avoids a permanently-looping distraction):
1. Result badge starts in a pulsing "PROCESSING" state.
2. A progress bar fills 0→100%.
3. The struck-through "3.14 MB" crossed-out number's replacement ticks down digit-by-digit to "812 KB" as the bar completes.
4. Badge flips to "DONE" with a small checkmark pop-in.

**Scroll reveals**: the "Why nothing uploads" three-card row and the tool quick-links grid switch from static render to a staggered fade + translateY-in via `motion`'s `whileInView`, ~150-200ms stagger between siblings, small travel distance (matching the existing `page-in` keyframe's 6px scale, kept subtle rather than dramatic).

**Tool quick-links** on Home pick up the per-tool tint treatment from §3.

All new motion respects the existing `prefers-reduced-motion: reduce` handling in [index.css](../../../apps/web/src/index.css) (lines 209-214) — `motion`'s components need explicit reduced-motion handling since that CSS block only catches CSS animations/transitions, not JS-driven `motion` animations, so this must be wired via `motion`'s `useReducedMotion` hook or equivalent.

## Testing

No existing test coverage targets visual/CSS output. [ToolPage.test.tsx](../../../apps/web/src/components/ToolPage.test.tsx) covers tool logic, not presentation — out of scope to extend for this change. Verification is manual: run the dev server, check both themes, check the nav, check tool cards/pages for tint colors, check hero animation plays once on scroll and toggle animates correctly, check reduced-motion is respected.
