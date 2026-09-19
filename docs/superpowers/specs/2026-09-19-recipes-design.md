# Recipes — Design Spec

## Overview

A new feature, **Recipes**: a small, fixed set of hand-picked multi-step tool chains. Not a general pipeline builder — no arbitrary "chain any tool into any tool," no per-step configuration UI, no saving custom chains. Drop a file, pick a recipe, get the final result.

This follows research done earlier in this project's backlog: an arbitrary chaining engine isn't realistic given how much this app's tools vary in input/output cardinality and interaction model, but a curated set of preset recipes reusing the existing per-tool contracts (desktop: real files on disk; web: the `Engine` type's `File[] → Blob[]` contract) needs no changes to any existing op or engine.

## Scope boundary: which tools can be a recipe step

A recipe step must be a "plain" tool — the generic drop-zone → options → run flow, runnable end-to-end using its own existing default option values, with **zero required user input** beyond the file itself. This single rule determines the whole v1 recipe list, rather than an arbitrary pick:

- **Excluded entirely: Sign, Redact, Organize.** Each needs live canvas interaction (drawing a box, placing a signature, reordering pages) — something an automated, unattended sequence can't accommodate. A recipe step either runs to completion on its own or it can't be a step.
- **Excluded from v1: Watermark, Protect & Unlock.** Both are otherwise "plain" generic-flow tools, but neither has a default that produces a useful result with no input — Watermark's default text is empty (nothing to stamp), Protect always needs a real password. Running either with nothing supplied isn't a valid step. (A later iteration could add a small "provide the one required field" form for recipes that need it — explicitly out of scope for v1, which stays zero-input.)
- **Eligible**: Merge, Split, Compress, PDF to Images, Images to PDF, Convert Images, OCR, PDF to Excel — every one of these has a sensible, real default (e.g. desktop Compress defaults to `level: "balanced"`, web Compress to `dpi: 96`; OCR and PDF to Excel have no options at all) and runs to a genuinely useful result with nothing but the input file.

## The four v1 recipes

| Recipe | Steps | What it's for |
| --- | --- | --- |
| Merge → Compress | Merge PDF, Compress PDF | Combine PDFs, then shrink the result for email |
| Scan to Searchable PDF | Images to PDF, OCR, Compress PDF | Turn photographed pages into one small, searchable PDF |
| Flatten PDF | PDF to Images, Images to PDF | Rasterize every page and rebuild the PDF from the images, stripping anything but the visual page content |
| Merge → Extract Tables *(desktop only)* | Merge PDF, PDF to Excel | Combine PDF reports, then extract every table into one spreadsheet |

The fourth recipe is desktop-only for the same reason PDF to Excel itself is: no web engine exists for table extraction. It appears on web as a disabled "Desktop only" card, reusing the same `DesktopOnlyBadge`/`ToolDetail`-guard pattern PDF to Excel already established — no new UI state needed, just applying the existing one to a recipe instead of a single tool.

