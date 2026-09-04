import { describe, it, expect } from "vitest";
import { tintColor, tintWash } from "./tint";

describe("tintColor", () => {
  it("returns the CSS variable reference for a tint key", () => {
    expect(tintColor("a")).toBe("var(--tint-a)");
    expect(tintColor("g")).toBe("var(--tint-g)");
  });
});

describe("tintWash", () => {
  it("defaults to a 10% mix with the surface color", () => {
    expect(tintWash("d")).toBe("color-mix(in oklch, var(--tint-d) 10%, var(--surface))");
  });

  it("accepts a custom percentage", () => {
    expect(tintWash("b", 25)).toBe("color-mix(in oklch, var(--tint-b) 25%, var(--surface))");
  });
});
