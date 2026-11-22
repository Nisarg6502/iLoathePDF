import { describe, it, expect } from "vitest";
import { RECIPES, recipeHasPreviewStep } from "./registry";

describe("RECIPES", () => {
  it("covers every category with several recipes", () => {
    for (const c of ["forms", "scan", "office", "privacy"]) {
      expect(RECIPES.filter((r) => r.category === c).length, c).toBeGreaterThanOrEqual(3);
    }
  });

  it("marks a recipe as preview when one of its steps is", () => {
    expect(recipeHasPreviewStep(RECIPES.find((r) => r.slug === "merge-compress")!)).toBe(true);
    expect(recipeHasPreviewStep(RECIPES.find((r) => r.slug === "merge-number-pages")!)).toBe(false);
  });
});
