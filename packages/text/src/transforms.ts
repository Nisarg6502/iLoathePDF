/**
 * Case changes and clean-ups for the word counter's "Change text" menu. Pure
 * functions over a string, so they run in the page and in tests the same way;
 * nothing here leaves the tab.
 *
 * Case changes use the locale-aware toLocaleUpperCase / toLocaleLowerCase.
 * Scripts without letter case (Devanagari, Kannada) pass through unchanged.
 *
 * Title case keeps acronyms such as "PDF" or "NASA" as they are, unless the
 * whole text is in capitals (someone shouting, or a heading copied out of a
 * PDF), where every word would look like an acronym.
 */

/** A word: letters, marks and digits, with inner apostrophes ("don't"). */
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
const HAS_LOWER = /\p{Ll}/u;
const HAS_UPPER = /\p{Lu}/u;

/** Words title case leaves lowercase unless they open or close a line. */
const SMALL_WORDS = new Set([
  "a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet",
  "of", "in", "on", "at", "to", "by", "up", "as", "via", "from", "with", "into", "onto", "over", "per", "vs",
]);

const SUBTITLE_BREAK = /[:.!?—–]/u;

function newlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** "PDF", "NASA", "HTML5": two or more letters, all of them capitals. */
function isAcronym(word: string, locale?: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && HAS_UPPER.test(letters) && letters === letters.toLocaleUpperCase(locale);
}

/** "iPhone", "McDonald", "JavaScript": a capital after the first letter, and some lowercase. */
function isMixedCase(word: string): boolean {
  const rest = Array.from(word).slice(1).join("");
  return HAS_UPPER.test(rest) && HAS_LOWER.test(word);
}

/** No lowercase anywhere, but some capitals: treat as shouting, not as acronyms. */
function isAllCaps(text: string): boolean {
  return HAS_UPPER.test(text) && !HAS_LOWER.test(text);
}

function capitalise(word: string, locale?: string): string {
  const [first = "", ...rest] = Array.from(word);
  return first.toLocaleUpperCase(locale) + rest.join("").toLocaleLowerCase(locale);
}

export function toUpperCase(text: string, locale?: string): string {
  return text.toLocaleUpperCase(locale);
}

export function toLowerCase(text: string, locale?: string): string {
  return text.toLocaleLowerCase(locale);
}

/**
 * "the art of war" → "The Art of War". Small words (a, the, of, in, …) stay
 * lowercase except as the first or last word of a line; each line is treated
 * as its own title. Acronyms and mixed-case names ("iPhone") are kept.
 */
export function toTitleCase(text: string, locale?: string): string {
  const keepCaps = !isAllCaps(text);
  return text
    .split(/(\r\n|\r|\n)/)
    .map((line) => {
      const words = Array.from(line.matchAll(WORD));
      if (words.length === 0) return line;
      const last = words.length - 1;
      let i = 0;
      let prevEnd = 0;
      return line.replace(WORD, (word, offset: number) => {
        const index = i++;
        // A subtitle after a colon or a dash starts like a new title.
        const opens = index === 0 || SUBTITLE_BREAK.test(line.slice(prevEnd, offset));
        prevEnd = offset + word.length;
        const lower = word.toLocaleLowerCase(locale);
        if (!opens && index !== last && SMALL_WORDS.has(lower)) return lower;
        if (keepCaps && (isAcronym(word, locale) || isMixedCase(word))) return word;
        return capitalise(word, locale);
      });
    })
    .join("");
}

/** Sentence-ending punctuation, including the Devanagari danda. */
const SENTENCE_END = /[.!?…।॥]/u;
/** Closing quotes and brackets that may follow the full stop. */
const CLOSER = /["'”’)\]»]/u;
const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;
const SPACE = /\s/u;
/** Common abbreviations whose full stop rarely ends a sentence. */
const ABBREVIATION = /(?:^|[^\p{L}])(?:e\.g|i\.e|vs|cf|mr|mrs|ms|dr|prof)$/iu;

/**
 * "hello. HOW ARE YOU? i am fine." → "Hello. How are you? I am fine."
 * Lowercases everything, then capitalises the first letter of each sentence
 * and of each line, and the standalone pronoun "I".
 */
export function toSentenceCase(text: string, locale?: string): string {
  const lowered = text.toLocaleLowerCase(locale);

  let out = "";
  let capitaliseNext = true;
  let afterEnd = false;
  for (const ch of lowered) {
    if (ch === "\n" || ch === "\r") {
      capitaliseNext = true;
      afterEnd = false;
      out += ch;
    } else if (LETTER.test(ch)) {
      out += capitaliseNext ? ch.toLocaleUpperCase(locale) : ch;
      capitaliseNext = false;
      afterEnd = false;
    } else if (DIGIT.test(ch)) {
      out += ch;
      capitaliseNext = false;
      afterEnd = false;
    } else if (SENTENCE_END.test(ch)) {
      // "e.g. this", "Dr. Smith": a full stop that doesn't end the sentence.
      afterEnd = !(ch === "." && ABBREVIATION.test(out));
      out += ch;
    } else if (SPACE.test(ch)) {
      if (afterEnd) capitaliseNext = true;
      out += ch;
    } else {
      // Quotes, brackets, dashes: wait for the letter that follows. A
      // non-closer right after a full stop ("3.5", "e.g.x") means no new sentence.
      if (afterEnd && !CLOSER.test(ch)) afterEnd = false;
      out += ch;
    }
  }

  // The pronoun "I", including "I'm", "I've", "I'd", "I'll"; not "i.e.".
  return out.replace(/(?<![\p{L}\p{M}\p{N}'’])i(?![\p{L}\p{M}\p{N}])(?!\.\p{L})/gu, "I");
}

/** Collapse runs of spaces and tabs to one space and trim each line. */
export function removeExtraSpaces(text: string): string {
  return newlines(text)
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n");
}

/** Hyphen (or soft hyphen) closing a line, right after a letter. */
const LINE_END_HYPHEN = /(?<=\p{L})[-­‐]$/u;
const STARTS_LOWER = /^\p{Ll}/u;

/**
 * Join the lines of each paragraph into one, keeping blank-line paragraph
 * breaks: the fix for text copied out of a PDF, where every visual line
 * ends in a line break. A word split across lines ("exam-" / "ple") is
 * rejoined when the next line starts in lowercase; otherwise the hyphen is
 * kept ("pre-" / "War" → "pre-War").
 */
export function removeLineBreaks(text: string): string {
  return newlines(text)
    .split(/\n[^\S\n]*\n/)
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      let joined = "";
      for (const line of lines) {
        if (!joined) joined = line;
        else if (LINE_END_HYPHEN.test(joined)) {
          joined = STARTS_LOWER.test(line) ? joined.slice(0, -1) + line : joined + line;
        } else joined += " " + line;
      }
      return joined;
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Drop lines that are empty or only whitespace. */
export function removeEmptyLines(text: string): string {
  return newlines(text)
    .split("\n")
    .filter((line) => line.trim())
    .join("\n");
}

export type TransformId = "upper" | "lower" | "title" | "sentence" | "spaces" | "lineBreaks" | "emptyLines";

export const TRANSFORMS: Record<TransformId, (text: string, locale?: string) => string> = {
  upper: toUpperCase,
  lower: toLowerCase,
  title: toTitleCase,
  sentence: toSentenceCase,
  spaces: removeExtraSpaces,
  lineBreaks: removeLineBreaks,
  emptyLines: removeEmptyLines,
};
