/**
 * Standalone guard script for the feature's core safety constraint: a
 * recipe step must never be Sign, Redact, Organize, Watermark, or
 * Protect & Unlock -- each needs live canvas interaction or a required
 * field with no useful zero-input default (see the design spec's "Scope
 * boundary: which tools can be a recipe step" section). This has held only
 * by inspection until now, with no test or runtime guard.
 *
 * apps/desktop/src has no configured frontend test runner (confirmed: the
 * "test" script in package.json runs the Python sidecar's pytest suite, and
 * no vitest/jest config exists for apps/desktop/src) -- this is a
 * standalone Node script rather than a real test, run directly via Node's
 * built-in TypeScript support so no new dependency is needed:
 *
 *   node --experimental-strip-types scripts/check-recipe-steps.ts
 *
 * or: npm run check:recipe-steps
 *
 * Imports RECIPES directly from recipes.ts (not through tools.ts) since
 * tools.ts pulls in lucide-react icon components, which a plain Node
 * script has no reason to load -- the tool ids checked against here are
 * copied from tools.ts's own entries (see that file for the source of
 * truth) rather than imported, to keep this script's own dependency
 * surface minimal.
 */
import { RECIPES } from "../src/lib/recipes.ts";

// Mirrors the ids of Sign, Redact, Organize, Watermark and Protect & Unlock
// in apps/desktop/src/lib/tools.ts. If a tool's id there ever changes, this
// list must be updated to match -- there is deliberately no import of
// tools.ts here (see the file header), so this check is intentionally
// duplicated rather than derived.
const NEVER_A_RECIPE_STEP = new Set(["sign", "redact", "organize", "watermark", "protect"]);

let failed = false;
for (const recipe of RECIPES) {
  for (const stepId of recipe.steps) {
    if (NEVER_A_RECIPE_STEP.has(stepId)) {
      failed = true;
      console.error(`FAIL: recipe "${recipe.id}" has forbidden step "${stepId}".`);
    }
  }
}

if (failed) {
  console.error("FAIL: one or more recipes reference a tool that can never be a recipe step.");
  process.exit(1);
} else {
  console.log(`OK: ${RECIPES.length} recipe(s) checked, no forbidden step found.`);
}
