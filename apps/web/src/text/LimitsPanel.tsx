import { useId, useMemo, useState } from "react";
import { useTranslation } from "@iloathepdf/i18n";
import type { TextStats } from "@/lib/textStats";
import {
  DEFAULT_CUSTOM,
  LIMIT_PRESETS,
  findPreset,
  limitProgress,
  loadLimit,
  parseCustomMax,
  saveLimit,
  type LimitChoice,
  type LimitUnit,
} from "./limits";

const CUSTOM = "custom";

const FILL = { ok: "bg-accent", near: "bg-warn", over: "bg-danger" } as const;
const TONE = { ok: "text-muted", near: "text-warn", over: "text-danger" } as const;

const controlClass =
  "h-9 rounded-[9px] border border-border-hi bg-surface-2 px-2.5 text-[13px] font-semibold text-text hover:bg-surface-3 focus:border-accent focus:outline-none";

/**
 * A target to write towards: pick a platform limit (or your own number) and
 * see how much room is left. Remembers which target you picked, never the
 * text.
 */
export function LimitsPanel({ stats }: { stats: TextStats }) {
  const { t, i18n } = useTranslation();
  const num = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const [choice, setChoice] = useState<LimitChoice>(loadLimit);
  const [draft, setDraft] = useState(() => String(choice && "custom" in choice ? choice.custom.max : DEFAULT_CUSTOM.max));
  const id = useId();
  const selectId = `${id}-target`;
  const customId = `${id}-custom`;
  const unitId = `${id}-unit`;
  const nameId = `${id}-name`;
  const hintId = `${id}-hint`;

  function update(next: LimitChoice) {
    setChoice(next);
    saveLimit(next);
  }

  const customUnit: LimitUnit = choice && "custom" in choice ? choice.custom.unit : DEFAULT_CUSTOM.unit;

  function pick(value: string) {
    if (!value) return update(null);
    if (value === CUSTOM) {
      let max = parseCustomMax(draft);
      if (max === null) {
        max = DEFAULT_CUSTOM.max;
        setDraft(String(max));
      }
      return update({ custom: { max, unit: customUnit } });
    }
    update({ preset: value });
  }

  function typeCustom(value: string) {
    setDraft(value);
    const max = parseCustomMax(value);
    // Only a usable number is remembered; the last good one stays saved meanwhile.
    if (max !== null) update({ custom: { max, unit: customUnit } });
  }

  const isCustom = !!choice && "custom" in choice;
  const preset = choice && "preset" in choice ? findPreset(choice.preset) : undefined;
  const customMax = isCustom ? parseCustomMax(draft) : null;
  const target = preset ? { max: preset.max, unit: preset.unit } : customMax !== null ? { max: customMax, unit: customUnit } : null;
  const selectValue = preset ? preset.id : isCustom ? CUSTOM : "";

  let bar = null;
  if (target) {
    const count = target.unit === "words" ? stats.words : stats.characters;
    const p = limitProgress(count, target.max);
    const n = num.format(count);
    const max = num.format(target.max);
    const amount = target.unit === "words" ? t("{{n}} / {{max}} words", { n, max }) : t("{{n}} / {{max}} characters", { n, max });
    const status = p.state === "over" ? t("{{n}} over", { n: num.format(p.over) }) : t("{{n}} left", { n: num.format(p.remaining) });
    bar = (
      <div className="mt-4">
        <p id={nameId} className="sr-only">
          {preset ? t(preset.label) : t("Your limit")}
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] tabular-nums">
          <span className="text-muted" data-testid="limit-amount">
            {amount}
          </span>
          <span className={`font-semibold ${TONE[p.state]}`} data-testid="limit-status">
            {status}
          </span>
        </div>
        <div
          role="progressbar"
          aria-labelledby={nameId}
          aria-valuemin={0}
          aria-valuemax={target.max}
          aria-valuenow={Math.min(count, target.max)}
          aria-valuetext={`${amount} · ${status}`}
          data-state={p.state}
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className={`h-full rounded-full ${FILL[p.state]} transition-[width] duration-150 motion-reduce:transition-none`}
            style={{ width: `${p.fraction * 100}%` }}
          />
        </div>
        <span className="sr-only" aria-live="polite">
          {p.state === "over" ? t("Over the limit") : ""}
        </span>
        {preset && <p className="mt-2.5 mb-0 text-[12px] leading-snug text-faint">{t(preset.note)}</p>}
      </div>
    );
  }

  return (
    <section aria-label={t("Limit target")} className="rounded-[14px] border border-border bg-surface p-5">
      <div className="flex items-center gap-3">
        <label htmlFor={selectId} className="flex-none font-mono text-[10.5px] font-bold uppercase tracking-[0.13em] text-muted">
          {t("Limit")}
        </label>
        <select id={selectId} value={selectValue} onChange={(e) => pick(e.target.value)} className={`${controlClass} min-w-0 flex-1`}>
          <option value="">{t("Set a limit…")}</option>
          {LIMIT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {`${t(p.label)} · ${num.format(p.max)}`}
            </option>
          ))}
          <option value={CUSTOM}>{t("Custom…")}</option>
        </select>
      </div>

      {isCustom && (
        <div className="mt-3">
          <div className="flex gap-2">
            <label htmlFor={customId} className="sr-only">
              {t("Custom limit")}
            </label>
            <input
              id={customId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft}
              onChange={(e) => typeCustom(e.target.value)}
              aria-invalid={customMax === null}
              aria-describedby={customMax === null ? hintId : undefined}
              className={`${controlClass} w-0 min-w-0 flex-1 tabular-nums aria-invalid:border-danger`}
            />
            <label htmlFor={unitId} className="sr-only">
              {t("Count")}
            </label>
            <select
              id={unitId}
              value={customUnit}
              onChange={(e) => update({ custom: { max: customMax ?? DEFAULT_CUSTOM.max, unit: e.target.value as LimitUnit } })}
              className={`${controlClass} flex-none`}
            >
              <option value="characters">{t("Characters")}</option>
              <option value="words">{t("Words")}</option>
            </select>
          </div>
          {customMax === null && (
            <p id={hintId} className="mt-1.5 mb-0 text-[12px] text-danger">
              {t("Enter a whole number, 1 or more.")}
            </p>
          )}
        </div>
      )}

      {bar}
    </section>
  );
}
