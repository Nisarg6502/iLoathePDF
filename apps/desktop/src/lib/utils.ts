import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 1234567 -> "1.2 MB". Used everywhere we show file sizes. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "C:\a\b\file.pdf" -> "file.pdf" */
export function baseName(path: string): string {
  if (path.startsWith("/")) return path.slice(path.lastIndexOf("/") + 1);
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * True on a Mac. The window there keeps macOS's own close/minimise/zoom
 * buttons (see tauri.macos.conf.json), and a few messages that name Windows
 * read differently.
 */
export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);
}

export function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

// A backslash, built from its char code so no escape handling can mangle it.
const BACKSLASH = String.fromCharCode(92);

/** "/" for a macOS path ("/Users/me/x.pdf"), a backslash for a Windows one. */
export function separatorOf(path: string): string {
  return path.startsWith("/") ? "/" : BACKSLASH;
}

/**
 * A drive path ("C:" then either slash), a UNC path (two backslashes) or a
 * macOS path ("/Users/..."). Everything handed to the sidecar must be one.
 */
export function isAbsolutePath(path: string): boolean {
  const drive = /^[a-zA-Z]:/.test(path) && (path[2] === "/" || path[2] === BACKSLASH);
  return drive || path.startsWith(BACKSLASH + BACKSLASH) || path.startsWith("/");
}

/** `name` inside the folder `dir`, joined with the separator `dir` uses. A root that already ends in one is not doubled. */
export function joinPath(dir: string, name: string): string {
  const sep = separatorOf(dir);
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export function dirName(path: string): string {
  // macOS: only "/" separates (a backslash is a legal file-name character),
  // and a file at the top of the disk has "/" as its folder.
  if (path.startsWith("/")) return path.slice(0, path.lastIndexOf("/")) || "/";
  const parts = path.split(/[\\/]/);
  parts.pop();
  // A file in a drive root ("G:\a.jpg") has parent "G:", which is the current folder
  // on that drive, not the root. Keep the separator so it stays an absolute path.
  if (parts.length === 1 && /^[a-zA-Z]:$/.test(parts[0])) return parts[0] + "\\";
  return parts.join("\\");
}

// Characters Windows refuses in a file name, plus the backslash. Built from
// char codes so the set can't be mangled by string-escape handling.
const ILLEGAL_FILENAME_CHARS = new Set(['<', '>', ':', '"', '/', '|', '?', '*', String.fromCharCode(92)]);
const RESERVED_FILENAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Turns whatever the user typed in an "Output file name" box into a safe stem
 * (no extension). Falls back when nothing usable is left. Without this, a
 * name like "a/b" wrote into a sub-folder, "x:y" failed on Windows, and a
 * typed ".pdf" produced "x.pdf.pdf". Mirrors apps/web/src/lib/outputName.ts.
 */
export function safeFileStem(raw: unknown, fallback: string, ext = "pdf"): string {
  let cleaned = "";
  for (const ch of String(raw ?? "")) {
    if (ch.charCodeAt(0) < 32 || ILLEGAL_FILENAME_CHARS.has(ch)) continue;
    cleaned += ch;
  }
  cleaned = cleaned.trim();

  const suffix = `.${ext}`.toLowerCase();
  if (cleaned.toLowerCase().endsWith(suffix)) cleaned = cleaned.slice(0, -suffix.length);

  // Windows silently drops trailing dots and spaces.
  while (cleaned.endsWith(".") || cleaned.endsWith(" ")) cleaned = cleaned.slice(0, -1);
  cleaned = cleaned.slice(0, 120).trimEnd();

  // Windows treats "con.backup" as the CON device too: only the part before the first dot counts.
  if (!cleaned || RESERVED_FILENAMES.test(cleaned.split(".")[0])) return fallback;
  return cleaned;
}
