/**
 * Reads a file size limit out of the text a form shows next to an upload
 * field: "Max 200 KB", "Size should be less than 100 kb", "between 20KB and
 * 50KB", "2MB max", "File must not exceed 1.5 MB" and so on.
 *
 * Units: a "KB" on a form may be checked as 1000 or as 1024 bytes, and we
 * can't know which. So a maximum is read in decimal units (100 KB = 100,000
 * bytes) and a minimum in binary units (20 KB = 20,480 bytes); a file that
 * meets both readings passes either check. KiB/MiB are always binary.
 */

export interface SizeLimit {
  maxBytes?: number;
  minBytes?: number;
  /** The words the limit was read from, to show the user ("Max 200 KB"). */
  evidence?: string;
}

const UNITS: Record<string, [decimal: number, binary: number]> = {
  b: [1, 1],
  byte: [1, 1],
  bytes: [1, 1],
  k: [1000, 1024],
  kb: [1000, 1024],
  kbs: [1000, 1024],
  kbytes: [1000, 1024],
  kilobyte: [1000, 1024],
  kilobytes: [1000, 1024],
  kib: [1024, 1024],
  m: [1e6, 1048576],
  mb: [1e6, 1048576],
  mbs: [1e6, 1048576],
  mbytes: [1e6, 1048576],
  megabyte: [1e6, 1048576],
  megabytes: [1e6, 1048576],
  mib: [1048576, 1048576],
  gb: [1e9, 1073741824],
  gigabyte: [1e9, 1073741824],
  gigabytes: [1e9, 1073741824],
  gib: [1073741824, 1073741824],
};

