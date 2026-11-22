import { beforeEach, describe, expect, it } from "vitest";
import { decodeShare, deleteCustomRecipe, encodeShare, getCustomRecipe, loadCustomRecipes, saveCustomRecipe } from "./customRecipes";
import { getRecipe } from "./registry";

describe("custom recipe storage", () => {
  beforeEach(() => localStorage.clear());

  it("saves, loads, updates and deletes", () => {
    const saved = saveCustomRecipe({ title: " Email pack ", description: "", steps: [{ tool: "merge" }, { tool: "compress", options: { dpi: 72 } }] });
    expect(saved.slug).toMatch(/^custom-/);
    expect(getRecipe(saved.slug)?.title).toBe("Email pack");
    expect(loadCustomRecipes()[0].steps[1]).toEqual({ tool: "compress", options: { dpi: 72 } });

    saveCustomRecipe({ id: saved.slug, title: "Renamed", description: "", steps: [{ tool: "compress" }] });
    expect(loadCustomRecipes()).toHaveLength(1);
    expect(getCustomRecipe(saved.slug)?.title).toBe("Renamed");

    deleteCustomRecipe(saved.slug);
    expect(loadCustomRecipes()).toEqual([]);
  });

  it("never stores a password", () => {
    saveCustomRecipe({
      title: "Lock",
      description: "",
      steps: [{ tool: "merge" }, { tool: "protect", options: { mode: "protect", password: "hunter22", confirmPassword: "hunter22" } }],
    });
    expect(localStorage.getItem("iloathepdf.customRecipes")).not.toContain("hunter22");
  });

  it("reads recipes saved by the older version (bare tool slugs)", () => {
    localStorage.setItem(
      "iloathepdf.customRecipes",
      JSON.stringify([{ id: "custom-old", title: "Old", description: "", steps: ["images-to-pdf", "compress"] }]),
    );
    const [old] = loadCustomRecipes();
    expect(old.steps).toEqual([{ tool: "images-to-pdf", options: { page_size: "a4", margin_mm: 8 } }, { tool: "compress" }]);
  });

  it("hides recipes that use a tool recipes no longer support, and ignores junk", () => {
    localStorage.setItem(
      "iloathepdf.customRecipes",
      JSON.stringify([{ id: "custom-x", title: "X", description: "", steps: ["sign", "compress"] }, { nope: true }, "junk"]),
    );
    expect(loadCustomRecipes()).toEqual([]);
    localStorage.setItem("iloathepdf.customRecipes", "{not json");
    expect(loadCustomRecipes()).toEqual([]);
  });
});

describe("share links", () => {
  it("round-trips a recipe without its password or images", () => {
    const code = encodeShare({
      title: "Stamp & lock ✓",
      description: "for the counter",
      steps: [
        { tool: "watermark", options: { mode: "stamp", stamp: { content: "image", imageDataUrl: "data:image/png;base64,AAAA", position: "center" } } },
        { tool: "protect", options: { mode: "protect", password: "secret1" } },
      ],
    });
    expect(code).not.toMatch(/[+/=]/);
    const back = decodeShare(code)!;
    expect(back.title).toBe("Stamp & lock ✓");
    expect(back.steps[1]).toEqual({ tool: "protect", options: { mode: "protect" } });
    expect(JSON.stringify(back)).not.toContain("base64");
  });

  it("rejects garbage", () => {
    expect(decodeShare("!!!")).toBeNull();
    expect(decodeShare(btoa(JSON.stringify({ s: [{ tool: "sign" }] })))).toBeNull();
  });
});
