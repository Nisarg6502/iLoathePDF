/**
 * Word-level text comparison for the "Compare texts" page. Pure functions
 * over two strings; nothing here leaves the tab.
 *
 * How it works:
 *  1. Tokenize each text into words (letters, digits and marks, with inner
 *     apostrophes so "don't" stays whole), single punctuation characters,
 *     runs of spaces/tabs, and line breaks (one token each). Joining the
 *     tokens gives back the exact text, so paragraphs render as typed.
 *  2. Turn each token into a comparison key (lowercased for "ignore case";
 *     every whitespace token the same key for "ignore extra spaces") and
 *     intern the keys as integers so comparing two tokens is one `===`.
 *  3. Trim the common prefix and suffix, which is most of the text when
 *     comparing two drafts of the same document.
 *  4. Run Myers' O(ND) diff (linear-space, middle-snake version) on what
 *     is left. Its cost grows with the number of edits D, not just the
 *     length, so it is fast on similar texts. Every step is charged to a work budget; if the texts are so
 *     different that the budget runs out, the word-level attempt is dropped
 *     and we fall back to:
 *  5. a Myers diff of whole lines, then a word-level diff inside each block
 *     of changed lines (sharing a second budget). A block that still cannot
 *     be compared within budget is shown as removed-then-added whole. The
 *     total work is therefore bounded, so a 20k-word paste cannot freeze
 *     the tab, and `approximate` tells the page when step 5 kicked in.
 *  6. Clean up for reading: consecutive changes become one hunk (all
 *     removals, then all additions), a lone space between two changes is
 *     folded into them ("quick brown" → "slow red" rather than four
 *     fragments), and with "ignore extra spaces" a hunk that only changes
 *     whitespace counts as unchanged.
 */

export interface DiffOptions {
  ignoreCase?: boolean;
  ignoreSpace?: boolean;
}

export type DiffPart =
  /** `text` is the changed side; `original` the same stretch in the original, which can differ when case or spacing is ignored. */
  | { op: "equal"; text: string; original: string }
  | { op: "delete"; text: string }
  | { op: "insert"; text: string };

export interface DiffResult {
  parts: DiffPart[];
  /** Words in the added stretches. */
  wordsAdded: number;
  /** Words in the removed stretches. */
  wordsRemoved: number;
  /** Separate places where the texts differ. */
  changes: number;
  identical: boolean;
  /** True when the texts were too different for a full word-level comparison and some blocks are shown whole. */
  approximate: boolean;
}

