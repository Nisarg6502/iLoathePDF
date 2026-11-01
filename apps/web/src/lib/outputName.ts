const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_STEM = 120;

// Characters Windows (and therefore any download folder a user might sync to
// it) refuses in a file name, plus the backslash. Built from char codes so
// the set can't be mangled by string-escape handling.
const ILLEGAL = new Set(['<', '>', ':', '"', '/', '|', '?', '*', String.fromCharCode(92)]);

/**
 * Turns whatever the user typed into a safe file name stem (no extension).
 * Falls back to `fallback` when nothing usable is left. A trailing ".pdf"
 * the user typed themselves is dropped so we never produce "x.pdf.pdf".
 */
export function sanitizeFileStem(raw: unknown, fallback: string, ext = "pdf"): string {
  let cleaned = "";
  for (const ch of String(raw ?? "")) {
    if (ch.charCodeAt(0) < 32 || ILLEGAL.has(ch)) continue;
    cleaned += ch;
  }
  cleaned = cleaned.trim();

  const suffix = `.${ext}`.toLowerCase();
  if (cleaned.toLowerCase().endsWith(suffix)) cleaned = cleaned.slice(0, -suffix.length);

  // Windows silently drops trailing dots and spaces, so "name." would be saved as "name".
  while (cleaned.endsWith(".") || cleaned.endsWith(" ")) cleaned = cleaned.slice(0, -1);
  cleaned = cleaned.slice(0, MAX_STEM).trimEnd();

  // Windows treats "con.backup" as the CON device too: only the part before the first dot counts.
  if (!cleaned || RESERVED.test(cleaned.split(".")[0])) return fallback;
  return cleaned;
}

export function outputFileName(raw: unknown, fallback: string, ext = "pdf"): string {
  return `${sanitizeFileStem(raw, fallback, ext)}.${ext}`;
}
