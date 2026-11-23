/**
 * Marks a string for translation without translating it yet.
 *
 * Use it for text that lives outside a component (a module-level list of nav
 * links, say), then pass the value through `t()` where it is rendered:
 *
 *   const LINKS = [{ to: "/privacy", label: msg("Privacy") }];
 *   ...
 *   <NavLink to={link.to}>{t(link.label)}</NavLink>
 *
 * It returns its argument unchanged. It exists so `npm run check` (see
 * scripts/check.ts) can find the string and so a reader can see it is shown
 * to users. Kept in its own file with no imports, so modules that only need
 * this (and plain Node scripts that read them) don't load i18next.
 */
export function msg<T extends string>(text: T): T {
  return text;
}
