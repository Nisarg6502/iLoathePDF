# Custom Recipe Builder — Design Note

Lifts the v1 "exactly four recipes, no recipe builder" constraint from `2026-09-19-recipes-design.md`. The user asked for it in a single line ("currently it is fixed, a custom one would make sense right?"), so these decisions are the builder's own calls, not agreed ones.

## What it is

Users compose their own recipe from the existing tools: pick tools one after another, name it, save it. It then behaves exactly like a built-in recipe (same workspace, same `runRecipe()`), plus Edit and Delete.

## Decisions

- **Storage:** `localStorage` key `iloathepdf.customRecipes`, per device (browser on web, app on desktop). No sync, no sharing/export in this version. Corrupt or hand-edited entries, and recipes using a tool the builder no longer allows, are ignored rather than crashing.
- **Eligible tools** (the original "zero required input" rule): Merge, Compress, OCR, PDF to Images, Images to PDF, Convert Images, plus PDF to Excel on desktop only. Still excluded: Sign, Redact, Organize (canvas), Watermark, Protect (required field), and Split (its default range is empty, so it does nothing unattended).
- **Chaining rules:** every step has an input kind and output kind (PDF, images, spreadsheet); the picker only offers tools that accept the previous step's output, so invalid chains can't be built. Merge may only open a chain (later steps receive one file). PDF to Excel can only end one. 2–8 steps.
- **Per-step options:** none. Each step uses its tool's defaults, with the same A4-page override built-in recipes apply to Images to PDF.
- **Web quirk surfaced, not blocked:** web Compress rebuilds a PDF from images and drops OCR's text layer, so Compress-after-OCR shows a warning.
- **Routes:** web `/recipes/new`, `/recipes/:slug/edit`; desktop `/r/new`, `/r/:id/edit`. Custom ids are prefixed `custom-` so they can't collide with built-in slugs.

## Non-goals

Per-step option editing, branching, saving/sharing across devices, importing/exporting recipes, Split as a step.