const TOKEN = /\r\n|\n|\r|[^\S\r\n]+|[\p{L}\p{N}\p{M}_]+(?:['’][\p{L}\p{N}\p{M}_]+)*|[^\s\p{L}\p{N}\p{M}_]/gu;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;
const IS_SPACE = /^\s+$/u;
const IS_NEWLINE = /^(?:\r\n|\n|\r)$/;

/** Work units (loop steps) one Myers attempt may spend before giving up. */
const WORD_BUDGET = 10_000_000;
/** Work units shared by the line-level fallback and the word diffs inside its blocks. */
const FALLBACK_BUDGET = 6_000_000;

export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

function countWords(text: string): number {
  let n = 0;
  for (const token of text.split(/\s+/u)) if (HAS_WORD_CHAR.test(token)) n++;
  return n;
}

const Op = { Equal: 0, Delete: 1, Insert: 2 } as const;

/** Edit script as runs: [op, length, op, length, ...] in order. */
class Script {
  runs: number[] = [];
  push(op: number, n: number) {
    if (n <= 0) return;
    const r = this.runs;
    if (r.length && r[r.length - 2] === op) r[r.length - 1] += n;
    else r.push(op, n);
  }
}

interface Budget {
  left: number;
}

/**
 * Myers' O(ND) diff between a[aLo, aHi) and b[bLo, bHi), in linear space:
 * strip the common prefix and suffix, find the "middle snake" by running
 * the greedy search from both ends at once, then recurse on each half (the
 * same scheme as diff-match-patch's bisect). Memory stays O(N + M) however
 * different the texts are. Every loop step is charged to the budget; when it
 * runs out this returns false, possibly after writing part of the script, so
 * callers pass a fresh Script and only keep it on success.
 */
function myers(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number, budget: Budget, out: Script): boolean {
  let pre = 0;
  while (aLo + pre < aHi && bLo + pre < bHi && a[aLo + pre] === b[bLo + pre]) pre++;
  let suf = 0;
  while (suf < aHi - aLo - pre && suf < bHi - bLo - pre && a[aHi - 1 - suf] === b[bHi - 1 - suf]) suf++;
  budget.left -= pre + suf + 1;
  out.push(Op.Equal, pre);
  if (!bisect(a, aLo + pre, aHi - suf, b, bLo + pre, bHi - suf, budget, out)) return false;
  out.push(Op.Equal, suf);
  return true;
}

function bisect(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number, budget: Budget, out: Script): boolean {
  const n = aHi - aLo;
  const m = bHi - bLo;
  if (n === 0 || m === 0) {
    out.push(Op.Delete, n);
    out.push(Op.Insert, m);
    return true;
  }
  const maxD = Math.ceil((n + m) / 2);
  const vOffset = maxD;
  const vLength = 2 * maxD;
  const v1 = new Int32Array(vLength).fill(-1);
  const v2 = new Int32Array(vLength).fill(-1);
  v1[vOffset + 1] = 0;
  v2[vOffset + 1] = 0;
  const delta = n - m;
  // With an odd delta the paths meet while extending forwards; with an even one, backwards.
  const front = delta % 2 !== 0;
  let k1start = 0;
  let k1end = 0;
  let k2start = 0;
  let k2end = 0;
  for (let d = 0; d < maxD; d++) {
    let work = 0;
    for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      const k1o = vOffset + k1;
      let x1 = k1 === -d || (k1 !== d && v1[k1o - 1] < v1[k1o + 1]) ? v1[k1o + 1] : v1[k1o - 1] + 1;
      let y1 = x1 - k1;
      const x0 = x1;
      while (x1 < n && y1 < m && a[aLo + x1] === b[bLo + y1]) {
        x1++;
        y1++;
      }
      work += x1 - x0 + 1;
      v1[k1o] = x1;
      if (x1 > n) k1end += 2;
      else if (y1 > m) k1start += 2;
      else if (front) {
        const k2o = vOffset + delta - k1;
        if (k2o >= 0 && k2o < vLength && v2[k2o] !== -1 && x1 >= n - v2[k2o]) {
          budget.left -= work;
          return split(a, aLo, aHi, b, bLo, bHi, x1, y1, budget, out);
        }
      }
    }
    for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      const k2o = vOffset + k2;
      let x2 = k2 === -d || (k2 !== d && v2[k2o - 1] < v2[k2o + 1]) ? v2[k2o + 1] : v2[k2o - 1] + 1;
      let y2 = x2 - k2;
      const x0 = x2;
      while (x2 < n && y2 < m && a[aHi - 1 - x2] === b[bHi - 1 - y2]) {
        x2++;
        y2++;
      }
      work += x2 - x0 + 1;
      v2[k2o] = x2;
      if (x2 > n) k2end += 2;
      else if (y2 > m) k2start += 2;
      else if (!front) {
        const k1o = vOffset + delta - k2;
        if (k1o >= 0 && k1o < vLength && v1[k1o] !== -1) {
          const x1 = v1[k1o];
          const y1 = vOffset + x1 - k1o;
          if (x1 >= n - x2) {
            budget.left -= work;
            return split(a, aLo, aHi, b, bLo, bHi, x1, y1, budget, out);
          }
        }
      }
    }
    budget.left -= work;
    if (budget.left < 0) return false;
  }
  // Nothing in common.
  out.push(Op.Delete, n);
  out.push(Op.Insert, m);
  return true;
}

function split(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number, x: number, y: number, budget: Budget, out: Script): boolean {
  return myers(a, aLo, aLo + x, b, bLo, bLo + y, budget, out) && myers(a, aLo + x, aHi, b, bLo + y, bHi, budget, out);
}

