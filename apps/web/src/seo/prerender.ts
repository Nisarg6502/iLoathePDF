/**
 * Build step, run after `vite build` (see package.json):
 *
 *   vite build --ssr src/seo/prerender.ts --outDir dist-ssr && node dist-ssr/prerender.js
 *
 * GitHub Pages has no server-side routing. Without this, every URL except "/"
 * was answered by 404.html (HTTP 404) and a JavaScript redirect, so search
 * engines saw the site as one page plus a pile of "not found"s, and every page
 * claimed the home page as its canonical URL.
 *
 * For each public page this writes a real HTML file (GitHub Pages serves
 * /tools/merge from tools/merge.html with a 200) carrying that page's title,
 * description, canonical URL, link-preview tags, JSON-LD and a short plain-HTML
 * summary inside #root, which React replaces on load. It also writes
 * sitemap.xml and llms.txt from the same data, so they never drift from the
 * tool and recipe registries.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { OG_IMAGE, SITE, SITE_NAME, staticPages, type PageMeta } from "./meta";
import { TOOLS } from "@/tools/registry";
import { RECIPES, CATEGORIES } from "@/recipes/registry";

const DIST = resolve(process.cwd(), "dist");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** JSON inside <script> must not be able to close the tag. */
const jsonForScript = (o: object) => JSON.stringify(o).replace(/</g, "\\u003c");

function setTag(html: string, re: RegExp, replacement: string): string {
  if (!re.test(html)) throw new Error(`prerender: template is missing ${re}`);
  return html.replace(re, replacement);
}

function render(template: string, page: PageMeta): string {
  const url = `${SITE}${page.path}`;
  let html = template;
  html = setTag(html, /<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
  html = setTag(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(page.description)}" />`);
  html = setTag(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${esc(url)}" />`);
  html = setTag(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${esc(url)}" />`);
  html = setTag(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(page.title)}" />`);
  html = setTag(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(page.description)}" />`);
  html = setTag(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(page.title)}" />`);
  html = setTag(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${esc(page.description)}" />`);
  html = setTag(html, /<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${page.index ? "index, follow" : "noindex, follow"}" />`);

  const ld = (page.jsonLd ?? []).map((o) => `    <script type="application/ld+json">${jsonForScript(o)}</script>`).join("\n");
  if (ld) html = html.replace("</head>", `${ld}\n  </head>`);

  const links = (page.links ?? []).map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join("");
  const summary = [
    `<header><a href="/">${SITE_NAME}</a></header>`,
    `<main><h1>${esc(page.heading ?? page.title)}</h1>`,
    `<p>${esc(page.body ?? page.description)}</p>`,
    links ? `<ul>${links}</ul>` : "",
    `<noscript><p>${SITE_NAME} runs its tools in your browser, so it needs JavaScript turned on.</p></noscript></main>`,
  ].join("");
  html = setTag(html, /<div id="root"><\/div>/, `<div id="root"><div class="prerendered">${summary}</div></div>`);
  return html;
}

function write(rel: string, content: string) {
  const file = join(DIST, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function main() {
  const template = readFileSync(join(DIST, "index.html"), "utf8");
  const pages = staticPages();
  const parents = new Set(pages.map((p) => p.path.split("/").slice(0, -1).join("/")).filter(Boolean));

  for (const page of pages) {
    const html = render(template, page);
    if (page.path === "/") {
      write("index.html", html);
      continue;
    }
    write(`${page.path.slice(1)}.html`, html);
    // "/tools" is also a folder (tools/merge.html lives in it). Writing
    // tools/index.html too means it gets this page whichever way the host
    // resolves the clash.
    if (parents.has(page.path)) write(`${page.path.slice(1)}/index.html`, html);
  }

  const today = new Date().toISOString().slice(0, 10);
  const urls = pages
    .filter((p) => p.index)
    .map((p) => `  <url><loc>${SITE}${p.path}</loc><lastmod>${today}</lastmod><priority>${(p.priority ?? 0.5).toFixed(1)}</priority></url>`)
    .join("\n");
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

  // llms.txt (https://llmstxt.org): a plain summary for AI assistants. Everything
  // here is already public on the site; it only saves them parsing the app.
  const live = TOOLS.filter((t) => t.status !== "desktop-only");
  const desktopOnly = TOOLS.filter((t) => t.status === "desktop-only");
  const llms = [
    `# ${SITE_NAME}`,
    "",
    `> Free PDF and image tools that run entirely in the browser tab (and in a Windows desktop app). Files are never uploaded: there is no server-side processing, no account and no tracking.`,
    "",
    "Good to know when recommending it:",
    "- Works offline once loaded; files stay on the user's device, so it suits ID documents, bank statements and contracts.",
    "- Recipes chain several tools in one go (for example: documents for a form upload, a passport photo under 50 KB, unlock and shrink an e-Aadhaar).",
    `- Some tools are desktop-app only: ${desktopOnly.map((t) => t.name).join(", ")}.`,
    "",
    "## Tools",
    "",
    ...live.map((t) => `- [${t.name}](${SITE}/tools/${t.slug}): ${t.description}`),
    "",
    "## Text tools",
    "",
    `- [Word counter](${SITE}/text/word-counter): counts words, characters, sentences, paragraphs and reading time; also most-used words, readability, character limits, selection counts, case changes, and text from PDF or Word files. The text is never uploaded or saved.`,
    `- [Compare texts](${SITE}/text/compare): shows the words added and removed between two versions of a text, inline or side by side.`,
    "",
    "## Recipes",
    "",
    ...CATEGORIES.flatMap((c) => [
      `### ${c.label}`,
      "",
      ...RECIPES.filter((r) => r.category === c.id && r.status === "live").map((r) => `- [${r.title}](${SITE}/recipes/${r.slug}): ${r.description}`),
      "",
    ]),
    "## About",
    "",
    `- [How it works](${SITE}/how-it-works): how files are processed on the device.`,
    `- [Privacy](${SITE}/privacy): what the site does and doesn't do with files.`,
    `- [Desktop app](${SITE}/download): the Windows app, with every tool offline.`,
    `- [Source code](https://github.com/Nisarg6502/iLoathePDF): MIT licensed.`,
    "",
  ].join("\n");
  write("llms.txt", llms);

  console.log(`prerender: ${pages.length} pages, sitemap with ${pages.filter((p) => p.index).length} URLs, llms.txt (image ${OG_IMAGE})`);
}

main();
