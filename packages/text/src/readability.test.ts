import { describe, expect, it } from "vitest";
import {
  countSyllables,
  fleschKincaidGrade,
  fleschReadingEase,
  isMostlyLatin,
  readability,
  readingBand,
  truncate,
} from "./readability";

describe("formulas", () => {
  it("matches the published example values", () => {
    // "The cat sat on the mat." scores 116 (Flesch Reading Ease, Wikipedia).
    expect(fleschReadingEase(6, 1, 6)).toBeCloseTo(116.1, 1);
    // The platypus sentence: 13 words, 24 syllables, grade 11.3 (Flesch–Kincaid, Wikipedia).
    expect(fleschKincaidGrade(13, 1, 24)).toBeCloseTo(11.3, 1);
  });

  it("puts scores in Flesch's bands", () => {
    expect(readingBand(116)).toBe("very-easy");
    expect(readingBand(85)).toBe("easy");
    expect(readingBand(72)).toBe("fairly-easy");
    expect(readingBand(65)).toBe("plain");
    expect(readingBand(55)).toBe("fairly-hard");
    expect(readingBand(40)).toBe("hard");
    expect(readingBand(10)).toBe("very-hard");
    expect(readingBand(-20)).toBe("very-hard");
  });
});

describe("countSyllables", () => {
  const cases: [string, number][] = [
    ["the", 1],
    ["cat", 1],
    ["make", 1],
    ["table", 2],
    ["little", 2],
    ["jumped", 1],
    ["wanted", 2],
    ["played", 1],
    ["makes", 1],
    ["boxes", 2],
    ["changes", 2],
    ["going", 2],
    ["happier", 3],
    ["media", 3],
    ["radio", 3],
    ["language", 2],
    ["statement", 2],
    ["careful", 2],
    ["completely", 3],
    ["everything", 3],
    ["something", 2],
    ["people", 2],
    ["beautiful", 3],
    ["family", 3],
    ["communication", 5],
    ["university", 5],
    ["psychology", 4],
    ["because", 2],
    ["whole", 1],
    ["through", 1],
  ];
  it.each(cases)("%s has %i", (word, n) => {
    expect(countSyllables(word)).toBe(n);
  });

  it("ignores case, punctuation and accents", () => {
    expect(countSyllables("Table,")).toBe(2);
    expect(countSyllables("people's")).toBe(2);
    expect(countSyllables("(ideas)")).toBe(3);
    expect(countSyllables("naïve")).toBe(2);
    expect(countSyllables("café")).toBe(2);
  });

  it("counts a word without letters as one", () => {
    expect(countSyllables("2024")).toBe(1);
  });

  it("is close on the platypus sentence (24 by hand)", () => {
    const words = "The Australian platypus is seemingly a hybrid of a mammal and reptilian creature.".split(" ");
    const total = words.reduce((sum, w) => sum + countSyllables(w), 0);
    expect(Math.abs(total - 24)).toBeLessThanOrEqual(2);
  });
});

describe("isMostlyLatin", () => {
  it("tells English from other scripts", () => {
    expect(isMostlyLatin("Plain English text.")).toBe(true);
    expect(isMostlyLatin("मेरा नाम निसर्ग है। यह पहला वाक्य है।")).toBe(false);
    expect(isMostlyLatin("ನನ್ನ ಹೆಸರು PDF")).toBe(false);
    expect(isMostlyLatin("Use the PDF tool. पीडीएफ")).toBe(true);
    expect(isMostlyLatin("12345 !!")).toBe(true);
  });
});

describe("truncate", () => {
  it("cuts long sentences at a word", () => {
    expect(truncate("Short one.")).toBe("Short one.");
    const long = "word ".repeat(40);
    const cut = truncate(long);
    expect(cut.length).toBeLessThanOrEqual(91);
    expect(cut.endsWith("word…")).toBe(true);
  });
});

describe("readability", () => {
  it("scores a known passage like the published value", () => {
    const r = readability("The cat sat on the mat. ".repeat(6));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.words).toBe(36);
    expect(r.sentences).toBe(6);
    expect(r.syllables).toBe(36);
    expect(r.readingEase).toBeCloseTo(116.1, 1);
    expect(r.band).toBe("very-easy");
    expect(r.grade).toBe(0);
    expect(r.avgSentenceWords).toBe(6);
    expect(r.avgWordChars).toBeCloseTo(2.83, 2);
    expect(r.longSentences).toBe(0);
    expect(r.hardWords).toBe(0);
  });

  it("rates dense writing as hard and finds long sentences", () => {
    const dense =
      "Notwithstanding the considerable methodological limitations inherent in observational epidemiological investigations, " +
      "the accumulated evidence substantially indicates that prolonged occupational exposure to particulate contamination " +
      "significantly elevates the probability of developing chronic respiratory complications. Short one here.";
    const r = readability(dense);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.sentences).toBe(2);
    expect(r.readingEase).toBeLessThan(30);
    expect(r.band).toBe("very-hard");
    expect(r.grade).toBeGreaterThan(16);
    expect(r.longSentences).toBe(1);
    expect(r.longSamples).toHaveLength(1);
    expect(r.longSamples[0].words).toBe(31);
    expect(r.longSamples[0].text.startsWith("Notwithstanding the considerable")).toBe(true);
    expect(r.longSamples[0].text.endsWith("…")).toBe(true);
    expect(r.hardWords).toBeGreaterThan(15);
  });

  it("splits sentences the way the word counter does", () => {
    const text = "A heading\nPi is 3.14 roughly. He said \"stop.\" Then left. " + "More words in this sentence to pass the minimum. ".repeat(3);
    const r = readability(text);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.sentences).toBe(7);
  });

  it("asks for more text when there is too little", () => {
    expect(readability("")).toEqual({ kind: "short", words: 0 });
    expect(readability("Just a couple of short sentences. Not enough yet.")).toEqual({ kind: "short", words: 9 });
  });

  it("declines text that is mostly not in Latin script", () => {
    expect(readability("यह पहला वाक्य है। ".repeat(20))).toEqual({ kind: "not-english" });
  });
});
