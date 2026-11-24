/**
 * What each page tells search engines, link previews and AI crawlers: title,
 * description, canonical URL, whether to index it, structured data, and a
 * plain-HTML summary for crawlers that don't run JavaScript.
 *
 * One source for two consumers:
 *  - the running app (useSeo.ts) updates <head> on every navigation, and
 *  - the build (prerender.ts) writes a real HTML file per public page, plus
 *    sitemap.xml and llms.txt, so GitHub Pages answers each URL with a 200 and
 *    the right tags instead of its SPA 404 fallback.
 */
import { TOOLS } from "@/tools/registry";
import { RECIPES } from "@/recipes/registry";

export const SITE = "https://iloathepdf.com";
export const SITE_NAME = "iLoathePDF";
const DEFAULT_IMAGE = `${SITE}/og-image.png`;
const PRIVACY_LINE = "Runs in your browser: your files are never uploaded.";

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  /** False for pages that shouldn't appear in search (builders, a user's own recipes). */
  index: boolean;
  /** schema.org JSON-LD objects. */
  jsonLd?: object[];
  /** H1 and short body for the static HTML a non-JS crawler reads. */
  heading?: string;
  body?: string;
  links?: { href: string; label: string }[];
  /** Sitemap priority hint. */
  priority?: number;
}