function intern(keys: string[], table: Map<string, number>): Int32Array {
  const ids = new Int32Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    let id = table.get(keys[i]);
    if (id === undefined) {
      id = table.size;
      table.set(keys[i], id);
    }
    ids[i] = id;
  }
  return ids;
}

/** Token index where each line starts, plus a final entry for the end. */
function lineStarts(tokens: string[], lo: number, hi: number): number[] {
  const starts = [lo];
  for (let i = lo; i < hi; i++) if (IS_NEWLINE.test(tokens[i]) && i + 1 < hi) starts.push(i + 1);
  starts.push(hi);
  return starts;
}

/** Fallback: diff lines, then words inside each block of changed lines. */
function lineDiff(
  aTok: string[],
  aKeys: string[],
  aIds: Int32Array,
  aLo: number,
  aHi: number,
  bTok: string[],
  bKeys: string[],
  bIds: Int32Array,
  bLo: number,
  bHi: number,
  ignoreSpace: boolean,
  out: Script,
): void {
  const aStarts = lineStarts(aTok, aLo, aHi);
  const bStarts = lineStarts(bTok, bLo, bHi);
  const lineKey = (keys: string[], from: number, to: number) => {
    let s = "";
    for (let i = from; i < to; i++) if (!(ignoreSpace && IS_SPACE.test(keys[i]))) s += keys[i] + "\u0000";
    return s;
  };
  const table = new Map<string, number>();
  const aLines = intern(
    aStarts.slice(0, -1).map((s, i) => lineKey(aKeys, s, aStarts[i + 1])),
    table,
  );
  const bLines = intern(
    bStarts.slice(0, -1).map((s, i) => lineKey(bKeys, s, bStarts[i + 1])),
    table,
  );
  const budget: Budget = { left: FALLBACK_BUDGET };
  const lines = new Script();
  if (!myers(aLines, 0, aLines.length, bLines, 0, bLines.length, budget, lines)) {
    out.push(Op.Delete, aHi - aLo);
    out.push(Op.Insert, bHi - bLo);
    return;
  }

  // Diff a block of tokens word by word, or replace it whole if over budget.
  const block = (a0: number, a1: number, b0: number, b1: number) => {
    const sub = new Script();
    // The whole range already failed at word level; don't pay for it twice.
    const whole = a0 === aLo && a1 === aHi && b0 === bLo && b1 === bHi;
    if (!whole && myers(aIds, a0, a1, bIds, b0, b1, budget, sub)) {
      for (let i = 0; i < sub.runs.length; i += 2) out.push(sub.runs[i], sub.runs[i + 1]);
    } else {
      budget.left = Math.max(budget.left, 0);
      out.push(Op.Delete, a1 - a0);
      out.push(Op.Insert, b1 - b0);
    }
  };

  let al = 0;
  let bl = 0;
  const r = lines.runs;
  for (let i = 0; i < r.length; ) {
    if (r[i] === Op.Equal) {
      // Lines equal by key; tokens can still differ in whitespace when it is ignored.
      for (let j = 0; j < r[i + 1]; j++, al++, bl++) {
        const a0 = aStarts[al];
        const a1 = aStarts[al + 1];
        const b0 = bStarts[bl];
        const b1 = bStarts[bl + 1];
        let same = a1 - a0 === b1 - b0;
        for (let t = 0; same && t < a1 - a0; t++) same = aIds[a0 + t] === bIds[b0 + t];
        if (same) out.push(Op.Equal, a1 - a0);
        else block(a0, a1, b0, b1);
      }
      i += 2;
    } else {
      let dl = 0;
      let il = 0;
      while (i < r.length && r[i] !== Op.Equal) {
        if (r[i] === Op.Delete) dl += r[i + 1];
        else il += r[i + 1];
        i += 2;
      }
      block(aStarts[al], aStarts[al + dl], bStarts[bl], bStarts[bl + il]);
      al += dl;
      bl += il;
    }
  }
}

interface Segment {
  equal: boolean;
  text: string;
  original: string;
}