// Longest first so "kbytes" wins over "kb" and "kb" over "k".
const UNIT_ALT = Object.keys(UNITS)
  .sort((a, b) => b.length - a.length)
  .join("|");

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(${UNIT_ALT})`;
// A number may not continue a word or another number ("A4", "x2", "1.2.3").
const NUM_START = String.raw`(?<![\w.,])`;
// The unit may not run on into a word ("5 kbps", "10 minutes", "2 Megapixels").
const UNIT_END = String.raw`(?![a-z])`;

const SINGLE = new RegExp(`${NUM_START}${NUM}(\\s*)${UNIT}${UNIT_END}`, "gi");
const RANGE = new RegExp(
  `${NUM_START}${NUM}(?:(\\s*)${UNIT})?\\s*(?:-|–|—|~|to|and)\\s*${NUM}(\\s*)${UNIT}${UNIT_END}`,
  "gi",
);

type Kind = "max" | "min";

// Words before a size that say which way the limit goes. When two cues end
// at the same place the longer one wins, so "not more than" (max) beats
// "more than" (min) and "not below" (min) beats "below" (max).
//
// The third field marks comparisons that describe the files rather than the
// rule: "larger than 2 MB" is a minimum, unless the sentence goes on to
// reject them ("Files larger than 2 MB will be rejected"), which makes it a
// maximum. "exceed" is a maximum either way ("must not exceed", "files
// exceeding 2 MB are rejected").
const CUES_BEFORE: [RegExp, Kind, boolean][] = [
  [/\bmax(?:imum|imal)?\b\.?/g, "max", false],
  [/\bup\s*to\b/g, "max", false],
  [/\b(?:less|lesser|smaller|lower)\s+than(?:\s+or\s+equal\s+to)?\b/g, "max", true],
  [/\b(?:below|under|beneath)\b/g, "max", true],
  [/\bwithin\b/g, "max", false],
  [/\bexceed(?:s|ing)?\b/g, "max", false],
  [/\bat\s+most\b/g, "max", false],
  [/\blimit(?:ed)?(?:\s+to)?\b/g, "max", false],
  [/\b(?:not|never|no)\s+(?:be\s+)?(?:more|greater|larger|bigger|higher)\s+than\b/g, "max", false],
  [/\bnot\s+(?:be\s+)?(?:above|over)\b/g, "max", false],
  [/(?:<=?|≤|=<)/g, "max", true],
  [/\bmin(?:imum|imal)?\b\.?/g, "min", false],
  [/\bat\s+least\b/g, "min", false],
  [/\b(?:more|greater|larger|bigger|higher)\s+than(?:\s+or\s+equal\s+to)?\b/g, "min", true],
  [/\b(?:above|over)\b/g, "min", true],
  [/\b(?:not|never|no)\s+(?:be\s+)?(?:less|lesser|smaller|lower)\s+than\b/g, "min", false],
  [/\bnot\s+(?:be\s+)?(?:below|under)\b/g, "min", false],
  [/(?:>=?|≥|=>)/g, "min", true],
];

// "... will be rejected", "are not accepted", "is not allowed".
const REJECTED_AFTER = /^[^.;!?]{0,30}?\b(?:(?:will|would|shall)\s+(?:not\s+be\s+(?:accepted|allowed|uploaded)|be\s+(?:rejected|refused|ignored))|(?:are|is)\s+not\s+(?:accepted|allowed|supported|permitted)|(?:are|is)\s+(?:rejected|refused)|won'?t\s+be\s+(?:accepted|uploaded)|(?:can|could)\s*not\s+be\s+uploaded|not\s+allowed)\b/;

// Words right after a size: "2MB max", "50 KB (maximum)", "10 KB or more".
const CUE_AFTER_MAX = /^\s*[(\[]?\s*(?:max(?:imum)?\b|or\s+(?:less|below|smaller|lower|under)\b|limit\b|at\s+most\b)/i;
const CUE_AFTER_MIN = /^\s*[(\[]?\s*(?:min(?:imum)?\b|or\s+(?:more|above|larger|greater|higher|bigger)\b|at\s+least\b)/i;

// Where a clause ends, so a cue in the previous clause doesn't leak into the
// next one ("Minimum 600 x 600 pixels, 2MB" is not a 2MB minimum). A dot after
// "max"/"min" is an abbreviation, not the end of a sentence.
const CLAUSE_END = /(?<!\b(?:max|min|approx|ca))[.!?;,|•](?=\s|$)|[\n\r]/gi;

const LOOKBACK = 48;

function toNumber(raw: string): number {
  // "1,5" is a decimal comma; "1,024" is a thousands separator.
  if (/^\d+,\d{3}$/.test(raw)) return Number(raw.replace(",", ""));
  return Number(raw.replace(",", "."));
}

function bytes(value: string, unit: string, kind: Kind): number {
  const [decimal, binary] = UNITS[unit.toLowerCase()];
  return Math.round(toNumber(value) * (kind === "max" ? decimal : binary));
}

/** A single letter unit ("200k", "2M", "500b") must touch its number. */
function unitAllowed(space: string | undefined, unit: string | undefined): boolean {
  return !unit || unit.length > 1 || !space;
}

interface Mention {
  start: number;
  end: number;
  value: string;
  unit: string;
}

function clauseStart(text: string, before: number, floor: number): number {
  let start = Math.max(floor, before - LOOKBACK);
  CLAUSE_END.lastIndex = 0;
  for (const m of text.slice(0, before).matchAll(CLAUSE_END)) {
    const after = (m.index ?? 0) + m[0].length;
    if (after > start) start = after;
  }
  return start;
}

function cueBefore(window: string, after: string): Kind | null {
  let best: { end: number; length: number; kind: Kind; invertible: boolean } | null = null;
  for (const [re, kind, invertible] of CUES_BEFORE) {
    re.lastIndex = 0;
    for (const m of window.matchAll(re)) {
      const end = (m.index ?? 0) + m[0].length;
      if (!best || end > best.end || (end === best.end && m[0].length > best.length)) {
        best = { end, length: m[0].length, kind, invertible };
      }
    }
  }
  if (!best) return null;
  if (best.invertible && REJECTED_AFTER.test(after)) return best.kind === "max" ? "min" : "max";
  return best.kind;
}

function cueAfter(text: string): Kind | null {
  if (CUE_AFTER_MAX.test(text)) return "max";
  if (CUE_AFTER_MIN.test(text)) return "min";
  return null;
}

function snippet(text: string, start: number, end: number): string {
  return text.slice(start, end).replace(/\s+/g, " ").trim().replace(/^[,;:.\-–(\s]+/, "");
}

/** Finds the size limit stated in `text`, or an empty object when there is none. */
export function parseSizeLimit(input: string): SizeLimit {
  const text = input.replace(/ /g, " ");
  const lower = text.toLowerCase();
  const taken: [number, number][] = [];
  const maxes: { bytes: number; evidence: string }[] = [];
  const mins: { bytes: number; evidence: string }[] = [];
  const unknown: { bytes: number; evidence: string }[] = [];

  // Ranges first: "20KB - 50KB", "between 20 and 50 kb", "10 KB to 1 MB".
  RANGE.lastIndex = 0;
  for (const m of text.matchAll(RANGE)) {
    const [whole, a, spaceA, unitA, b, spaceB, unitB] = m;
    if (!unitAllowed(spaceA, unitA) || !unitAllowed(spaceB, unitB)) continue;
    const start = m.index ?? 0;
    const lo = bytes(a, unitA ?? unitB, "min");
    const hi = bytes(b, unitB, "max");
    const loMax = bytes(a, unitA ?? unitB, "max");
    if (loMax >= hi) continue; // "5 MB to 2 MB" isn't a range we understand
    taken.push([start, start + whole.length]);
    const from = clauseStart(lower, start, 0);
    const evidence = snippet(text, from, start + whole.length);
    mins.push({ bytes: lo, evidence });
    maxes.push({ bytes: hi, evidence });
  }

  const mentions: Mention[] = [];
  SINGLE.lastIndex = 0;
  for (const m of text.matchAll(SINGLE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (taken.some(([s, e]) => start < e && end > s)) continue;
    if (!unitAllowed(m[2], m[3])) continue;
    mentions.push({ start, end, value: m[1], unit: m[3] });
  }

  let previousEnd = 0;
  for (const mention of mentions) {
    const from = clauseStart(lower, mention.start, previousEnd);
    const following = lower.slice(mention.end, mention.end + 60);
    const kind = cueBefore(lower.slice(from, mention.start), following) ?? cueAfter(following);
    const after = following.match(CUE_AFTER_MAX) ?? following.match(CUE_AFTER_MIN);
    const evidenceEnd = after ? mention.end + after[0].length : mention.end;
    const evidence = snippet(text, from, evidenceEnd).replace(/[(\[]\s*$/, "").trim();
    const entry = { bytes: bytes(mention.value, mention.unit, kind ?? "max"), evidence };
    if (kind === "max") maxes.push(entry);
    else if (kind === "min") mins.push({ ...entry, bytes: bytes(mention.value, mention.unit, "min") });
    else unknown.push(entry);
    previousEnd = mention.end;
  }

  // A bare size next to an upload field ("Photo (100 KB)") is a maximum.
  if (maxes.length === 0 && unknown.length > 0) maxes.push(...unknown);

  const result: SizeLimit = {};
  const evidence: string[] = [];
  if (maxes.length > 0) {
    // Several maxima for one field: the smallest satisfies all of them.
    const max = maxes.reduce((a, b) => (b.bytes < a.bytes ? b : a));
    result.maxBytes = max.bytes;
    evidence.push(max.evidence);
  }
  if (mins.length > 0) {
    const min = mins.reduce((a, b) => (b.bytes > a.bytes ? b : a));
    if (result.maxBytes === undefined || min.bytes < result.maxBytes) {
      result.minBytes = min.bytes;
      if (!evidence.includes(min.evidence)) evidence.unshift(min.evidence);
    }
  }
  if (evidence.length > 0) result.evidence = evidence.join(" · ");
  return result;
}

/**
 * Reads a size from an attribute such as data-max-size="2MB" or
 * data-max-file-size="204800". A bare number counts as bytes (what
 * File.size is measured in) unless the attribute's name says KB or MB.
 */
export function parseSizeAttribute(name: string, value: string, kind: Kind): number | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (!(n > 0)) return undefined;
    const lowerName = name.toLowerCase();
    if (/kb|kilo/.test(lowerName)) return Math.round(n * (kind === "max" ? 1000 : 1024));
    if (/mb|mega/.test(lowerName)) return Math.round(n * (kind === "max" ? 1e6 : 1048576));
    return Math.round(n);
  }
  const parsed = parseSizeLimit(`${kind} ${v}`);
  return kind === "max" ? parsed.maxBytes : parsed.minBytes;
}

export type FormatWord = "jpeg" | "png" | "webp" | "pdf" | "gif" | "heic" | "bmp" | "tiff" | "doc";

const FORMAT_WORDS: [RegExp, FormatWord][] = [
  [/(?<![a-z])\.?(?:jpe?g|jfif)(?![a-z])/gi, "jpeg"],
  [/(?<![a-z])\.?png(?![a-z])/gi, "png"],
  [/(?<![a-z])\.?webp(?![a-z])/gi, "webp"],
  [/(?<![a-z])\.?pdf(?![a-z])/gi, "pdf"],
  [/(?<![a-z])\.?gif(?![a-z])/gi, "gif"],
  [/(?<![a-z])\.?hei[cf](?![a-z])/gi, "heic"],
  [/(?<![a-z])\.?bmp(?![a-z])/gi, "bmp"],
  [/(?<![a-z])\.?tiff?(?![a-z])/gi, "tiff"],
  [/(?<![a-z])\.?docx?(?![a-z])/gi, "doc"],
];

/** File formats the text mentions ("JPG/JPEG only", "Upload PDF"), in first-mentioned order. */
export function parseFormats(text: string): FormatWord[] {
  const found: { at: number; format: FormatWord }[] = [];
  for (const [re, format] of FORMAT_WORDS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) found.push({ at: m.index, format });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.format);
}