const breadcrumb = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE}${it.path}` })),
});

const webApp = (name: string, description: string, path: string, extra: object = {}) => ({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name,
  description,
  url: `${SITE}${path}`,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any (runs in a web browser)",
  browserRequirements: "Requires JavaScript and a modern browser.",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  ...extra,
});

/** Shorter, search-friendly tool titles ("Compress PDF" beats "Compress PDF" + jargon). */
function toolTitle(name: string): string {
  return `${name}: free, private, no upload | ${SITE_NAME}`;
}

export function staticPages(): PageMeta[] {
  const liveTools = TOOLS.filter((t) => t.status !== "desktop-only");
  const pages: PageMeta[] = [
    {
      path: "/",
      title: `${SITE_NAME}: PDF tools that never upload your files`,
      description:
        "Merge, split, compress, sign, OCR and convert PDFs and images, entirely in your browser tab. No upload, no server, no account, free.",
      index: true,
      priority: 1,
      heading: "Your files never leave this tab.",
      body: `${SITE_NAME} has ${TOOLS.length} PDF and image tools that run on your own device: merge, split, compress, sign, redact, OCR, convert and more. Nothing is uploaded, there is no account, and it's free. There is also a Windows desktop app.`,
      links: [
        { href: "/tools", label: "All tools" },
        { href: "/recipes", label: "Recipes" },
        { href: "/how-it-works", label: "How it works" },
        { href: "/privacy", label: "Privacy" },
        { href: "/download", label: "Desktop app" },
      ],
      jsonLd: [
        { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: `${SITE}/` },
        webApp(SITE_NAME, "PDF and image tools that run entirely in your browser. Files are never uploaded.", "/", {
          featureList: liveTools.map((t) => t.name),
        }),
      ],
    },
    {
      path: "/tools",
      title: `All PDF and image tools | ${SITE_NAME}`,
      description: `Every tool in one place: merge, split, compress, sign, redact, OCR, watermark and convert PDFs and images. ${PRIVACY_LINE}`,
      index: true,
      priority: 0.9,
      heading: "All tools",
      body: `PDF and image tools that run on your device. ${PRIVACY_LINE}`,
      links: TOOLS.map((t) => ({ href: `/tools/${t.slug}`, label: t.name })),
      jsonLd: [breadcrumb([{ name: "Home", path: "/" }, { name: "Tools", path: "/tools" }])],
    },
    {
      path: "/recipes",
      title: `PDF recipes: several tools in one go | ${SITE_NAME}`,
      description:
        "Ready-made chains of PDF tools for everyday jobs: documents for a form upload, a passport photo under 50 KB, unlock and shrink an e-Aadhaar, page numbers, and more. Or build your own.",
      index: true,
      priority: 0.9,
      heading: "Recipes",
      body: "Several tools in a row, in one go. Drop your files once and get the finished result. Use a ready-made recipe, adjust its settings, or build your own.",
      links: RECIPES.filter((r) => r.status === "live").map((r) => ({ href: `/recipes/${r.slug}`, label: r.title })),
      jsonLd: [breadcrumb([{ name: "Home", path: "/" }, { name: "Recipes", path: "/recipes" }])],
    },
    {
      path: "/text",
      title: `Private text tools: word counter, compare texts | ${SITE_NAME}`,
      description:
        "A word counter and a text compare tool that work entirely in your browser tab. For text you'd rather not paste into a stranger's website: nothing is uploaded, saved or tracked.",
      index: true,
      priority: 0.7,
      heading: "Text tools",
      body: "For text you'd rather not paste into a stranger's website. Everything is worked out in your browser tab: nothing is uploaded, saved or tracked.",
      links: [
        { href: "/text/word-counter", label: "Word counter" },
        { href: "/text/compare", label: "Compare texts" },
      ],
      jsonLd: [breadcrumb([{ name: "Home", path: "/" }, { name: "Text tools", path: "/text" }])],
    },
    {
      path: "/text/word-counter",
      title: `Word counter: private, nothing uploaded | ${SITE_NAME}`,
      description:
        "Count words, characters, sentences and reading time as you type, paste or open a PDF or Word file. See your most-used words, readability score and character limits. Nothing is uploaded or saved.",
      index: true,
      priority: 0.8,
      heading: "Word counter",
      body: "Paste or type your text, or open a PDF, Word or text file, to count words, characters (with and without spaces), sentences, paragraphs, and reading and speaking time. It also shows your most-used words and phrases, a Flesch readability score, progress against limits like a 280-character post or a 160-character meta description, and counts for just the part you select. Change case or clean up text copied from a PDF in one click. Everything happens in your browser tab: the text is never uploaded or saved.",
      links: [
        { href: "/text/compare", label: "Compare texts" },
        { href: "/tools", label: "PDF and image tools" },
      ],
      jsonLd: [
        breadcrumb([
          { name: "Home", path: "/" },
          { name: "Text tools", path: "/text" },
          { name: "Word counter", path: "/text/word-counter" },
        ]),
        webApp(`Word counter (${SITE_NAME})`, "Counts words, characters, sentences and reading time in the browser. Text is never uploaded.", "/text/word-counter", {
          featureList: ["Word and character count", "Most-used words", "Readability score", "Character limits", "Selection count", "Open PDF and Word files", "Change case"],
        }),
      ],
    },
    {
      path: "/text/compare",
      title: `Compare texts: see what changed, privately | ${SITE_NAME}`,
      description:
        "Paste two versions of a text and see every word that was added or removed, inline or side by side. Ignore case or extra spaces. It runs entirely in your browser: your text is never uploaded.",
      index: true,
      priority: 0.7,
      heading: "Compare texts",
      body: "Paste two versions of a text and see every word that was added or removed, inline or side by side, with options to ignore case and extra spaces. The comparison runs in your browser tab: neither text is uploaded or saved.",
      links: [
        { href: "/text/word-counter", label: "Word counter" },
        { href: "/text", label: "Text tools" },
      ],
      jsonLd: [
        breadcrumb([
          { name: "Home", path: "/" },
          { name: "Text tools", path: "/text" },
          { name: "Compare texts", path: "/text/compare" },
        ]),
        webApp(`Compare texts (${SITE_NAME})`, "Shows the words added and removed between two texts, in the browser. Text is never uploaded.", "/text/compare"),
      ],
    },
    {
      path: "/how-it-works",
      title: `How it works: no upload, all on your device | ${SITE_NAME}`,
      description: "How iLoathePDF processes PDFs and images inside your browser tab or the desktop app, without sending files to any server.",
      index: true,
      priority: 0.5,
      heading: "How it works",
    },
    {
      path: "/privacy",
      title: `Privacy | ${SITE_NAME}`,
      description: "No server-side processing, no accounts, no tracking. What iLoathePDF does and doesn't do with your files.",
      index: true,
      priority: 0.4,
      heading: "Privacy",
    },
    {
      path: "/download",
      title: `Download the Windows desktop app | ${SITE_NAME}`,
      description: "The iLoathePDF desktop app for Windows: every tool, offline, including PDF to Excel and PDF/A. Files stay on your computer.",
      index: true,
      priority: 0.6,
      heading: "Desktop app",
    },
    {
      path: "/recipes/new",
      title: `Build a recipe | ${SITE_NAME}`,
      description: "Chain PDF and image tools into your own recipe, with your own settings.",
      index: false,
      heading: "Build a recipe",
    },
  ];

  for (const t of TOOLS) {
    const desc = t.status === "desktop-only" ? `${t.description} Available in the free iLoathePDF desktop app for Windows.` : `${t.description} ${PRIVACY_LINE}`;
    pages.push({
      path: `/tools/${t.slug}`,
      title: toolTitle(t.name),
      description: desc,
      index: true,
      priority: 0.8,
      heading: t.name,
      body: desc,
      links: [{ href: "/tools", label: "All tools" }],
      jsonLd: [
        breadcrumb([
          { name: "Home", path: "/" },
          { name: "Tools", path: "/tools" },
          { name: t.name, path: `/tools/${t.slug}` },
        ]),
        ...(t.status === "desktop-only" ? [] : [webApp(`${t.name} (${SITE_NAME})`, t.description, `/tools/${t.slug}`)]),
      ],
    });
  }

  for (const r of RECIPES) {
    const steps = r.steps.map((s) => TOOLS.find((t) => t.slug === s.tool)?.name ?? s.tool).join(" → ");
    const desc = `${r.description} Steps: ${steps}.${r.status === "live" ? ` ${PRIVACY_LINE}` : " Desktop app only."}`;
    pages.push({
      path: `/recipes/${r.slug}`,
      title: `${r.title} | ${SITE_NAME} recipe`,
      description: desc,
      index: r.status === "live",
      priority: 0.7,
      heading: r.title,
      body: r.goodFor ? `${desc} Good for: ${r.goodFor}.` : desc,
      links: [{ href: "/recipes", label: "All recipes" }],
      jsonLd: [
        breadcrumb([
          { name: "Home", path: "/" },
          { name: "Recipes", path: "/recipes" },
          { name: r.title, path: `/recipes/${r.slug}` },
        ]),
      ],
    });
  }
  return pages;
}

let cache: Map<string, PageMeta> | null = null;

/** Metadata for any in-app path, including ones that aren't prerendered (custom recipes, edit screens, 404s). */
export function metaFor(pathname: string): PageMeta {
  cache ??= new Map(staticPages().map((p) => [p.path, p]));
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const known = cache.get(path);
  if (known) return known;
  if (/^\/recipes\/[^/]+(\/edit)?$/.test(path)) {
    return { path, title: `Your recipe | ${SITE_NAME}`, description: "A recipe saved in this browser.", index: false };
  }
  return { path, title: `Page not found | ${SITE_NAME}`, description: "This page doesn't exist.", index: false };
}

export const OG_IMAGE = DEFAULT_IMAGE;
