import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { metaFor, OG_IMAGE, SITE } from "./meta";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/**
 * Keeps <head> in step with the current page: title, description, canonical,
 * link-preview tags and robots. The prerendered HTML already has these for a
 * first load; this covers in-app navigation and crawlers that run JavaScript.
 */
export function useSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const m = metaFor(pathname);
    const url = `${SITE}${m.path === "/" ? "/" : m.path}`;
    document.title = m.title;
    setMeta("name", "description", m.description);
    setMeta("name", "robots", m.index ? "index, follow" : "noindex, follow");
    setMeta("property", "og:url", url);
    setMeta("property", "og:title", m.title);
    setMeta("property", "og:description", m.description);
    setMeta("property", "og:image", OG_IMAGE);
    setMeta("name", "twitter:title", m.title);
    setMeta("name", "twitter:description", m.description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }, [pathname]);
}
