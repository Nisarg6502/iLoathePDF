import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LANGUAGES } from "@iloathepdf/i18n/languages";
import { chromeManifest, firefoxManifest } from "../manifest";
import { t } from "./i18n";

const LOCALES = join(import.meta.dirname, "../../public/_locales");
type Catalog = Record<string, { message: string }>;
const read = (code: string): Catalog => JSON.parse(readFileSync(join(LOCALES, code, "messages.json"), "utf8")) as Catalog;
const placeholders = (s: string) => [...s.matchAll(/\$\d/g)].map((m) => m[0]).sort();

describe("extension catalogs (_locales)", () => {
  const english = read("en");

  it("has one catalog per app language", () => {
    expect(readdirSync(LOCALES).sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
  });

  it.each(LANGUAGES.map((l) => l.code))("%s has every key, with the same $1/$2 placeholders, and nothing empty", (code) => {
    const catalog = read(code);
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort());
    for (const [key, { message }] of Object.entries(catalog)) {
      expect(message.trim(), key).not.toBe("");
      expect(placeholders(message), key).toEqual(placeholders(english[key].message));
    }
  });

  it.each(LANGUAGES.map((l) => l.code))("%s fits the store's limits for name (75) and description (132)", (code) => {
    const catalog = read(code);
    expect([...catalog.extName.message].length).toBeLessThanOrEqual(75);
    expect([...catalog.extDescription.message].length).toBeLessThanOrEqual(132);
  });

  it("substitutes placeholders outside the extension", () => {
    expect(t("fitsUnder", "96 KB", "100 KB")).toBe("Fits: 96 KB (limit 100 KB)");
  });
});

describe("manifest", () => {
  it("asks for no host access at install and keeps the CSP to the extension's own code", () => {
    const m = chromeManifest("1.2.3");
    expect(m.permissions.sort()).toEqual(["activeTab", "contextMenus", "scripting"]);
    expect(m).not.toHaveProperty("host_permissions");
    expect(m).not.toHaveProperty("content_scripts");
    expect(m.optional_host_permissions).toEqual(["<all_urls>"]);
    expect(m.content_security_policy.extension_pages).toBe("script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");
    expect(m.version).toBe("1.2.3");
  });

  it("gives Firefox an event-page background and an add-on id", () => {
    const f = firefoxManifest("1.2.3");
    expect(f.background).toEqual({ scripts: ["background.js"] });
    expect(f.browser_specific_settings.gecko.id).toBe("extension@iloathepdf.com");
    expect(f).not.toHaveProperty("minimum_chrome_version");
    expect(f.web_accessible_resources[0]).not.toHaveProperty("use_dynamic_url");
  });
});