Every step in every other recipe runs on both platforms, using whatever quality tier that tool currently offers there (e.g. web's Compress and PDF to Images both run at their existing "preview" quality inside a recipe, exactly as they do standalone — a recipe doesn't change or upgrade a step's own behavior).

## Architecture

**A recipe is a fixed, ordered list of existing tool references plus their default options — nothing new to build per-step.** Each platform gets one new registry (`RECIPES`, alongside the existing `TOOLS`) and one new orchestration function that runs each step in sequence, threading one step's output into the next step's input.

### Desktop

- New `apps/desktop/src/lib/recipes.ts`: `Recipe { id: string; title: string; description: string; steps: { toolId: string }[]; webOnly?: false; desktopOnly?: boolean }` and a `RECIPES` array with the four entries above (referencing existing `toolById()` lookups for each step's op and defaults — never duplicating a tool's option values, always reading them live from `TOOLS`, so a future default change to e.g. Compress automatically applies inside every recipe that uses it).
- New `runRecipe()` in `apps/desktop/src/lib/recipeRun.ts` (kept separate from `run.ts`, which is already a sizable, single-responsibility file for standalone tool execution — recipe orchestration is a distinct concern): for each step, calls the same `execute()` used by a standalone tool run, with the previous step's output file as this step's only input. **Intermediate outputs are not deleted** — this app has no file-deletion capability anywhere today (no Tauri fs plugin, no matching Rust command; adding one purely for cleanup would mean new Rust code and new filesystem permission grants, disproportionate for this). Instead, every step's output is written to the same resolved output directory under each tool's own existing naming convention (e.g. Merge writes `merged.pdf`, then Compress — reading that file as its own input — writes `merged-compressed.pdf`; there is no recipe-invented step-numbered naming scheme, since overriding a tool's own output naming would mean touching that tool's op interface, which the "no changes to any existing op's or engine's interface" constraint below rules out), and the recipe's result is reported as the *final* step's file — shown through the exact same single-result UI every standalone tool already uses. The intermediate files are a visible, honest side effect (the user can see exactly what each step produced), not a hidden implementation detail masquerading as cleanup. If any step throws, the recipe fails with that step's own error (report which step, e.g. "Step 2 of 3 (Compress PDF) failed: …"); whatever steps completed before the failure keep their output files (same reasoning — no deletion capability to remove them even if desired), but the recipe overall is reported as failed, not partially succeeded.
- New UI: a "Recipes" section on `apps/desktop/src/routes/Home.tsx` (recipe cards, visually similar to tool cards but distinct enough not to be mistaken for a thirteenth-plus tool — a small "N steps" indicator is enough), and a `RecipeWorkspace` route (`/r/:id`) that reuses the existing drop-zone/progress/result UI components already built for `ToolWorkspace`, just driving `runRecipe()` instead of `execute()`.

### Web

- New `apps/web/src/recipes/registry.tsx`: `RecipeConfig { slug: string; name: string; description: string; steps: string[] /* tool slugs, in order */; category: "pdf" | "image"; tint: TintKey; status: "live" | "desktop-only" }` and a `RECIPES` array with the four entries, each step referencing an existing `ToolConfig` by slug (via `getTool()`), never duplicating option values.
- New `runRecipe()` in `apps/web/src/recipes/runRecipe.ts`: for each step, calls that step's `Engine` with `{ files: [currentFile], options: step's defaultOptions }`; takes the first output `Blob`, wraps it as a new `File` (name derived from the previous step's output name, extension matching whatever the next step's `accept` expects) and feeds it to the next step. Returns the final step's `EngineResult` unchanged, so it renders through the exact same result UI a standalone tool run already uses.
- New UI: a "Recipes" section on `apps/web/src/pages/Home.tsx` and/or its own `/recipes` index page (final placement decided at plan time based on how much room `Home.tsx` already has), and a `RecipeDetail` page (`/recipes/:slug`) mirroring `ToolDetail.tsx`'s shape — including the exact same `desktop-only` guard/badge pattern for the fourth recipe, reusing `DesktopOnlyBadge` and the same "link to `/download` instead" card treatment `ToolsIndex.tsx` already has for PDF to Excel.

## Error handling

- A step failure surfaces that step's own existing error (reusing whatever error code/message that tool's op/engine already produces for that failure) with the step's position and name prefixed, e.g. "Step 2 of 3 (Compress PDF) failed: …" — no new error taxonomy.
- On desktop, a failed step's earlier, already-completed steps keep their output files on disk — see Architecture above: there is no file-deletion capability anywhere in this app, so intermediate outputs are never cleaned up, whether the recipe finishes or fails partway through. On web, nothing is written to disk until the whole chain succeeds: intermediate results only ever exist as in-memory Blobs, and only a fully successful recipe's final Blob is ever offered as a download, so a failed run can't leak a partial result there.

## Testing

- **Desktop**: a test driving `runRecipe()` against each of the four recipes with real fixtures (reusing the same `make_pdf`/`make_image` fixtures every op's own tests already use), asserting the final step's output is correct. A test asserting a mid-chain failure (e.g. corrupt input reaching step 2) produces the correctly-attributed "Step N failed" error and reports the recipe as failed overall.
- **Web**: a test driving `runRecipe()` for each of the three web-eligible recipes (the fourth is desktop-only, untestable on web by definition), asserting the final `EngineResult` is correct, and a mid-chain-failure test matching the desktop one.
- **Desktop-only recipe guard**: a test confirming the fourth recipe's web card links to `/download` and shows `DesktopOnlyBadge`, and that `RecipeDetail` guards direct navigation the same way `ToolDetail` does — mirroring the exact tests PDF to Excel already added for the single-tool case.

## Global Constraints

- Exactly four recipes for v1, no recipe builder, no custom/arbitrary chains, no saving or sharing.
- A recipe step must run with zero required user input beyond the file — no per-step options UI in v1.
- Sign, Redact, and Organize can never be a recipe step (canvas interaction). Watermark and Protect & Unlock are excluded from v1 specifically for lacking a useful zero-input default — not a blanket ban, just out of scope for now.
- Recipe option values are always read live from each step's existing `TOOLS`/`ToolConfig` entry — never duplicated or hardcoded separately, so a future change to a tool's defaults automatically applies inside every recipe using it.
- The fourth recipe (Merge → Extract Tables) is desktop-only, using the exact same `DesktopOnlyBadge`/guard pattern PDF to Excel already established on web — no new UI state invented.
- No changes to any existing op's or engine's interface — recipes are a new orchestration layer on top of the existing per-tool contracts, not a modification to them.
