import { beforeEach, describe, expect, it } from "vitest";
import {
  LIMIT_PRESETS,
  LIMIT_STORAGE_KEY,
  findPreset,
  limitProgress,
  loadLimit,
  parseCustomMax,
  parseStoredLimit,
  resolveLimit,
  saveLimit,
} from "./limits";

describe("limitProgress", () => {
  it("counts what is left under the limit", () => {
    const p = limitProgress(142, 280);
    expect(p).toMatchObject({ remaining: 138, over: 0, state: "ok" });
    expect(p.fraction).toBeCloseTo(142 / 280);
  });

  it("turns to near at 90% and stays near at exactly the limit", () => {
    expect(limitProgress(251, 280).state).toBe("ok");
    expect(limitProgress(252, 280).state).toBe("near");
    expect(limitProgress(280, 280)).toMatchObject({ remaining: 0, over: 0, state: "near", fraction: 1 });
  });

  it("counts how far over, and clamps the bar", () => {
    expect(limitProgress(292, 280)).toMatchObject({ remaining: 0, over: 12, state: "over", fraction: 1 });
  });

  it("handles empty text", () => {
    expect(limitProgress(0, 60)).toMatchObject({ remaining: 60, over: 0, state: "ok", fraction: 0 });
  });
});

describe("presets", () => {
  it("has the platform limits", () => {
    const max = Object.fromEntries(LIMIT_PRESETS.map((p) => [p.id, p.max]));
    expect(max).toEqual({
      x: 280,
      sms: 160,
      "title-tag": 60,
      "meta-description": 160,
      instagram: 2200,
      linkedin: 3000,
      "youtube-title": 100,
    });
    expect(LIMIT_PRESETS.every((p) => p.unit === "characters")).toBe(true);
    expect(new Set(LIMIT_PRESETS.map((p) => p.id)).size).toBe(LIMIT_PRESETS.length);
  });

  it("resolves a choice to a target", () => {
    expect(resolveLimit(null)).toBeNull();
    expect(resolveLimit({ preset: "x" })).toEqual({ max: 280, unit: "characters" });
    expect(resolveLimit({ preset: "nope" })).toBeNull();
    expect(resolveLimit({ custom: { max: 500, unit: "words" } })).toEqual({ max: 500, unit: "words" });
    expect(resolveLimit({ custom: { max: 0, unit: "words" } })).toBeNull();
    expect(findPreset("sms")?.max).toBe(160);
  });
});

describe("parseCustomMax", () => {
  it("accepts whole numbers, with separators", () => {
    expect(parseCustomMax("500")).toBe(500);
    expect(parseCustomMax(" 1,000 ")).toBe(1000);
    expect(parseCustomMax("1 500")).toBe(1500);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "0", "-5", "abc", "12a", "99999999999"]) expect(parseCustomMax(bad)).toBeNull();
  });
});

describe("stored limit", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a preset and a custom target", () => {
    saveLimit({ preset: "linkedin" });
    expect(loadLimit()).toEqual({ preset: "linkedin" });
    saveLimit({ custom: { max: 750, unit: "words" } });
    expect(loadLimit()).toEqual({ custom: { max: 750, unit: "words" } });
    saveLimit(null);
    expect(localStorage.getItem(LIMIT_STORAGE_KEY)).toBeNull();
    expect(loadLimit()).toBeNull();
  });

  it("ignores junk", () => {
    for (const raw of [null, "", "{", "42", '{"preset":"gone"}', '{"custom":{"max":-1,"unit":"words"}}', '{"custom":{"max":5,"unit":"pages"}}']) {
      expect(parseStoredLimit(raw)).toBeNull();
    }
  });
});
