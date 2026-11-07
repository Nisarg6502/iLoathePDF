/**
 * Standalone guard for the custom recipe builder's chaining rules, in the same
 * style (and for the same reason -- no frontend test runner in apps/desktop)
 * as check-recipe-steps.ts:
 *
 *   node --experimental-strip-types scripts/check-custom-recipes.ts
 *
 * or: npm run check:custom-recipes
 */
import { BUILDER_TOOLS, MAX_STEPS, allowedNext, validateSteps } from "../src/lib/customRecipes.ts";

const label = (id: string) => id;
let failed = false;
function check(name: string, ok: boolean) {
  if (!ok) {
    failed = true;
    console.error(`FAIL: ${name}`);
  }
}

// Tools that can never be a recipe step (canvas interaction, required input, empty default range).
for (const id of ["sign", "redact", "organize", "watermark", "protect", "split"]) {
  check(`${id} must not be a builder tool`, !(id in BUILDER_TOOLS));
}

check("merge → compress → ocr is valid", validateSteps(["merge", "compress", "ocr"], label) === null);
check("pdf-to-image → convert-image → image-to-pdf is valid", validateSteps(["pdf-to-image", "convert-image", "image-to-pdf"], label) === null);
check("merge → pdf-to-excel is valid", validateSteps(["merge", "pdf-to-excel"], label) === null);
check("a single step is invalid", validateSteps(["compress"], label) !== null);
check("images into compress is invalid", validateSteps(["image-to-pdf", "image-to-pdf"], label) !== null);
check("pdf-to-image into compress is invalid", validateSteps(["pdf-to-image", "compress"], label) !== null);
check("merge mid-chain is invalid", validateSteps(["compress", "merge"], label) !== null);
check("nothing follows pdf-to-excel", allowedNext(["merge", "pdf-to-excel"]).length === 0);
check("merge is offered first but never after", allowedNext([]).includes("merge") && !allowedNext(["ocr"]).includes("merge"));
check("step cap", validateSteps(Array(MAX_STEPS + 1).fill("compress"), label) !== null && allowedNext(Array(MAX_STEPS).fill("compress")).length === 0);

if (failed) process.exit(1);
console.log("OK: custom recipe chaining rules hold.");