export function diffTexts(original: string, changed: string, options: DiffOptions = {}): DiffResult {
  const { ignoreCase = false, ignoreSpace = false } = options;
  const aTok = tokenize(original);
  const bTok = tokenize(changed);
  const key = (t: string) => (ignoreSpace && IS_SPACE.test(t) ? " " : ignoreCase ? t.toLowerCase() : t);
  const aKeys = aTok.map(key);
  const bKeys = bTok.map(key);
  const table = new Map<string, number>();
  const aIds = intern(aKeys, table);
  const bIds = intern(bKeys, table);

  // Common prefix and suffix.
  let pre = 0;
  const minLen = Math.min(aIds.length, bIds.length);
  while (pre < minLen && aIds[pre] === bIds[pre]) pre++;
  let suf = 0;
  while (suf < minLen - pre && aIds[aIds.length - 1 - suf] === bIds[bIds.length - 1 - suf]) suf++;

  const script = new Script();
  script.push(Op.Equal, pre);
  let approximate = false;
  const aHi = aIds.length - suf;
  const bHi = bIds.length - suf;
  const middle = new Script();
  if (myers(aIds, pre, aHi, bIds, pre, bHi, { left: WORD_BUDGET }, middle)) {
    for (let i = 0; i < middle.runs.length; i += 2) script.push(middle.runs[i], middle.runs[i + 1]);
  } else {
    approximate = true;
    lineDiff(aTok, aKeys, aIds, pre, aHi, bTok, bKeys, bIds, pre, bHi, ignoreSpace, script);
  }
  script.push(Op.Equal, suf);

  // Runs → segments: equal stretches and change hunks (removals first).
  const segments: Segment[] = [];
  let ai = 0;
  let bi = 0;
  const r = script.runs;
  for (let i = 0; i < r.length; ) {
    if (r[i] === Op.Equal) {
      const n = r[i + 1];
      segments.push({ equal: true, text: bTok.slice(bi, bi + n).join(""), original: aTok.slice(ai, ai + n).join("") });
      ai += n;
      bi += n;
      i += 2;
      continue;
    }
    let del = "";
    let ins = "";
    while (i < r.length && r[i] !== Op.Equal) {
      const n = r[i + 1];
      if (r[i] === Op.Delete) {
        del += aTok.slice(ai, ai + n).join("");
        ai += n;
      } else {
        ins += bTok.slice(bi, bi + n).join("");
        bi += n;
      }
      i += 2;
    }
    segments.push({ equal: false, text: ins, original: del });
  }

  // Fold a lone space between two changes into one hunk, when that hunk ends up with both removals and additions.
  const folded: Segment[] = [];
  for (const seg of segments) {
    const prev = folded[folded.length - 1];
    const gap = folded[folded.length - 2];
    if (
      !seg.equal &&
      prev?.equal &&
      gap &&
      !gap.equal &&
      IS_SPACE.test(prev.original) &&
      IS_SPACE.test(prev.text) &&
      !/[\r\n]/.test(prev.original + prev.text) &&
      (gap.original || seg.original) &&
      (gap.text || seg.text)
    ) {
      folded.pop();
      gap.original += prev.original + seg.original;
      gap.text += prev.text + seg.text;
      continue;
    }
    folded.push({ ...seg });
  }

  // With "ignore extra spaces", a hunk that only changes whitespace is not a change.
  const merged: Segment[] = [];
  for (const seg of folded) {
    const equal = seg.equal || (ignoreSpace && !seg.text.trim() && !seg.original.trim());
    const prev = merged[merged.length - 1];
    if (equal && prev?.equal) {
      prev.text += seg.text;
      prev.original += seg.original;
    } else merged.push({ ...seg, equal });
  }

  const parts: DiffPart[] = [];
  let wordsAdded = 0;
  let wordsRemoved = 0;
  let changes = 0;
  for (const seg of merged) {
    if (seg.equal) {
      if (seg.text || seg.original) parts.push({ op: "equal", text: seg.text, original: seg.original });
      continue;
    }
    changes++;
    if (seg.original) {
      parts.push({ op: "delete", text: seg.original });
      wordsRemoved += countWords(seg.original);
    }
    if (seg.text) {
      parts.push({ op: "insert", text: seg.text });
      wordsAdded += countWords(seg.text);
    }
  }

  return { parts, wordsAdded, wordsRemoved, changes, identical: changes === 0, approximate };
}
