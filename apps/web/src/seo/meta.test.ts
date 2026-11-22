import { describe, expect, it } from "vitest";
import { metaFor, staticPages } from "./meta";
import { TOOLS } from "@/tools/registry";
import { RECIPES } from "@/recipes/registry";

describe("SEO metadata", () => {
  const pages = staticPages();

  it("has a page for every tool and built-in recipe, with unique paths and titles", () => {
    const paths = pages.map((p) => p.path);
    for (const t of TOOLS) expect(paths).toContain(`/tools/${t.slug}`);
    for (const r of RECIPES) expect(paths).toContain(`/recipes/${r.slug}`);
    expect(new Set(paths).size).toBe(paths.length);
    const indexed = pages.filter((p) => p.index);
    expect(new Set(indexed.map((p) => p.title)).size).toBe(indexed.length);
  });

  it("keeps titles and descriptions within what search results show", () => {
    for (const p of pages) {
      expect(p.title.length, p.path).toBeLessThanOrEqual(70);
      expect(p.description.length, p.path).toBeGreaterThan(50);
      expect(p.description.length, p.path).toBeLessThanOrEqual(320);
    }
  });

  it("keeps builders and a user's own recipes out of search", () => {
    expect(metaFor("/recipes/new").index).toBe(false);
    expect(metaFor("/recipes/custom-abc123").index).toBe(false);
    expect(metaFor("/recipes/custom-abc123/edit").index).toBe(false);
    expect(metaFor("/nope").index).toBe(false);
    expect(metaFor("/tools/merge/").path).toBe("/tools/merge");
  });
});
