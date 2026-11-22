/**
 * Standalone guard for the built-in recipes (apps/desktop has no frontend
 * test runner, so this runs under Node's own TypeScript support):
 *
 *   node --experimental-strip-types scripts/check-recipe-steps.ts
 *
 * or: npm run check:recipe-steps
 *
 * Checks that every built-in recipe is a valid chain under the same rules
 * the builder enforces (src/lib/chain.ts): no errors, no warnings, no step
 * that needs hand placement, every tool id real, unique ids, a category.
 *
 * Tool ids are read from tools.ts as text rather than imported, because
 * tools.ts pulls in lucide-react icons a plain Node script has no reason to load.
 */
import { readFileSync } from "node:fs";
import { RECIPES } from "../src/lib/recipes.ts";
import { analyzeChain, RECIPE_TOOLS, UNAVAILABLE_TOOLS } from "../src/lib/chain.ts";

const toolsSource = readFileSync(new URL("../src/lib/tools.ts", import.meta.url), "utf8");
const TOOL_IDS = new Set([...toolsSource.matchAll(/^\s+id: "([a-z-]+)",$/gm)].map((m) => m[1]));
const label = (id: string) => id;

let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.error(`FAIL: ${msg}`);
};

for (const id of Object.keys(RECIPE_TOOLS)) if (!TOOL_IDS.has(id)) fail(`chain.ts knows "${id}", which isn't a tool in tools.ts.`);
for (const id of Object.keys(UNAVAILABLE_TOOLS)) if (!TOOL_IDS.has(id)) fail(`chain.ts lists "${id}" as unavailable, but there is no such tool.`);
for (const id of TOOL_IDS) {
  if (!(id in RECIPE_TOOLS) && !(id in UNAVAILABLE_TOOLS)) fail(`tool "${id}" is neither a recipe tool nor listed as unavailable in chain.ts.`);
}

const ids = new Set<string>();
for (const recipe of RECIPES) {
  if (ids.has(recipe.id)) fail(`duplicate recipe id "${recipe.id}".`);
  ids.add(recipe.id);
  if (!recipe.category) fail(`recipe "${recipe.id}" has no category.`);
  for (const step of recipe.steps) {
    if (step.tool in UNAVAILABLE_TOOLS) fail(`recipe "${recipe.id}" uses "${step.tool}", which can't be a recipe step.`);
    if (!TOOL_IDS.has(step.tool)) fail(`recipe "${recipe.id}" uses unknown tool "${step.tool}".`);
  }
  const a = analyzeChain(recipe.steps, label);
  for (const [i, s] of a.steps.entries()) {
    for (const issue of s.issues) fail(`recipe "${recipe.id}" step ${i + 1} (${recipe.steps[i].tool}): ${issue.level}: ${issue.message}`);
  }
}

if (failed) process.exit(1);
console.log(`OK: ${RECIPES.length} recipe(s) checked against the chaining rules.`);
