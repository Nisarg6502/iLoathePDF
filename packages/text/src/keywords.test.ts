import { describe, expect, it } from "vitest";
import { DEFAULT_ROWS, MAX_ROWS, STOPWORDS, keywordDensity, tokenize, topPhrases } from "./keywords";

const words = (text: string) => tokenize(text).filter((t): t is string => t !== null);

describe("tokenize", () => {
  it("strips surrounding punctuation and keeps internal apostrophes and hyphens", () => {
    expect(words(`"Hello," she said -- (well-known!) don't 'quote' students' 3.14 10:30`)).toEqual([
      "hello",
      "she",
      "said",
      "well-known",
      "don't",
      "quote",
      "students",
      "3.14",
      "10:30",
    ]);
  });

  it("splits words glued by commas or dashes and reads ’ as '", () => {
    expect(words("red,green—blue Don’t")).toEqual(["red", "green", "blue", "don't"]);
  });

  it("folds case", () => {
    expect(words("Apple APPLE apple ÉCOLE")).toEqual(["apple", "apple", "apple", "école"]);
  });

  it("marks sentence and clause breaks so phrases do not cross them", () => {
    expect(tokenize("one two. Three, four\nfive")).toEqual(["one", "two", null, "three", null, "four", null, "five"]);
    // Runs of breaks collapse; no leading break.
    expect(tokenize("...one?! two")).toEqual(["one", null, "two"]);
  });

  it("keeps Devanagari and Kannada words whole, combining marks included", () => {
    expect(words("भारत की राजधानी दिल्ली है। दिल्ली बड़ा शहर है।")).toEqual([
      "भारत",
      "की",
      "राजधानी",
      "दिल्ली",
      "है",
      "दिल्ली",
      "बड़ा",
      "शहर",
      "है",
    ]);
    expect(words("ಕನ್ನಡ ಭಾಷೆ, ಕನ್ನಡ!")).toEqual(["ಕನ್ನಡ", "ಭಾಷೆ", "ಕನ್ನಡ"]);
  });
});

describe("topPhrases", () => {
  it("is empty for empty text", () => {
    expect(keywordDensity("", 1)).toEqual({ rows: [], totalWords: 0 });
    expect(keywordDensity("  ... ", 2)).toEqual({ rows: [], totalWords: 0 });
  });

  it("counts single words, most frequent first, with their share of all words", () => {
    const r = keywordDensity("Cats chase mice. Cats sleep. Dogs chase cats.", 1);
    expect(r.totalWords).toBe(8);
    expect(r.rows.slice(0, 2)).toEqual([
      { phrase: "cats", count: 3, share: 3 / 8 },
      { phrase: "chase", count: 2, share: 2 / 8 },
    ]);
  });

  it("hides common words by default and shows them when asked", () => {
    const text = "The cat and the dog. The cat sat.";
    expect(keywordDensity(text, 1).rows.map((r) => r.phrase)).toEqual(["cat", "dog", "sat"]);
    const all = keywordDensity(text, 1, { hideCommon: false });
    expect(all.rows[0]).toEqual({ phrase: "the", count: 3, share: 3 / 8 });
    expect(STOPWORDS.has("the")).toBe(true);
  });

  it("builds 2- and 3-word phrases within a sentence only", () => {
    const text = "Word counter tools. Word counter apps. Counter word.";
    const two = keywordDensity(text, 2, { hideCommon: false });
    expect(two.rows[0]).toEqual({ phrase: "word counter", count: 2, share: 2 / 8 });
    // "tools word" would cross a full stop.
    expect(two.rows.map((r) => r.phrase)).not.toContain("tools word");

    const three = keywordDensity("a b c d. a b c", 3, { hideCommon: false });
    expect(three.rows).toEqual([
      { phrase: "a b c", count: 2, share: 2 / 7 },
      { phrase: "b c d", count: 1, share: 1 / 7 },
    ]);
  });

  it("drops phrases that start or end with a common word", () => {
    const text = "the point of view is the point of view of the market";
    const two = keywordDensity(text, 2).rows.map((r) => r.phrase);
    expect(two).not.toContain("of the");
    expect(two).not.toContain("the point");
    const three = keywordDensity(text, 3).rows.map((r) => r.phrase);
    expect(three[0]).toBe("point of view");
  });

  it("leaves out once-only entries when enough repeat, and tops up short texts with them", () => {
    const repeated = Array.from({ length: 12 }, (_, i) => `w${i} w${i}`).join(" ");
    const r = keywordDensity(`${repeated} lonely`, 1);
    expect(r.rows).toHaveLength(12);
    expect(r.rows.every((row) => row.count === 2)).toBe(true);

    const short = keywordDensity("alpha beta alpha gamma delta", 1);
    expect(short.rows.map((row) => row.phrase)).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  it("caps the list and keeps first-seen order for ties", () => {
    const many = Array.from({ length: 40 }, (_, i) => `k${i} k${i}`).join(" ");
    const r = keywordDensity(many, 1);
    expect(r.rows).toHaveLength(MAX_ROWS);
    expect(r.rows[0].phrase).toBe("k0");
    expect(keywordDensity(many, 1, { limit: DEFAULT_ROWS }).rows).toHaveLength(DEFAULT_ROWS);
  });

  it("works on Hindi text", () => {
    const r = keywordDensity("भारत की राजधानी दिल्ली है। दिल्ली बड़ा शहर है।", 1);
    expect(r.totalWords).toBe(9);
    expect(r.rows.slice(0, 2)).toEqual([
      { phrase: "दिल्ली", count: 2, share: 2 / 9 },
      { phrase: "है", count: 2, share: 2 / 9 },
    ]);
  });

  it("stays fast on 50,000 words", () => {
    const vocab = Array.from({ length: 2000 }, (_, i) => `word${i}`);
    const text = Array.from({ length: 50_000 }, (_, i) => vocab[(i * 7919) % vocab.length] + (i % 12 === 11 ? "." : "")).join(" ");
    const start = performance.now();
    const tokens = tokenize(text);
    for (const n of [1, 2, 3] as const) topPhrases(tokens, n);
    expect(performance.now() - start).toBeLessThan(5000); // guards against quadratic blow-up (which takes far longer), not a benchmark
  });
});
