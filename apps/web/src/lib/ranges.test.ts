import { describe, it, expect } from "vitest";
import { parseRanges } from "./ranges";

describe("parseRanges", () => {
  it("parses a single range", () => {
    expect(parseRanges("1-3", 5)).toEqual([0, 1, 2]);
  });

  it("parses comma-separated ranges and singles, in spec order", () => {
    expect(parseRanges("1-2,5,3", 5)).toEqual([0, 1, 4, 2]);
  });

  it("dedupes overlapping ranges, keeping the first occurrence", () => {
    expect(parseRanges("1-3,2-4", 5)).toEqual([0, 1, 2, 3]);
  });

  it("treats an empty spec as every page", () => {
    expect(parseRanges("", 3)).toEqual([0, 1, 2]);
  });

  it("rejects a page number below 1", () => {
    expect(() => parseRanges("0-2", 5)).toThrow(RangeError);
  });

  it("rejects a page number above pageCount", () => {
    expect(() => parseRanges("1-6", 5)).toThrow(RangeError);
  });

  it("rejects a malformed spec", () => {
    expect(() => parseRanges("abc", 5)).toThrow(RangeError);
  });
});
