/**
 * Standalone guard for the recipe chaining rules in src/lib/chain.ts, in the
 * same style (and for the same reason -- no frontend test runner in
 * apps/desktop) as check-recipe-steps.ts:
 *
 *   node --experimental-strip-types scripts/check-custom-recipes.ts
 *
 * or: npm run check:custom-recipes
 */
import {
  MAX_STEPS,
  allowedNext,
  analyzeChain,
  applyFix,
  canInsert,
  sanitizeOptions,
  stepNeeds,
  type RecipeStep,
} from "../src/lib/chain.ts";

const label = (id: string) => id;
const steps = (...tools: string[]): RecipeStep[] => tools.map((tool) => ({ tool }));
const errors = (s: RecipeStep[]) => analyzeChain(s, label).errors;
const firstIssue = (s: RecipeStep[], i: number) => analyzeChain(s, label).steps[i].issues[0];

let failed = false;
function check(name: string, ok: boolean) {
  if (!ok) {
    failed = true;
    console.error(`FAIL: ${name}`);
  }
}

const lock: RecipeStep = { tool: "protect", options: { mode: "protect" } };
const unlock: RecipeStep = { tool: "protect", options: { mode: "unlock" } };

check("merge → compress → ocr is valid", errors(steps("merge", "compress", "ocr")) === 0);
check("pdf-to-image → convert-image → image-to-pdf is valid", errors(steps("pdf-to-image", "convert-image", "image-to-pdf")) === 0);
check("merge → pdf-to-excel is valid", errors(steps("merge", "pdf-to-excel")) === 0);
check("a single step is valid (a saved preset)", errors(steps("compress")) === 0);
check("Compress after OCR is fine here (Ghostscript keeps text)", analyzeChain(steps("image-to-pdf", "ocr", "compress"), label).warnings === 0);

const mismatch = firstIssue(steps("pdf-to-image", "compress"), 1);
check("images into compress is an error", mismatch?.level === "error");
check("…fixed by inserting image-to-pdf", mismatch?.fix?.type === "insert" && errors(applyFix(steps("pdf-to-image", "compress"), mismatch.fix)) === 0);
check("merge after a single-file step is an error", errors(steps("image-to-pdf", "merge")) > 0);
check("merge after a per-file step is fine", errors(steps("txt-to-pdf", "merge")) === 0);
check("nothing follows pdf-to-excel", allowedNext(["merge", "pdf-to-excel"]).length === 0);
check("lock must be last", errors([lock, { tool: "compress" }]) > 0 && errors([{ tool: "compress" }, lock]) === 0);
check("unlock must be first", errors([{ tool: "compress" }, unlock]) > 0 && errors([unlock, { tool: "compress" }]) === 0);
check("nothing can be added after a lock", !canInsert([{ tool: "merge" }, lock], 2, "compress", label).ok);
check("OCR after a text-adding step is an error", errors([{ tool: "watermark", options: { mode: "page_numbers" } }, { tool: "ocr" }]) > 0);
check("OCR twice is an error", errors(steps("ocr", "ocr")) > 0);
check("edits after PDF/A warn", analyzeChain(steps("pdfa", "compress"), label).warnings > 0);
check("hand-placed tools can't be steps", !canInsert([], 0, "sign", label).ok && !canInsert([], 0, "redact", label).ok);
check("step cap", !canInsert(steps(...Array(MAX_STEPS).fill("compress")), MAX_STEPS, "compress", label).ok);
check("passwords are never stored", JSON.stringify(sanitizeOptions("protect", { mode: "protect", password: "x1234", confirmPassword: "x1234" })) === '{"mode":"protect"}');
check("a lock step asks for its password at run time", stepNeeds(lock, {}, true) !== null && stepNeeds({ tool: "protect", options: { mode: "protect", password: "abcd", confirmPassword: "abcd" } }, {}, true) === null);

if (failed) process.exit(1);
console.log("OK: recipe chaining rules hold.");
