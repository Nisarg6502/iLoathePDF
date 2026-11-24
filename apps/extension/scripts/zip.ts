/**
 * Packs dist/ into two store-ready archives (run `npm run build` first):
 *
 *   release/iloathepdf-extension-<version>-chrome.zip   Chrome and Edge
 *   release/iloathepdf-extension-<version>-firefox.zip  Firefox (event-page background, add-on id)
 *
 * Firefox can also load the .zip directly from about:debugging for testing.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { firefoxManifest } from "../src/manifest.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "release");

function walk(dir: string, files: Record<string, Uint8Array> = {}): Record<string, Uint8Array> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else files[relative(DIST, path).split("\\").join("/")] = new Uint8Array(readFileSync(path));
  }
  return files;
}

let files: Record<string, Uint8Array>;
try {
  files = walk(DIST);
} catch {
  console.error("No dist/ folder. Run `npm run build` first.");
  process.exit(1);
}
if (!files["manifest.json"]) {
  console.error("dist/manifest.json is missing. Run `npm run build` first.");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
mkdirSync(OUT, { recursive: true });

const chrome = join(OUT, `iloathepdf-extension-${version}-chrome.zip`);
writeFileSync(chrome, zipSync(files, { level: 9 }));

const firefoxFiles = { ...files, "manifest.json": new TextEncoder().encode(JSON.stringify(firefoxManifest(version), null, 2) + "\n") };
const firefox = join(OUT, `iloathepdf-extension-${version}-firefox.zip`);
writeFileSync(firefox, zipSync(firefoxFiles, { level: 9 }));

console.log(`Wrote ${relative(ROOT, chrome)} and ${relative(ROOT, firefox)}`);
