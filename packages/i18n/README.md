# @iloathepdf/i18n

Interface translations shared by the web app (`apps/web`) and the desktop app
(`apps/desktop`). Features are identical in every language; only the text
changes.

## How it works

- **The key is the English text.** Components call `t("Merge PDF")`. If a
  language has no entry for a string, the English shows, so a half-translated
  language is still fully usable.
- **One file per language, shared by both apps.** `locales/hi.json` holds every
  Hindi string for the website and the desktop app, so a string the two have
  in common is translated once.
- **Only the chosen language loads.** Each `locales/<code>.json` is built into
  its own small file (Hindi is about 8 KB compressed). The web app fetches it
  from its own site when someone picks that language; the desktop app ships
  every language inside the installer and loads only the selected one. No
  translation is ever fetched from another server.
- **Choosing the language.** A saved choice always wins. Otherwise the desktop
  app uses the language picked on the installer's first screen, then the
  Windows display language; the web app uses the browser's languages. English
  is the fallback.
- **Fonts.** `src/fonts.css` adds Noto Sans Devanagari for Hindi. The browser
  downloads it only when Devanagari text is on screen.

## Marking text for translation

```tsx
import { msg, useTranslation } from "@iloathepdf/i18n";

function Example({ files }: { files: number }) {
  const { t } = useTranslation();
  return (
    <>
      <h1>{t("Your files never leave this tab.")}</h1>
      {/* Plurals: pass `count`, and put the English singular in locales/en.json */}
      <p>{t("{{count}} files ready", { count: files })}</p>
    </>
  );
}

// Text defined outside a component: mark it with msg(), translate where shown.
const LINKS = [{ to: "/privacy", label: msg("Privacy") }];
// ... <a>{t(link.label)}</a>
```

Rules of thumb:

- Pass whole sentences, not fragments glued together. Word order differs
  between languages.
- Use `{{name}}` placeholders for values, never string concatenation.
- Tool names and descriptions in the two tool registries
  (`apps/web/src/tools/registry.tsx`, `apps/desktop/src/lib/tools.ts`) are
  picked up automatically; render them with `t(tool.name)`.
- Changing the English of a string changes its key. The check below then
  flags the old translation as unused, so it gets updated instead of silently
  disappearing.

## Translating

```bash
# What's left to translate in Hindi, as JSON ready to paste into locales/hi.json
npm run missing --workspace=packages/i18n -- hi

# Check every catalog (CI runs this)
npm run check --workspace=packages/i18n
```

The check fails if a catalog has an entry no code uses any more, or a
translation uses a `{{placeholder}}` its English doesn't have. Untranslated
strings are only counted, not errors.

For plurals, add `_one`, `_other` (and whatever other forms the language
needs: `_few`, `_many`, ...) to the English key:

```json
"{{count}} files ready_one": "{{count}} फ़ाइल तैयार",
"{{count}} files ready": "{{count}} फ़ाइलें तैयार"
```

A key without a suffix is used for every count the language has no specific
form for.

## Adding a language

1. Add it to `LANGUAGES` in `src/languages.ts` (code, names, text direction,
   Windows language id).
2. Create `locales/<code>.json` with `{}` and fill it using
   `npm run missing -- <code>`.
3. If its script isn't Latin or Devanagari, add a matching Noto font to
   `src/fonts.css`. If its letters join up (Devanagari, Arabic, ...), add it to
   the letter-spacing rule at the end of that file.
4. Desktop installer: add the NSIS language name to `languages` in
   `apps/desktop/src-tauri/tauri.conf.json`. Tauri ships installer text for
   about 20 languages; for any other, add a `windows/<Language>.nsh` file like
   `windows/Hindi.nsh` and list it under `customLanguageFiles`.
5. For a right-to-left language, check the layouts: set `dir: "rtl"` and
   replace left/right spacing classes (`ml-`, `pl-`, `left-`) with their
   logical forms (`ms-`, `ps-`, `start-`) where the layout breaks.
