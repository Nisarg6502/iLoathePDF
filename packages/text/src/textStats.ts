/**
 * Counts for the word counter. Pure functions over a string, so they run in
 * the page and in tests the same way; nothing here leaves the tab.
 *
 * The rules follow what people compare against (Microsoft Word, Google Docs):
 *  - a word is a run of non-space characters with at least one letter or
 *    digit, so "well-known" and "don't" are one word each and a lone "—" or
 *    "•" is none;
 *  - a character is what the reader sees as one (a grapheme), so an emoji or
 *    a Devanagari conjunct counts once;
 *  - a paragraph is a non-empty line;
 *  - a sentence ends at . ! ? … or a Devanagari danda followed by a space, or
 *    at a line break (headings and list items rarely end in a full stop).
 */

/** Average silent reading speed for adult readers of English non-fiction. */
export const READING_WPM = 238;
/** A comfortable presentation pace. */
export const SPEAKING_WPM = 150;

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  /** Seconds, rounded up. */
  readingSeconds: number;
  speakingSeconds: number;
}

const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;
const WHITESPACE = /\s/u;
const SENTENCE_BREAK = /(?<=[.!?…।॥]["'”’)\]]*)\s+|\n+/u;

let graphemeSegmenter: Intl.Segmenter | null | undefined;

function graphemes(text: string): string[] {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  }
  if (!graphemeSegmenter) return Array.from(text);
  return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
}

export function countWords(text: string): number {
  let n = 0;
  for (const token of text.split(/\s+/u)) if (HAS_WORD_CHAR.test(token)) n++;
  return n;
}

export function countSentences(text: string): number {
  let n = 0;
  for (const part of text.split(SENTENCE_BREAK)) if (HAS_WORD_CHAR.test(part)) n++;
  return n;
}

export function countParagraphs(text: string): number {
  let n = 0;
  for (const line of text.split(/\r\n|\r|\n/)) if (line.trim()) n++;
  return n;
}

export function textStats(text: string): TextStats {
  const chars = graphemes(text);
  let nonSpace = 0;
  for (const c of chars) if (!WHITESPACE.test(c)) nonSpace++;
  const words = countWords(text);
  return {
    words,
    characters: chars.length,
    charactersNoSpaces: nonSpace,
    sentences: countSentences(text),
    paragraphs: countParagraphs(text),
    readingSeconds: Math.ceil((words / READING_WPM) * 60),
    speakingSeconds: Math.ceil((words / SPEAKING_WPM) * 60),
  };
}

/** "0 sec", "45 sec", "3 min", "3 min 20 sec", "1 hr 5 min". */
export function formatDuration(seconds: number): { value: number; unit: "hr" | "min" | "sec" }[] {
  if (seconds < 60) return [{ value: seconds, unit: "sec" }];
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return m ? [{ value: h, unit: "hr" }, { value: m, unit: "min" }] : [{ value: h, unit: "hr" }];
  return s ? [{ value: m, unit: "min" }, { value: s, unit: "sec" }] : [{ value: m, unit: "min" }];
}
