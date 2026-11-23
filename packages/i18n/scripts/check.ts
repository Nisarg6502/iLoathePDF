/**
 * Checks the translation catalogs against the strings the apps actually use.
 *
 *   npm run check --workspace=packages/i18n          (CI runs this)
 *   npm run missing --workspace=packages/i18n -- hi  (prints what is left to translate)
 *
 * A string counts as "used" when the source passes it to t("...") or
 * msg("..."), or when it is a user-facing field of a tool registry (listed in
 * REGISTRY_FIELDS; those tables are plain data, so wrapping every entry in
 * msg() would be noise).
 *
 * Fails on:
 *  - a catalog that is not a flat JSON object of strings,
 *  - an entry whose key is no longer used anywhere (the English changed, so
 *    the old translation would silently never show again),
 *  - a translation that uses a {{placeholder}} its English doesn't have,
 *    which would print literally.
 *
 * Untranslated strings are only reported: they show in English until someone
 * translates them, which is the intended way to ship a partial language.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../../../", import.meta.url).pathname;
const LOCALES = new URL("../locales/", import.meta.url).pathname;
const SOURCE_DIRS = ["apps/web/src", "apps/desktop/src"];

const REGISTRY_FIELDS: Record<string, string[]> = {
  "apps/web/src/tools/registry.tsx": ["name", "description", "desktopOnlyNote"],
  "apps/desktop/src/lib/tools.ts": ["title", "description"],
};

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const STRING = String.raw`("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\x60(?:[^\x60\\$]|\\.)*\x60)`;
const CALL = new RegExp(String.raw`(?<![\w.$])(?:t|i18n\.t|msg)\(\s*` + STRING, "g");
const TRANS_KEY = new RegExp(String.raw`\bi18nKey=` + STRING, "g");

function unquote(literal: string): string {
  const body = literal.slice(1, -1);
  if (literal[0] === '"') return JSON.parse(literal) as string;
  // Single-quoted and template literals: undo the escapes JSON understands.
  return JSON.parse(`"${body.replace(/\\(['\x60])/g, "$1").replace(/"/g, '\\"')}"`) as string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "__fixtures__" && name !== "node_modules") walk(path, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>(); // key -> first file that uses it
  const add = (key: string, file: string) => {
    if (!keys.has(key)) keys.set(key, relative(ROOT, file));
  };
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const text = readFileSync(file, "utf8");
      for (const re of [CALL, TRANS_KEY]) {
        for (const m of text.matchAll(re)) add(unquote(m[1]), file);
      }
    }
  }
  for (const [file, fields] of Object.entries(REGISTRY_FIELDS)) {
    const text = readFileSync(join(ROOT, file), "utf8");
    const re = new RegExp(String.raw`\b(?:${fields.join("|")}):\s*` + STRING, "g");
    for (const m of text.matchAll(re)) add(unquote(m[1]), join(ROOT, file));
  }
  return keys;
}

function placeholders(s: string): Set<string> {
  return new Set([...s.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]));
}

function loadCatalog(file: string, errors: string[]): Record<string, string> {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(join(LOCALES, file), "utf8"));
  } catch (e) {
    errors.push(`${file}: not valid JSON (${(e as Error).message})`);
    return {};
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    errors.push(`${file}: must be a JSON object`);
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== "string") errors.push(`${file}: "${k}" must map to a string`);
    else out[k] = v;
  }
  return out;
}

const used = usedKeys();
const errors: string[] = [];
const catalogs = readdirSync(LOCALES).filter((f) => f.endsWith(".json")).sort();
const missingFor = process.argv.includes("--missing") ? process.argv[process.argv.indexOf("--missing") + 1] : null;

for (const file of catalogs) {
  const code = file.replace(/\.json$/, "");
  const catalog = loadCatalog(file, errors);

  for (const [key, value] of Object.entries(catalog)) {
    const base = key.replace(PLURAL_SUFFIX, "");
    if (!used.has(key) && !used.has(base)) {
      errors.push(`${file}: "${key}" is not used anywhere. Remove it, or update it to the new English.`);
      continue;
    }
    const allowed = placeholders(base);
    if (base !== key) allowed.add("count");
    for (const p of placeholders(value)) {
      if (!allowed.has(p)) errors.push(`${file}: "${key}" uses {{${p}}}, which its English doesn't have.`);
    }
  }

  if (code === "en") {
    console.log(`en: source language, ${Object.keys(catalog).length} plural entries`);
    continue;
  }

  const missing = [...used.keys()].filter(
    (key) => !catalog[key] && !Object.keys(catalog).some((k) => k.replace(PLURAL_SUFFIX, "") === key && catalog[k]),
  );
  const done = used.size - missing.length;
  console.log(`${code}: ${done} of ${used.size} strings translated (${Math.round((done / used.size) * 100)}%)`);

  if (missingFor === code) {
    const skeleton = Object.fromEntries(missing.sort().map((k) => [k, ""]));
    console.log(JSON.stringify(skeleton, null, 2));
  }
}

if (missingFor && !catalogs.includes(`${missingFor}.json`)) {
  errors.push(`No catalog locales/${missingFor}.json. Create it with {} to start a new language.`);
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
