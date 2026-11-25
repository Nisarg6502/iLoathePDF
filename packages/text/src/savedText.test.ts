import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_AGE_MS, SAVED_TEXT_KEY, forgetSavedText, loadSavedText, parseSavedText, writeSavedText } from "./savedText";

const NOW = Date.UTC(2026, 10, 25);

describe("saved text", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("is off until something is written, and round-trips", () => {
    expect(loadSavedText(NOW)).toBeNull();
    expect(writeSavedText("Hello wörld\n\nनमस्ते", NOW)).toBe("saved");
    expect(loadSavedText(NOW + 1000)).toBe("Hello wörld\n\nनमस्ते");
  });

  it("keeps an empty text as saving-on", () => {
    writeSavedText("", NOW);
    expect(loadSavedText(NOW)).toBe("");
  });

  it("forgets on request", () => {
    writeSavedText("draft", NOW);
    forgetSavedText();
    expect(localStorage.getItem(SAVED_TEXT_KEY)).toBeNull();
    expect(loadSavedText(NOW)).toBeNull();
  });

  it("deletes a copy left unused for longer than the limit", () => {
    writeSavedText("old draft", NOW);
    expect(loadSavedText(NOW + MAX_AGE_MS + 1)).toBeNull();
    expect(localStorage.getItem(SAVED_TEXT_KEY)).toBeNull();
  });

  it("starts the clock again each time it is opened", () => {
    writeSavedText("draft", NOW);
    expect(loadSavedText(NOW + MAX_AGE_MS - 1)).toBe("draft");
    expect(loadSavedText(NOW + 2 * MAX_AGE_MS - 2)).toBe("draft");
  });

  it("ignores and removes anything it doesn't recognise", () => {
    for (const raw of ["not json", "{}", '{"v":2,"text":"x","at":0}', '{"v":1,"text":5,"at":0}', "null"]) {
      expect(parseSavedText(raw, NOW)).toBeNull();
    }
    localStorage.setItem(SAVED_TEXT_KEY, "garbage");
    expect(loadSavedText(NOW)).toBeNull();
    expect(localStorage.getItem(SAVED_TEXT_KEY)).toBeNull();
  });

  it("rejects a timestamp far in the future (clock moved back)", () => {
    expect(parseSavedText(JSON.stringify({ v: 1, text: "x", at: NOW + 2 * MAX_AGE_MS }), NOW)).toBeNull();
  });

  it("reports a full store and leaves no stale copy behind", () => {
    writeSavedText("short", NOW);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(writeSavedText("x".repeat(100), NOW)).toBe("too-big");
    vi.restoreAllMocks();
    expect(localStorage.getItem(SAVED_TEXT_KEY)).toBeNull();
  });

  it("reports blocked storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(writeSavedText("x", NOW)).toBe("blocked");
  });
});
