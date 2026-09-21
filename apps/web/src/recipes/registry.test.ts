import { describe, it, expect } from "vitest";
import { RECIPES } from "./registry";

// The feature's core safety constraint (see the design spec's "Scope
// boundary: which tools can be a recipe step" section): Sign, Redact and
// Organize need live canvas interaction, and Watermark and Protect & Unlock
// have no useful zero-input default. None of the five can ever be a recipe
// step. This held only by inspection until now, with no test or runtime
// guard -- this locks it down so a future recipe addition can't reintroduce
// one of them by accident.
const NEVER_A_RECIPE_STEP = new Set(["sign", "redact", "organize", "watermark", "protect"]);

describe("RECIPES", () => {
  it("never uses Sign, Redact, Organize, Watermark or Protect & Unlock as a step", () => {
    for (const recipe of RECIPES) {
      for (const stepSlug of recipe.steps) {
        expect(
          NEVER_A_RECIPE_STEP.has(stepSlug),
          `Recipe "${recipe.slug}" has forbidden step "${stepSlug}"`,
        ).toBe(false);
      }
    }
  });
});
