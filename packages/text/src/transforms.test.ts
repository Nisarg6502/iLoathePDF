import { describe, expect, it } from "vitest";
import {
  removeEmptyLines,
  removeExtraSpaces,
  removeLineBreaks,
  toLowerCase,
  toSentenceCase,
  toTitleCase,
  toUpperCase,
} from "./transforms";

describe("toUpperCase / toLowerCase", () => {
  it("changes case and leaves caseless scripts alone", () => {
    expect(toUpperCase("Hello, world 42!")).toBe("HELLO, WORLD 42!");
    expect(toLowerCase("Hello, WORLD 42!")).toBe("hello, world 42!");
    expect(toUpperCase("नमस्ते दुनिया")).toBe("नमस्ते दुनिया");
    expect(toUpperCase("")).toBe("");
  });

  it("is locale-aware", () => {
    expect(toUpperCase("istanbul", "tr")).toBe("İSTANBUL");
    expect(toUpperCase("straße")).toBe("STRASSE");
    expect(toLowerCase("ÉTÉ")).toBe("été");
  });
});

describe("toTitleCase", () => {
  it("capitalises words and keeps small words lowercase", () => {
    expect(toTitleCase("the lord of the rings")).toBe("The Lord of the Rings");
    expect(toTitleCase("a tale OF two cities")).toBe("A Tale of Two Cities");
  });

  it("capitalises a small word when it is first or last", () => {
    expect(toTitleCase("what are you looking for")).toBe("What Are You Looking For");
    expect(toTitleCase("of mice and men")).toBe("Of Mice and Men");
  });

  it("keeps acronyms and mixed-case names", () => {
    expect(toTitleCase("how to merge PDF files on your iPhone")).toBe("How to Merge PDF Files on Your iPhone");
  });

  it("does not treat a text written all in capitals as acronyms", () => {
    expect(toTitleCase("THE ART OF WAR")).toBe("The Art of War");
  });

  it("handles punctuation, apostrophes and hyphens", () => {
    expect(toTitleCase("don't stop: a well-known story!")).toBe("Don't Stop: A Well-Known Story!");
    expect(toTitleCase("“hello,” she said.")).toBe("“Hello,” She Said.");
  });

  it("treats each line as its own title and keeps CRLF", () => {
    expect(toTitleCase("the end of it\r\nthe start of it")).toBe("The End of It\r\nThe Start of It");
  });

  it("passes empty text and caseless scripts through", () => {
    expect(toTitleCase("")).toBe("");
    expect(toTitleCase("   ")).toBe("   ");
    expect(toTitleCase("मेरा नाम")).toBe("मेरा नाम");
  });
});

describe("toSentenceCase", () => {
  it("capitalises the first letter of each sentence", () => {
    expect(toSentenceCase("hello THERE. how are you? fine! ok… yes")).toBe("Hello there. How are you? Fine! Ok… Yes");
  });

  it("capitalises the pronoun I but not i.e.", () => {
    expect(toSentenceCase("yes i think i'm right, i.e. mostly.")).toBe("Yes I think I'm right, i.e. mostly.");
  });

  it("does not start a sentence after a common abbreviation", () => {
    expect(toSentenceCase("ask DR. SMITH, e.g. today. done")).toBe("Ask dr. smith, e.g. today. Done");
  });

  it("lowercases everything else, capitals included", () => {
    expect(toSentenceCase("THIS IS LOUD. SO LOUD.")).toBe("This is loud. So loud.");
  });

  it("handles quotes, brackets, numbers and line breaks", () => {
    expect(toSentenceCase('he said "STOP." then left. "why?" (no idea.) ok')).toBe(
      'He said "stop." Then left. "Why?" (No idea.) Ok',
    );
    expect(toSentenceCase("it costs 3.5 dollars. 2 left")).toBe("It costs 3.5 dollars. 2 left");
    expect(toSentenceCase("first line\r\nsecond line\n- third")).toBe("First line\r\nSecond line\n- Third");
  });

  it("passes empty text and caseless scripts through", () => {
    expect(toSentenceCase("")).toBe("");
    expect(toSentenceCase("यह ठीक है। वह भी।")).toBe("यह ठीक है। वह भी।");
  });
});

describe("removeExtraSpaces", () => {
  it("collapses spaces and tabs and trims each line", () => {
    expect(removeExtraSpaces("  one   two\t\tthree  \nfour   five ")).toBe("one two three\nfour five");
  });

  it("keeps line breaks and blank lines, normalising CRLF", () => {
    expect(removeExtraSpaces("a  b\r\n\r\n  c")).toBe("a b\n\nc");
    expect(removeExtraSpaces("")).toBe("");
  });
});

describe("removeLineBreaks", () => {
  it("rejoins text copied out of a PDF, keeping paragraphs", () => {
    const pdf = "The quick brown fox jumps\nover the lazy dog. It was an exam-\nple of speed.\n\nA second para-\ngraph here.\n";
    expect(removeLineBreaks(pdf)).toBe(
      "The quick brown fox jumps over the lazy dog. It was an example of speed.\n\nA second paragraph here.",
    );
  });

  it("keeps the hyphen when the next line does not start lowercase", () => {
    expect(removeLineBreaks("a pre-\nWar house")).toBe("a pre-War house");
    expect(removeLineBreaks("pages 1-\n10")).toBe("pages 1- 10");
    expect(removeLineBreaks("items -\nnext")).toBe("items - next");
  });

  it("handles CRLF, whitespace-only blank lines and extra blank lines", () => {
    expect(removeLineBreaks("one\r\ntwo\r\n  \r\n\r\nthree\r\nfour")).toBe("one two\n\nthree four");
    expect(removeLineBreaks("\n\n  lead\n")).toBe("lead");
  });

  it("returns empty text unchanged", () => {
    expect(removeLineBreaks("")).toBe("");
    expect(removeLineBreaks("\n\n")).toBe("");
  });
});

describe("removeEmptyLines", () => {
  it("drops empty and whitespace-only lines", () => {
    expect(removeEmptyLines("one\n\n\ntwo\n   \nthree\n")).toBe("one\ntwo\nthree");
    expect(removeEmptyLines("a\r\n\r\nb")).toBe("a\nb");
    expect(removeEmptyLines("")).toBe("");
  });
});
