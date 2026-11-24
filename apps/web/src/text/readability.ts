/**
 * Readability for the word counter: Flesch Reading Ease, Flesch–Kincaid grade
 * level and a few plain counts that help a writer find heavy passages. Pure
 * functions over a string; nothing here leaves the tab.
 *
 * Both formulas were built for English, so text that is mostly in another
 * script gets no score, and very short text gets none either (one sentence
 * can swing the number by 50 points).
 *
 * Sentences and words follow the same rules as lib/textStats.ts, so the
 * counts here agree with the ones beside them on the page.
 */
import { countWords } from "@/lib/textStats";

/** Fewer words than this and the score says more about luck than writing. */
export const MIN_WORDS = 30;
/** A sentence longer than this is flagged for the writer to look at. */
export const LONG_SENTENCE_WORDS = 25;
/** How many long sentences are quoted back. */
export const MAX_LONG_SAMPLES = 5;
/** Quoted sentences are cut to about this many characters. */
export const SAMPLE_CHARS = 90;

// Same as lib/textStats.ts (kept in step by hand; that file doesn't export it).
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;
const SENTENCE_BREAK = /(?<=[.!?…।॥]["'”’)\]]*)\s+|\n+/u;

// ---------------------------------------------------------------------------
// Formulas

/** Flesch Reading Ease (1948). Higher is easier; plain prose lands 60–70. */
export function fleschReadingEase(words: number, sentences: number, syllables: number): number {
  return 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
}

/** Flesch–Kincaid grade level (1975): the US school grade the text suits. */
export function fleschKincaidGrade(words: number, sentences: number, syllables: number): number {
  return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}

/**
 * Flesch's own bands, with readers described by age rather than by US school
 * grade so they make sense everywhere.
 */
export type ReadingBand = "very-easy" | "easy" | "fairly-easy" | "plain" | "fairly-hard" | "hard" | "very-hard";

export function readingBand(ease: number): ReadingBand {
  if (ease >= 90) return "very-easy";
  if (ease >= 80) return "easy";
  if (ease >= 70) return "fairly-easy";
  if (ease >= 60) return "plain";
  if (ease >= 50) return "fairly-hard";
  if (ease >= 30) return "hard";
  return "very-hard";
}

// ---------------------------------------------------------------------------
// Syllables

/** Words the rules below get wrong that turn up often enough to matter. */
const SYLLABLE_EXCEPTIONS: Record<string, number> = {
  area: 3,
  business: 2,
  colonel: 2,
  element: 3,
  every: 2,
  idea: 3,
  lion: 2,
  maybe: 2,
  naive: 2,
  people: 2,
  poem: 2,
  poet: 2,
  quiet: 2,
  recipe: 3,
  science: 2,
  society: 4,
  anxiety: 4,
  variety: 4,
  via: 2,
  wednesday: 2,
  different: 3,
  interesting: 3,
  evening: 2,
};

/** Compounds whose first part would otherwise lose or gain a syllable. */
const PREFIXES: [string, number][] = [
  ["every", 2],
  ["some", 1],
  ["any", 2],
];

/** Vowel pairs that are usually two syllables ("me-di-a", "ra-di-o"). */
const HIATUS = /(?<![ctsg])ia|(?<![ctsxgln])io|(?<![qg])ua|(?<!g)eo|iu|creat(?!u)/g;

function lettersOf(word: string): string {
  return word
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function ruleSyllables(w: string): number {
  if (w.length <= 3) return 1;
  let n = (w.match(/[aeiouy]+/g) ?? []).length;

  // Silent final e ("make"), but not "-le" after a consonant ("ta-ble").
  if (/[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w)) n--;
  // "-es" is silent after most consonants ("makes") but not after a hiss
  // ("boxes", "pages", "places") or in "-les" ("ta-bles").
  else if (/[^aeiouy]es$/.test(w) && !/(?:[cgsxz]|ch|sh)es$/.test(w) && !/[^aeiouy]les$/.test(w)) n--;
  // "-ed" is silent except after t or d ("jumped" vs "want-ed").
  else if (/[^aeiouy]ed$/.test(w) && !/[td]ed$/.test(w)) n--;

  // Silent e before a suffix: "state-ment", "care-ful", "safe-ly", "use-less".
  if (/[aeiou][^aeiouy]e(?:ments?|ful|fully|ness|less|ly)$/.test(w)) n--;

  // "-ing" after a vowel adds one ("go-ing", "see-ing", "say-ing").
  if (/[aeiouy]ing$/.test(w)) n++;
  // "-ier", "-iest" after a consonant ("hap-pi-er").
  if (/[^aeiouy]i(?:er|est)$/.test(w)) n++;

  n += (w.match(HIATUS) ?? []).length;
  return Math.max(1, n);
}

function lookup(w: string): number | undefined {
  if (w in SYLLABLE_EXCEPTIONS) return SYLLABLE_EXCEPTIONS[w];
  // Plurals and possessives ("people's", "ideas").
  if (w.endsWith("s") && w.slice(0, -1) in SYLLABLE_EXCEPTIONS) return SYLLABLE_EXCEPTIONS[w.slice(0, -1)];
  return undefined;
}

/**
 * Estimated English syllables in one word. A heuristic (vowel groups, silent
 * e, -le, -ed, -es, a few vowel pairs and a short exceptions list), right for
 * most everyday words and off by one now and then on unusual ones. A word with
 * no Latin letters (a number, say) counts as one.
 */
export function countSyllables(word: string): number {
  const w = lettersOf(word);
  if (!w) return 1;
  const known = lookup(w);
  if (known !== undefined) return known;
  for (const [prefix, n] of PREFIXES) {
    if (w.length > prefix.length + 1 && w.startsWith(prefix)) {
      const rest = w.slice(prefix.length);
      if (/[aeiouy]/.test(rest)) return n + (lookup(rest) ?? ruleSyllables(rest));
    }
  }
  // A final é is sounded ("ca-fé", "ré-su-mé"), unlike a silent e.
  return ruleSyllables(w) + (/é$/u.test(word.normalize("NFC").toLowerCase()) ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Whole text

export type Readability =
  /** Too little text for a fair score (includes empty). */
  | { kind: "short"; words: number }
  /** Mostly a script other than Latin; the formulas don't apply. */
  | { kind: "not-english" }
  | {
      kind: "ok";
      words: number;
      sentences: number;
      syllables: number;
      /** Unclamped; very simple or very dense text can fall outside 0–100. */
      readingEase: number;
      band: ReadingBand;
      /** Never below 0. */
      grade: number;
      avgSentenceWords: number;
      /** Letters and digits per word, punctuation left out. */
      avgWordChars: number;
      /** Words of three or more syllables. */
      hardWords: number;
      longSentences: number;
      /** The first few long sentences, cut to about SAMPLE_CHARS. */
      longSamples: { text: string; words: number }[];
    };

/** True when at least half the letters are Latin script. */
export function isMostlyLatin(text: string): boolean {
  let letters = 0;
  let latin = 0;
  for (const m of text.matchAll(/\p{L}/gu)) {
    letters++;
    if (/\p{Script=Latin}/u.test(m[0])) latin++;
  }
  return letters === 0 || latin / letters >= 0.5;
}

/** Cuts at a word boundary and adds an ellipsis. */
export function truncate(sentence: string, max = SAMPLE_CHARS): string {
  const s = sentence.replace(/\s+/gu, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/u, "")}…`;
}

export function readability(text: string): Readability {
  if (!isMostlyLatin(text)) return { kind: "not-english" };
  const total = countWords(text);
  if (total < MIN_WORDS) return { kind: "short", words: total };

  let sentences = 0;
  let words = 0;
  let syllables = 0;
  let wordChars = 0;
  let hardWords = 0;
  let longSentences = 0;
  const longSamples: { text: string; words: number }[] = [];

  for (const part of text.split(SENTENCE_BREAK)) {
    if (!HAS_WORD_CHAR.test(part)) continue;
    sentences++;
    let inSentence = 0;
    for (const token of part.split(/\s+/u)) {
      if (!HAS_WORD_CHAR.test(token)) continue;
      inSentence++;
      const s = countSyllables(token);
      syllables += s;
      if (s >= 3) hardWords++;
      wordChars += (token.match(/[\p{L}\p{M}\p{N}]/gu) ?? []).length;
    }
    words += inSentence;
    if (inSentence > LONG_SENTENCE_WORDS) {
      longSentences++;
      if (longSamples.length < MAX_LONG_SAMPLES) longSamples.push({ text: truncate(part), words: inSentence });
    }
  }

  const readingEase = fleschReadingEase(words, sentences, syllables);
  return {
    kind: "ok",
    words,
    sentences,
    syllables,
    readingEase,
    band: readingBand(readingEase),
    grade: Math.max(0, fleschKincaidGrade(words, sentences, syllables)),
    avgSentenceWords: words / sentences,
    avgWordChars: wordChars / words,
    hardWords,
    longSentences,
    longSamples,
  };
}
