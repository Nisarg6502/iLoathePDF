/**
 * Guard: the app's version lives in several files that must agree, and the
 * newest changelog entry (what Settings → About shows) must be that version.
 * Nothing syncs them automatically, so this fails CI instead of letting an
 * installer ship reporting one version while its release notes say another.
 *
 *   node --experimental-strip-types scripts/check-version.ts [tag]
 *
 * or: npm run check:version
 *
 * With a tag argument (e.g. "v0.2.0", as the release workflow passes), the
 * tag must also equal the version.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CHANGELOG } from "../src/lib/changelog.ts";

const root = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const read = (rel: string) => readFileSync(root(rel), "utf-8");

function match(rel: string, re: RegExp): string {
  const m = re.exec(read(rel));
  if (!m) {
    console.error(`FAIL: could not find a version in ${rel} (pattern ${re}).`);
    process.exit(1);
  }
  return m[1];
}

const sources: Record<string, string> = {
  "package.json": (JSON.parse(read("package.json")) as { version: string }).version,
  "src-tauri/tauri.conf.json": (JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string }).version,
  "src-tauri/Cargo.toml": match("src-tauri/Cargo.toml", /^version\s*=\s*"([^"]+)"/m),
  "src-tauri/Cargo.lock": match("src-tauri/Cargo.lock", /name = "iloathepdf"\r?\nversion = "([^"]+)"/),
  "sidecar/main.py": match("sidecar/main.py", /^VERSION\s*=\s*"([^"]+)"/m),
  "../../package-lock.json": (
    JSON.parse(read("../../package-lock.json")) as { packages: Record<string, { version: string }> }
  ).packages["apps/desktop"].version,
  "src/lib/changelog.ts (newest entry)": CHANGELOG[0].version,
};

const tag = process.argv[2];
if (tag) sources[`git tag ${tag}`] = tag.replace(/^v/, "");

const expected = sources["package.json"];
let failed = false;
for (const [file, version] of Object.entries(sources)) {
  if (version !== expected) {
    failed = true;
    console.error(`FAIL: ${file} says ${version}, but package.json says ${expected}.`);
  }
}

const versions = CHANGELOG.map((r) => r.version);
if (new Set(versions).size !== versions.length) {
  failed = true;
  console.error("FAIL: changelog has a duplicate version.");
}

if (failed) process.exit(1);
console.log(`OK: version ${expected} is consistent across ${Object.keys(sources).length} sources.`);
