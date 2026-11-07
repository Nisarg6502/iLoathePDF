import { beforeEach, describe, expect, it } from "vitest";
import {
  BUILDER_TOOLS,
  MAX_STEPS,
  allowedNext,
  chainWarning,
  deleteCustomRecipe,
  getCustomRecipe,
  loadCustomRecipes,
  saveCustomRecipe,
  validateSteps,
} from "./customRecipes";
import { getRecipe } from "./registry";
import { getTool } from "@/tools/registry";

const label = (s: string) => s;

// Same constraint registry.test.ts locks down for the built-in recipes.
const NEVER_A_RECIPE_STEP = ["sign", "redact", "organize", "watermark", "protect", "split", "pdf-to-excel"];

describe("BUILDER_TOOLS", () => {
  it("only offers tools that exist and are runnable in a browser", () => {
    for (const slug of Object.keys(BUILDER_TOOLS)) {
      const tool = getTool(slug);
      expect(tool, slug).toBeDefined();
      expect(tool?.status, slug).not.toBe("desktop-only");
      expect(NEVER_A_RECIPE_STEP, slug).not.toContain(slug);
    }
  });
});

describe("validateSteps", () => {
  it("accepts a compatible chain", () => {
    expect(validateSteps(["merge", "compress", "ocr"], label)).toBeNull();
    expect(validateSteps(["pdf-to-images", "convert-images", "images-to-pdf"], label)).toBeNull();
  });

  it("requires at least two steps", () => {
    expect(validateSteps([], label)).toMatch(/at least 2/);
    expect(validateSteps(["compress"], label)).toMatch(/at least 2/);
  });

  it("rejects a PDF step fed images, and images fed a PDF", () => {
    expect(validateSteps(["images-to-pdf", "images-to-pdf"], label)).toMatch(/needs images/);
    expect(validateSteps(["compress", "convert-images"], label)).toMatch(/needs images/);
    expect(validateSteps(["pdf-to-images", "compress"], label)).toMatch(/needs a PDF/);
  });

  it("only lets Merge open the chain", () => {
    expect(validateSteps(["compress", "merge"], label)).toBe("Merge PDF can only be the first step.");
  });

  it("rejects tools that can't run unattended", () => {
    expect(validateSteps(["merge", "sign"], label)).toMatch(/can't be used/);
  });

  it("caps the length", () => {
    expect(validateSteps(Array(MAX_STEPS + 1).fill("compress"), label)).toMatch(/at most/);
  });
});

describe("allowedNext", () => {
  it("offers every tool to start, Merge included", () => {
    expect(allowedNext([])).toEqual(Object.keys(BUILDER_TOOLS));
  });

  it("offers only type-compatible tools, never Merge, after the first step", () => {
    expect(allowedNext(["pdf-to-images"]).sort()).toEqual(["convert-images", "images-to-pdf"]);
    expect(allowedNext(["merge"])).not.toContain("merge");
    expect(allowedNext(["merge"])).toEqual(expect.arrayContaining(["compress", "ocr", "pdf-to-images"]));
  });

  it("offers nothing at the cap", () => {
    expect(allowedNext(Array(MAX_STEPS).fill("compress"))).toEqual([]);
  });
});

describe("chainWarning", () => {
  it("warns when Compress runs after OCR, but not the other way round", () => {
    expect(chainWarning(["ocr", "compress"])).toMatch(/text layer/);
    expect(chainWarning(["compress", "ocr"])).toBeNull();
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("saves, loads, resolves through getRecipe, edits and deletes", () => {
    const saved = saveCustomRecipe({ title: " Shrink ", description: "d", steps: ["merge", "compress"] });
    expect(saved.custom).toBe(true);
    expect(saved.title).toBe("Shrink");
    expect(loadCustomRecipes()).toHaveLength(1);
    expect(getRecipe(saved.slug)?.steps).toEqual(["merge", "compress"]);

    saveCustomRecipe({ id: saved.slug, title: "Shrink 2", description: "d", steps: ["compress", "ocr"] });
    expect(loadCustomRecipes()).toHaveLength(1);
    expect(getCustomRecipe(saved.slug)?.title).toBe("Shrink 2");

    deleteCustomRecipe(saved.slug);
    expect(loadCustomRecipes()).toEqual([]);
    expect(getRecipe(saved.slug)).toBeUndefined();
  });

  it("adds the A4 page override whenever Images to PDF is a step", () => {
    const r = saveCustomRecipe({ title: "t", description: "d", steps: ["pdf-to-images", "images-to-pdf"] });
    expect(r.stepOptions).toEqual({ "images-to-pdf": { page_size: "a4", margin_mm: 8 } });
  });

  it("ignores corrupt storage and recipes using a tool the builder no longer allows", () => {
    localStorage.setItem("iloathepdf.customRecipes", "{not json");
    expect(loadCustomRecipes()).toEqual([]);
    localStorage.setItem(
      "iloathepdf.customRecipes",
      JSON.stringify([
        { id: "custom-a", title: "ok", description: "", steps: ["compress", "ocr"] },
        { id: "custom-b", title: "bad", description: "", steps: ["compress", "sign"] },
        { id: "merge-compress", title: "hijack", description: "", steps: ["compress", "ocr"] },
        { nope: true },
      ]),
    );
    expect(loadCustomRecipes().map((r) => r.slug)).toEqual(["custom-a"]);
  });
});
