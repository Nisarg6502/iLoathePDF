import { describe, expect, it } from "vitest";
import { diffTexts, tokenize, type DiffResult } from "./diff";

/** "the [-quick-]{+slow+} fox" */
function show(r: DiffResult): string {
  return r.parts.map((p) => (p.op === "equal" ? p.text : p.op === "delete" ? `[-${p.text}-]` : `{+${p.text}+}`)).join("");
}

/** Both sides rebuilt from the parts must give back the inputs exactly. */
function sides(r: DiffResult): [string, string] {
  let a = "";
  let b = "";
  for (const p of r.parts) {
    if (p.op === "equal") {
      a += p.original;
      b += p.text;
    } else if (p.op === "delete") a += p.text;
    else b += p.text;
  }
  return [a, b];
}

function words(n: number, seed: number): string[] {
  const vocab = ["the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog", "and", "runs", "far", "away", "from", "home", "today", "while", "birds", "sing", "softly", "outside"];
  const out: string[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out.push(vocab[s % vocab.length] + (s % 7 === 0 ? "." : s % 11 === 0 ? "," : ""));
  }
  return out;
}

function paragraphs(list: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < list.length; i += 60) lines.push(list.slice(i, i + 60).join(" "));
  return lines.join("\n\n");
}

describe("tokenize", () => {
  it("splits words, punctuation, spaces and line breaks, losing nothing", () => {
    const text = "Don't stop—well-known, 42 times!\n\n  Next";
    const tokens = tokenize(text);
    expect(tokens.join("")).toBe(text);
    expect(tokens).toEqual(["Don't", " ", "stop", "—", "well", "-", "known", ",", " ", "42", " ", "times", "!", "\n", "\n", "  ", "Next"]);
  });
});

describe("diffTexts", () => {
  it("reports identical texts", () => {
    const r = diffTexts("Same words here.", "Same words here.");
    expect(r.identical).toBe(true);
    expect(r.changes).toBe(0);
    expect(show(r)).toBe("Same words here.");
  });

  it("handles empty sides", () => {
    expect(diffTexts("", "").identical).toBe(true);
    expect(diffTexts("", "").parts).toEqual([]);

    const added = diffTexts("", "Hello there");
    expect(show(added)).toBe("{+Hello there+}");
    expect(added).toMatchObject({ wordsAdded: 2, wordsRemoved: 0, changes: 1, identical: false });

    const removed = diffTexts("Hello there", "");
    expect(show(removed)).toBe("[-Hello there-]");
    expect(removed).toMatchObject({ wordsAdded: 0, wordsRemoved: 2, changes: 1 });
  });

  it("finds an insertion", () => {
    const r = diffTexts("the cat sat", "the black cat sat");
    expect(show(r)).toBe("the {+black +}cat sat");
    expect(r).toMatchObject({ wordsAdded: 1, wordsRemoved: 0, changes: 1 });
  });

  it("finds a deletion", () => {
    const r = diffTexts("the black cat sat", "the cat sat");
    expect(show(r)).toBe("the [-black -]cat sat");
    expect(r).toMatchObject({ wordsAdded: 0, wordsRemoved: 1, changes: 1 });
  });

  it("shows a replacement as one removal then one addition", () => {
    const r = diffTexts("the quick brown fox", "the slow red fox");
    expect(show(r)).toBe("the [-quick brown-]{+slow red+} fox");
    expect(r).toMatchObject({ wordsAdded: 2, wordsRemoved: 2, changes: 1 });
  });

  it("counts separate changes and keeps paragraphs", () => {
    const a = "One fish.\n\nTwo fish.\n\nRed fish.";
    const b = "One fish.\n\nTwo cats.\n\nBlue fish!";
    const r = diffTexts(a, b);
    expect(show(r)).toBe("One fish.\n\nTwo [-fish-]{+cats+}.\n\n[-Red-]{+Blue+} fish[-.-]{+!+}");
    expect(r.changes).toBe(3);
    expect(sides(r)).toEqual([a, b]);
  });

  it("can ignore case", () => {
    expect(diffTexts("Hello World", "hello world").identical).toBe(false);
    const r = diffTexts("Hello World", "hello world", { ignoreCase: true });
    expect(r.identical).toBe(true);
    expect(r.parts).toEqual([{ op: "equal", text: "hello world", original: "Hello World" }]);
  });

  it("can ignore extra spaces and line breaks", () => {
    const a = "Some  text\nwrapped here. ";
    const b = " Some text wrapped   here.";
    expect(diffTexts(a, b).identical).toBe(false);
    const r = diffTexts(a, b, { ignoreSpace: true });
    expect(r.identical).toBe(true);
    expect(sides(r)).toEqual([a, b]);
  });

  it("still sees word changes when ignoring spaces", () => {
    const r = diffTexts("a  b c", "a b  d", { ignoreSpace: true });
    expect(show(r)).toBe("a b  [-c-]{+d+}");
    expect(r.changes).toBe(1);
  });

  it("round-trips both texts", () => {
    const a = paragraphs(words(800, 1));
    const b = paragraphs(words(800, 2));
    const r = diffTexts(a, b);
    expect(sides(r)).toEqual([a, b]);
  });

  it("compares two 20,000-word drafts quickly", () => {
    const list = words(20_000, 7);
    const a = paragraphs(list);
    const edited = [...list];
    for (let i = 50; i < edited.length; i += 97) edited[i] = "CHANGED";
    for (let i = 333; i < edited.length; i += 1000) edited.splice(i, 2);
    const b = paragraphs(edited);
    const start = performance.now();
    const r = diffTexts(a, b);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(5000); // guards against quadratic blow-up (which takes far longer), not a benchmark
    expect(r.approximate).toBe(false);
    expect(r.changes).toBeGreaterThan(150);
    expect(sides(r)).toEqual([a, b]);
  });

  it("stays fast on two unrelated 20,000-word texts", () => {
    const a = paragraphs(words(20_000, 11));
    const b = paragraphs(words(20_000, 12345));
    const start = performance.now();
    const r = diffTexts(a, b);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(5000); // guards against quadratic blow-up (which takes far longer), not a benchmark
    expect(r.identical).toBe(false);
    expect(sides(r)).toEqual([a, b]);
  });

  it("stays fast on two unrelated 20,000-word texts with no line breaks", () => {
    const a = words(20_000, 3).join(" ");
    const b = words(20_000, 4).join(" ");
    const start = performance.now();
    const r = diffTexts(a, b, { ignoreCase: true, ignoreSpace: true });
    expect(performance.now() - start).toBeLessThan(5000); // guards against quadratic blow-up (which takes far longer), not a benchmark
    expect(r.approximate).toBe(true);
    expect(sides(r)).toEqual([a, b]);
  });
});
