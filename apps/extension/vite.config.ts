import { defineConfig, type Plugin, type UserConfig } from "vite";
import path from "node:path";
import { readFileSync } from "node:fs";
import { chromeManifest } from "./src/manifest.ts";

/**
 * One config, three builds (see package.json "build"):
 *
 *   --mode pages       popup.html, fit.html and offscreen.html: ordinary ES-module pages with
 *                      shared chunks. These are the only places the PDF and
 *                      image engines run. Also copies public/ (icons,
 *                      _locales) and writes manifest.json.
 *   --mode content     the content script, as one classic script: content
 *                      scripts can't be ES modules, so no chunks or imports.
 *   --mode background  the background service worker, also one classic file so
 *                      the same file works as a Firefox background script.
 *
 * The engines are imported straight from apps/web/src/engines (the "@" alias is
 * what those files use for their own imports), so there is a single copy of
 * them in the repo.
 */
const WEB_SRC = path.resolve(import.meta.dirname, "../web/src");

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8")) as { version: string };

function manifest(): Plugin {
  return {
    name: "iloathepdf-manifest",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(chromeManifest(pkg.version), null, 2) + "\n",
      });
    },
  };
}

const alias = [
  { find: /^@\//, replacement: WEB_SRC + "/" },
  // compress.ts borrows one small class from ocr.ts, which also imports
  // tesseract.js. OCR isn't part of the extension, so its library (and the
  // CDN URLs it carries as defaults) is swapped for a stub that only throws.
  // Nothing in the extension calls it.
  { find: /^tesseract\.js$/, replacement: path.resolve(import.meta.dirname, "src/stubs/tesseract.ts") },
];

export default defineConfig(({ mode }): UserConfig => {
  if (mode === "content" || mode === "background") {
    const entry = mode === "content" ? "src/content/content.ts" : "src/background/background.ts";
    return {
      resolve: { alias },
      publicDir: false,
      build: {
        outDir: "dist",
        emptyOutDir: false,
        sourcemap: false,
        target: "es2022",
        lib: {
          entry: path.resolve(import.meta.dirname, entry),
          formats: ["iife"],
          name: mode === "content" ? "iloathepdfContent" : "iloathepdfBackground",
          fileName: () => `${mode}.js`,
        },
      },
    };
  }

  return {
    base: "./",
    resolve: { alias },
    plugins: [manifest()],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      target: "es2022",
      // pdf.js and pdf-lib are big; they load only in the popup and the
      // fitter, never in web pages.
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        input: {
          popup: path.resolve(import.meta.dirname, "popup.html"),
          fit: path.resolve(import.meta.dirname, "fit.html"),
          offscreen: path.resolve(import.meta.dirname, "offscreen.html"),
        },
      },
    },
  };
});
