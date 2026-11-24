import { useDeferredValue, useMemo, useRef, useState } from "react";
import { msg, useTranslation } from "@iloathepdf/i18n";
import { formatDuration, textStats } from "@/lib/textStats";

/**
 * Attributes that ask writing-assistant extensions (Grammarly, LanguageTool)
 * to leave this box alone, since they send what you type to their servers.
 * Spell check is off for the same reason: Chrome's "enhanced" spell check
 * sends text to Google.
 */
const NO_ASSISTANTS = {
  spellCheck: false,
  autoComplete: "off",
  autoCorrect: "off",
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
  "data-lt-active": "false",
} as const;

const UNITS = { hr: msg("hr"), min: msg("min"), sec: msg("sec") };

export function WordCounter() {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState("");
  const boxRef = useRef<HTMLTextAreaElement>(null);
  // Counting a long document on every keystroke can lag; let typing win.
  const counted = useDeferredValue(text);
  const stats = useMemo(() => textStats(counted), [counted]);
  const num = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const canPaste = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  const duration = (seconds: number) =>
    formatDuration(seconds)
      .map((p) => `${num.format(p.value)} ${t(UNITS[p.unit])}`)
      .join(" ");

  async function paste() {
    const box = boxRef.current;
    if (!box) return;
    try {
      const clip = await navigator.clipboard.readText();
      box.focus();
      box.setRangeText(clip, box.selectionStart, box.selectionEnd, "end");
      setText(box.value);
    } catch {
      // Permission refused or nothing readable: Ctrl+V still works.
      box.focus();
    }
  }

  function clear() {
    setText("");
    boxRef.current?.focus();
  }

  const secondary = [
    { label: t("Characters (no spaces)"), value: num.format(stats.charactersNoSpaces) },
    { label: t("Sentences"), value: num.format(stats.sentences) },
    { label: t("Paragraphs"), value: num.format(stats.paragraphs) },
    { label: t("Reading time"), value: duration(stats.readingSeconds) },
    { label: t("Speaking time"), value: duration(stats.speakingSeconds) },
  ];

  return (
    <div>
      <div className="mx-auto flex max-w-6xl items-start gap-3.5 px-5 sm:px-8 pt-8">
        <span className="grid size-9.5 flex-none place-items-center rounded-[11px] border border-border bg-accent-soft">
          <svg viewBox="0 0 18 18" fill="none" stroke="var(--accent-deep)" strokeWidth="1.5" strokeLinecap="round" className="size-5" aria-hidden="true">
            <path d="M2.5 4h13M2.5 7.5h13M2.5 11h7" />
            <path d="M12.5 10.5v5M15.5 10.5v5M11.5 12.2h5M11.5 13.8h5" />
          </svg>
        </span>
        <div>
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{t("Word counter")}</h1>
          <p className="mt-1 text-sm text-muted">{t("Paste or type your text to count words, characters, sentences and reading time.")}</p>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-5 px-5 sm:px-8 pt-6 pb-14 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col">
          <label htmlFor="word-counter-text" className="sr-only">
            {t("Your text")}
          </label>
          <textarea
            id="word-counter-text"
            ref={boxRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("Start typing, or paste your text here…")}
            className="min-h-[22rem] w-full resize-y rounded-[12px] border border-border-hi bg-surface p-4 text-[15px] leading-relaxed text-text placeholder:text-faint focus:border-accent focus:outline-none lg:min-h-[30rem]"
            {...NO_ASSISTANTS}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canPaste && (
              <button
                type="button"
                onClick={paste}
                className="flex h-9 items-center rounded-[9px] border border-border-hi bg-surface-2 px-3.5 text-[13px] font-semibold text-text transition-transform duration-100 hover:bg-surface-3 active:scale-[0.96]"
              >
                {t("Paste")}
              </button>
            )}
            <button
              type="button"
              onClick={clear}
              disabled={!text}
              className="flex h-9 items-center rounded-[9px] border border-border px-3.5 text-[13px] font-medium text-muted transition-transform duration-100 hover:bg-surface-2 hover:text-text active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50"
            >
              {t("Clear")}
            </button>
            <p className="ml-auto flex items-center gap-1.5 text-[12.5px] text-muted">
              <span className="size-1.5 flex-none rounded-full bg-ok" aria-hidden="true" />
              {t("Counted in this tab. Your text is never uploaded or saved.")}
            </p>
          </div>
        </div>

        <aside aria-label={t("Counts")} className="max-lg:order-first lg:sticky lg:top-[86px] lg:self-start">
          <div className="rounded-[14px] border border-border bg-surface p-5">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-muted">{t("WORDS")}</dt>
                <dd className="m-0 mt-0.5 text-[34px] font-bold leading-tight tracking-[-0.03em] tabular-nums" data-testid="word-count">
                  {num.format(stats.words)}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-muted">{t("CHARACTERS")}</dt>
                <dd className="m-0 mt-0.5 text-[34px] font-bold leading-tight tracking-[-0.03em] tabular-nums" data-testid="char-count">
                  {num.format(stats.characters)}
                </dd>
              </div>
            </dl>
            <dl className="mt-4 flex flex-col border-t border-border max-lg:grid max-lg:grid-cols-2 max-lg:gap-x-4 max-sm:grid-cols-1">
              {secondary.map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0">
                  <dt className="text-[13px] text-muted">{s.label}</dt>
                  <dd className="m-0 text-[13.5px] font-semibold tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-3 px-1 text-[12px] leading-snug text-faint">
            {t("Reading time assumes 238 words a minute; speaking time, 150.")}
          </p>
        </aside>
      </div>
    </div>
  );
}
