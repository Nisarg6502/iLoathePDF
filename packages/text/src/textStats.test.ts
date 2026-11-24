import { describe, expect, it } from "vitest";
import { countParagraphs, countSentences, countWords, formatDuration, textStats } from "./textStats";

describe("countWords", () => {
  it("counts runs of non-space text the way a word processor does", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t ")).toBe(0);
    expect(countWords("Hello world")).toBe(2);
    expect(countWords("  Hello,   world!  ")).toBe(2);
    expect(countWords("A well-known fact, isn't it?")).toBe(5);
    expect(countWords("one\ntwo\n\nthree")).toBe(3);
  });

  it("ignores lone punctuation and bullets but counts numbers", () => {
    expect(countWords("Wait — what? • item 42")).toBe(4);
    expect(countWords("3.14 is pi")).toBe(3);
  });

  it("counts words in Indian scripts", () => {
    expect(countWords("मेरा नाम निसर्ग है।")).toBe(4);
    expect(countWords("ನನ್ನ ಹೆಸರು")).toBe(2);
  });
});

describe("countSentences", () => {
  it("splits at sentence-ending punctuation followed by a space", () => {
    expect(countSentences("")).toBe(0);
    expect(countSentences("One. Two! Three? Four")).toBe(4);
    expect(countSentences("Pi is 3.14 roughly.")).toBe(1);
    expect(countSentences('He said "stop." Then left.')).toBe(2);
    expect(countSentences("Wait... what")).toBe(2);
  });

  it("treats a line break as the end of a sentence", () => {
    expect(countSentences("A heading\nSome text here. More text.")).toBe(3);
  });

  it("knows the Devanagari danda", () => {
    expect(countSentences("यह पहला वाक्य है। यह दूसरा है।")).toBe(2);
  });
});

describe("countParagraphs", () => {
  it("counts non-empty lines", () => {
    expect(countParagraphs("")).toBe(0);
    expect(countParagraphs("one")).toBe(1);
    expect(countParagraphs("one\n\n  \ntwo\r\nthree")).toBe(3);
  });
});

describe("textStats", () => {
  it("counts characters as the reader sees them", () => {
    const s = textStats("Hi 👋🏽 there");
    expect(s.characters).toBe(10);
    expect(s.charactersNoSpaces).toBe(8);
    expect(s.words).toBe(2);
  });

  it("estimates reading and speaking time from the word count", () => {
    const s = textStats(Array(238).fill("word").join(" "));
    expect(s.readingSeconds).toBe(60);
    expect(s.speakingSeconds).toBe(96);
    expect(textStats("").readingSeconds).toBe(0);
  });
});

describe("formatDuration", () => {
  it("picks sensible units", () => {
    expect(formatDuration(0)).toEqual([{ value: 0, unit: "sec" }]);
    expect(formatDuration(45)).toEqual([{ value: 45, unit: "sec" }]);
    expect(formatDuration(180)).toEqual([{ value: 3, unit: "min" }]);
    expect(formatDuration(200)).toEqual([{ value: 3, unit: "min" }, { value: 20, unit: "sec" }]);
    expect(formatDuration(3900)).toEqual([{ value: 1, unit: "hr" }, { value: 5, unit: "min" }]);
  });
});
