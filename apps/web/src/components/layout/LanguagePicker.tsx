import { LANGUAGES, isLanguageCode, useLanguage, useTranslation } from "@iloathepdf/i18n";

/**
 * A native <select>: keyboard, screen readers and the phone's own picker all
 * work without extra code. Each option is written in its own language, so a
 * visitor who can't read the current one can still find theirs.
 *
 * The control leaves "Noto Sans Devanagari" out of its fonts: every OS has a
 * Devanagari system font for "हिन्दी", and naming our web font here would make
 * every English visitor download it just to draw this one option.
 */
const PICKER_FONT = { fontFamily: '"General Sans", system-ui, sans-serif' };

export function LanguagePicker() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <label className="relative flex h-8 flex-none items-center rounded-[9px] border border-border-hi bg-surface-2 text-text transition-colors duration-150 hover:bg-surface-3">
      <span className="sr-only">{t("Language")}</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 text-muted"
      >
        <circle cx="8" cy="8" r="6.2" />
        <path d="M1.8 8h12.4M8 1.8c1.7 1.8 2.5 3.9 2.5 6.2S9.7 12.4 8 14.2C6.3 12.4 5.5 10.3 5.5 8S6.3 3.6 8 1.8z" />
      </svg>
      <select
        value={language}
        onChange={(e) => {
          if (isLanguageCode(e.target.value)) void setLanguage(e.target.value);
        }}
        className="h-full cursor-pointer appearance-none rounded-[9px] bg-transparent pl-7.5 pr-7 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style={PICKER_FONT}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code} className="bg-surface text-text">
            {l.nativeName}
          </option>
        ))}
      </select>
      <svg
        width="9"
        height="9"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 text-muted"
      >
        <path d="M2 3.5 5 6.5 8 3.5" />
      </svg>
    </label>
  );
}
