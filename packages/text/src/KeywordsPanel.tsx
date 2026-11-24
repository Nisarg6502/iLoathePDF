import { useId, useMemo, useState } from "react";
import { msg, useTranslation } from "@iloathepdf/i18n";
import { DEFAULT_ROWS, MAX_ROWS, countTokenWords, tokenize, topPhrases, type PhraseLength } from "./keywords";

/** Only this on/off choice is remembered, never the text. */
const HIDE_COMMON_KEY = "iloathepdf.wordCounter.hideCommon";

const LENGTHS: { n: PhraseLength; label: string }[] = [
  { n: 1, label: msg("1 word") },
  { n: 2, label: msg("2 words") },
  { n: 3, label: msg("3 words") },
];

function readHideCommon(): boolean {
  try {
    return localStorage.getItem(HIDE_COMMON_KEY) !== "false";
  } catch {
    return true;
  }
}

function saveHideCommon(on: boolean) {
  try {
    localStorage.setItem(HIDE_COMMON_KEY, on ? "true" : "false");
  } catch {
    // Private mode or storage blocked: the choice just lasts for this visit.
  }
}

export function KeywordsPanel({ text }: { text: string }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [n, setN] = useState<PhraseLength>(1);
  const [hideCommon, setHideCommon] = useState(readHideCommon);
  const [expanded, setExpanded] = useState(false);

  // Tokenising is the slow part on a long text; switching tabs reuses it.
  const tokens = useMemo(() => tokenize(text), [text]);
  const hasWords = useMemo(() => countTokenWords(tokens) > 0, [tokens]);
  const result = useMemo(() => topPhrases(tokens, n, { hideCommon, limit: MAX_ROWS }), [tokens, n, hideCommon]);

  const num = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const pct = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [i18n.language],
  );

  // When the list is empty, say whether hiding common words is the reason.
  const onlyCommon = useMemo(
    () => hideCommon && result.rows.length === 0 && topPhrases(tokens, n, { hideCommon: false, limit: 1 }).rows.length > 0,
    [tokens, n, hideCommon, result],
  );

  const rows = expanded ? result.rows : result.rows.slice(0, DEFAULT_ROWS);
  const top = result.rows[0]?.count ?? 1;
  const panelId = `${id}-panel`;

  function toggleHideCommon(on: boolean) {
    setHideCommon(on);
    saveHideCommon(on);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-[14px] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 id={`${id}-title`} className="m-0 font-mono text-[10.5px] font-bold tracking-[0.13em] text-muted">
          {t("MOST-USED WORDS")}
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={hideCommon}
            onChange={(e) => toggleHideCommon(e.target.checked)}
            className="size-4 flex-none cursor-pointer accent-accent"
          />
          {t("Hide common words")}
        </label>
      </div>

      <div
        role="tablist"
        aria-label={t("Phrase length")}
        className="mt-3 grid grid-cols-3 gap-1 rounded-[10px] border border-border bg-surface-2 p-1"
      >
        {LENGTHS.map((l) => {
          const selected = n === l.n;
          return (
            <button
              key={l.n}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              onClick={() => {
                setN(l.n);
                setExpanded(false);
              }}
              className={`h-8 rounded-[7px] text-[13px] transition-colors duration-150 ${
                selected
                  ? "border border-border-hi bg-surface font-semibold text-text"
                  : "font-medium text-muted hover:text-text"
              }`}
            >
              {t(l.label)}
            </button>
          );
        })}
      </div>

      <div id={panelId} role="tabpanel" aria-label={t(LENGTHS[n - 1].label)} className="mt-3">
        {!hasWords ? (
          <p className="m-0 py-6 text-center text-[13px] text-faint">{t("Your most-used words will show up here.")}</p>
        ) : rows.length === 0 ? (
          <p className="m-0 py-6 text-center text-[13px] text-faint">
            {onlyCommon ? t("Only common words so far.") : t("Not enough words for this yet.")}
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-3 border-b border-border pb-1.5 font-mono text-[10px] font-bold tracking-[0.13em] text-faint" aria-hidden="true">
              <span className="min-w-0 flex-1">{n === 1 ? t("WORD") : t("PHRASE")}</span>
              <span className="w-12 text-right">{t("COUNT")}</span>
              <span className="w-14 text-right">{t("DENSITY")}</span>
            </div>
            <ol className="m-0 list-none p-0" data-testid="keyword-rows">
              {rows.map((row) => (
                <li key={row.phrase} className="border-b border-border py-2 last:border-b-0">
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text" title={row.phrase}>
                      {row.phrase}
                    </span>
                    <span className="w-12 text-right text-[13.5px] font-semibold tabular-nums">
                      <span className="sr-only">{t("Count")}: </span>
                      {num.format(row.count)}
                    </span>
                    <span className="w-14 text-right text-[12.5px] text-muted tabular-nums">
                      <span className="sr-only">{t("Density")}: </span>
                      {pct.format(row.share)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(row.count / top) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
            {result.rows.length > DEFAULT_ROWS && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="mt-2 flex h-8 items-center rounded-[9px] border border-border px-3 text-[12.5px] font-medium text-muted transition-transform duration-100 hover:bg-surface-2 hover:text-text active:scale-[0.96]"
              >
                {expanded ? t("Show less") : t("Show more")}
              </button>
            )}
          </>
        )}
      </div>
      <p className="m-0 mt-3 text-[12px] leading-snug text-faint">
        {t("Density is how often an entry appears, out of all the words. Common words are English only.")}
      </p>
    </section>
  );
}
