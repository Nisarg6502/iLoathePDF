import { useMemo } from "react";
import { msg, useTranslation } from "@iloathepdf/i18n";
import { readability, type ReadingBand } from "./readability";

const BANDS: Record<ReadingBand, { label: string; readers: string }> = {
  "very-easy": { label: msg("Very easy"), readers: msg("Easily understood by 11-year-olds.") },
  easy: { label: msg("Easy"), readers: msg("Easily understood by 12-year-olds.") },
  "fairly-easy": { label: msg("Fairly easy"), readers: msg("Easily understood by 13-year-olds.") },
  plain: { label: msg("Plain English"), readers: msg("Easily understood by 13- to 15-year-olds.") },
  "fairly-hard": { label: msg("Fairly hard"), readers: msg("Understood by 15- to 18-year-olds.") },
  hard: { label: msg("Hard"), readers: msg("Best understood by university students.") },
  "very-hard": { label: msg("Very hard"), readers: msg("Best understood by university graduates.") },
};

const labelClass = "font-mono text-[10.5px] font-bold tracking-[0.13em] text-muted";

/**
 * How easy the text is to read: Flesch Reading Ease with a plain-language
 * band, the Flesch–Kincaid grade, and the long sentences worth a second look.
 * English only; computed in the tab from the text it's given.
 */
export function ReadabilityPanel({ text }: { text: string }) {
  const { t, i18n } = useTranslation();
  const r = useMemo(() => readability(text), [text]);
  const one = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1, minimumFractionDigits: 1 }), [i18n.language]);
  const num = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  let body;
  if (r.kind !== "ok") {
    body = (
      <p className="m-0 mt-2 text-[13px] leading-snug text-muted" data-testid="readability-note">
        {r.kind === "not-english" ? t("Readability scores are for English text.") : t("Add a few more sentences for a readability score.")}
      </p>
    );
  } else {
    const score = Math.round(Math.min(100, Math.max(0, r.readingEase)));
    const band = BANDS[r.band];
    const rows = [
      { label: t("Grade level"), value: one.format(r.grade) },
      { label: t("Average sentence"), value: t("{{n}} words", { n: one.format(r.avgSentenceWords) }) },
      { label: t("Average word"), value: t("{{n}} characters", { n: one.format(r.avgWordChars) }) },
      { label: t("Long sentences (over 25 words)"), value: num.format(r.longSentences) },
      { label: t("Hard words (3+ syllables)"), value: num.format(r.hardWords) },
    ];
    body = (
      <>
        <div className="mt-1 flex items-baseline gap-2.5">
          <span className="text-[34px] font-bold leading-tight tracking-[-0.03em] tabular-nums" data-testid="reading-ease">
            {num.format(score)}
          </span>
          <span className="text-[13.5px] font-semibold">{t(band.label)}</span>
        </div>
        <div
          role="meter"
          aria-label={t("Reading ease")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
          aria-valuetext={`${num.format(score)}, ${t(band.label)}`}
          className="relative mt-2 h-1.5 rounded-full bg-surface-3"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${score}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-faint" aria-hidden="true">
          <span>{t("Hard")}</span>
          <span>{t("Easy")}</span>
        </div>
        <p className="m-0 mt-2 text-[12.5px] leading-snug text-muted">{t(band.readers)}</p>

        <dl className="mt-3 flex flex-col border-t border-border">
          {rows.map((s) => (
            <div key={s.label} className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0">
              <dt className="text-[13px] text-muted">{s.label}</dt>
              <dd className="m-0 text-[13.5px] font-semibold tabular-nums whitespace-nowrap">{s.value}</dd>
            </div>
          ))}
        </dl>

        {r.longSamples.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <h3 className={`m-0 ${labelClass}`}>{t("LONG SENTENCES")}</h3>
            <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
              {r.longSamples.map((s, i) => (
                <li key={i} className="rounded-[9px] bg-surface-2 px-3 py-2 text-[12.5px] leading-snug">
                  <span className="break-words text-text">“{s.text}”</span>
                  <span className="mt-0.5 block text-[11.5px] text-faint tabular-nums">{t("{{n}} words", { n: num.format(s.words) })}</span>
                </li>
              ))}
            </ul>
            {r.longSentences > r.longSamples.length && (
              <p className="m-0 mt-2 text-[12px] text-faint">
                {t("Showing the first {{shown}} of {{total}}.", { shown: num.format(r.longSamples.length), total: num.format(r.longSentences) })}
              </p>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <section aria-label={t("Readability")}>
      <div className="rounded-[14px] border border-border bg-surface p-5">
        <h2 className={`m-0 ${labelClass}`}>{t("READABILITY")}</h2>
        {body}
      </div>
      <p className="mt-3 px-1 text-[12px] leading-snug text-faint">
        {t("Scores use the Flesch Reading Ease and Flesch–Kincaid grade level formulas.")}
      </p>
    </section>
  );
}
