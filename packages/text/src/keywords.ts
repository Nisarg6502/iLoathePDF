/**
 * Keyword density for the word counter: which words and phrases a text leans
 * on most. Pure functions over a string, so they run in the page and in tests
 * the same way; nothing here leaves the tab.
 *
 * The rules:
 *  - a word is a run of letters, combining marks and digits (so Devanagari and
 *    Kannada words, whose vowel signs are marks, stay whole), joined by
 *    internal apostrophes or hyphens ("don't", "well-known") or, between
 *    digits, by . , or : ("3.14", "10:30"); punctuation around it is dropped;
 *  - words are compared in lower case (toLocaleLowerCase), with ’ read as ';
 *  - a phrase is 2 or 3 consecutive words that do not cross sentence or clause
 *    punctuation (. , ; : ! ? … । ॥ brackets, quotes, dashes) or a line break,
 *    so "end. Next" is not a phrase;
 *  - density is occurrences divided by the total number of words, for phrases
 *    too, which is how the common online counters report it.
 */

export type PhraseLength = 1 | 2 | 3;

export interface KeywordRow {
  phrase: string;
  count: number;
  /** count / totalWords, 0..1. */
  share: number;
}

export interface KeywordResult {
  rows: KeywordRow[];
  /** Words in the whole text (the denominator for `share`). */
  totalWords: number;
}

/** Rows shown before "Show more", and the most "Show more" reveals. */
export const DEFAULT_ROWS = 10;
export const MAX_ROWS = 25;

const W = "\\p{L}\\p{M}\\p{N}\\u200C\\u200D";
/**
 * Either a word, or one piece of punctuation that ends a phrase. Anything
 * else (spaces, stray symbols, a quote mark that is just an apostrophe) is
 * skipped.
 */
const TOKEN = new RegExp(
  `[${W}]+(?:(?:['’\\-‐]|(?<=\\p{N})[.,:](?=\\p{N}))[${W}]+)*|[.,;:!?…।॥()\\[\\]{}"“”„«»\\-–—\\n\\r]`,
  "gu",
);
const WORD_START = new RegExp(`^[${W}]`, "u");

/**
 * Common English words that say little about what a text is about. Only
 * English: for other languages "Hide common words" leaves the list as is.
 */
export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    "a about above after again against all also am an and any are aren't as at be because been before being below " +
    "between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each " +
    "either even ever every few for from further get gets got had hadn't has hasn't have haven't having he he'd " +
    "he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it " +
    "it's its itself just let's like many may me might more most much must mustn't my myself neither no nor not now " +
    "of off often on once one only or other others our ours ourselves out over own per quite rather really same " +
    "say says said shall shan't she she'd she'll she's should shouldn't since so some such than that that's the " +
    "their theirs them themselves then there there's these they they'd they'll they're they've this those though " +
    "through thus to too under until up upon us very via was wasn't we we'd we'll we're we've well were weren't " +
    "what what's when when's where where's whether which while who who's whom whose why why's will with within " +
    "without won't would wouldn't yet you you'd you'll you're you've your yours yourself yourselves"
  ).split(" "),
);

/**
 * The text as a list of lower-cased words, with `null` wherever a phrase must
 * not continue (sentence or clause punctuation, a line break). Runs of breaks
 * collapse to one.
 */
export function tokenize(text: string): (string | null)[] {
  const out: (string | null)[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const s = m[0];
    if (WORD_START.test(s)) {
      out.push(s.replace(/’/g, "'").toLocaleLowerCase());
    } else if (out.length && out[out.length - 1] !== null) {
      out.push(null);
    }
  }
  return out;
}

export function countTokenWords(tokens: readonly (string | null)[]): number {
  let n = 0;
  for (const t of tokens) if (t !== null) n++;
  return n;
}

/**
 * Most-used words (n = 1) or phrases (n = 2, 3), most frequent first; ties
 * keep the order they first appear in.
 *
 * With `hideCommon`, a single word is dropped if it is a stopword, and a
 * phrase is dropped if it starts or ends with one. That keeps "point of view"
 * and "word counter" but drops "of the", "in the market" and "the market is",
 * which are mostly fragments around a word that already shows in the 1-word
 * list.
 *
 * Words used only once say nothing about density, so they are left out as
 * soon as at least DEFAULT_ROWS entries repeat. A short text with fewer
 * repeats is topped up with once-only entries (in reading order) to
 * DEFAULT_ROWS, so it never looks empty.
 */
export function topPhrases(
  tokens: readonly (string | null)[],
  n: PhraseLength,
  { hideCommon = true, limit = MAX_ROWS }: { hideCommon?: boolean; limit?: number } = {},
): KeywordResult {
  const totalWords = countTokenWords(tokens);
  const counts = new Map<string, number>();

  // Index of the first word after the last break, so a window never spans one.
  let runStart = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === null) {
      runStart = i + 1;
      continue;
    }
    if (i - runStart + 1 < n) continue;
    const first = tokens[i - n + 1] as string;
    if (hideCommon && (STOPWORDS.has(first) || STOPWORDS.has(tok))) continue;
    const key = n === 1 ? tok : tokens.slice(i - n + 1, i + 1).join(" ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const repeated: [string, number][] = [];
  for (const entry of counts) if (entry[1] > 1) repeated.push(entry);
  // Array#sort is stable, so equal counts stay in first-seen (Map) order.
  repeated.sort((a, b) => b[1] - a[1]);

  let picked = repeated.slice(0, limit);
  if (picked.length < DEFAULT_ROWS) {
    const room = Math.min(DEFAULT_ROWS, limit) - picked.length;
    const once: [string, number][] = [];
    for (const entry of counts) {
      if (once.length >= room) break;
      if (entry[1] === 1) once.push(entry);
    }
    picked = picked.concat(once);
  }

  return {
    totalWords,
    rows: picked.map(([phrase, count]) => ({ phrase, count, share: totalWords ? count / totalWords : 0 })),
  };
}

/** Convenience: tokenize and rank in one call. */
export function keywordDensity(text: string, n: PhraseLength, options?: { hideCommon?: boolean; limit?: number }): KeywordResult {
  return topPhrases(tokenize(text), n, options);
}
