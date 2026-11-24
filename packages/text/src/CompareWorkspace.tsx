import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useTranslation } from "@iloathepdf/i18n";
import { countWords } from "./textStats";
import { diffTexts, type DiffPart } from "./diff";
import { NO_ASSISTANTS } from "./noAssistants";

type View = "inline" | "split";

/** Only the layout choice is remembered; the texts never are. */
const VIEW_KEY = "iloathepdf.compare.view";

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "split" ? "split" : "inline";
  } catch {
    return "inline";
  }
}

const LABEL = "font-mono text-[10.5px] font-bold uppercase tracking-[0.13em] text-muted";
const DEL = "mr-0.5 rounded-[3px] bg-danger-soft text-text line-through decoration-danger/70";
const INS = "rounded-[3px] bg-ok-soft text-text no-underline";

export interface CompareWorkspaceProps {
  /** The privacy line under the result, worded for where it runs. */
  privacyNote: string;
}

/**
 * Compare texts: two boxes, the options, and the word-level differences.
 * Each app puts its own heading and page padding around it.
 */
export function CompareWorkspace({ privacyNote }: CompareWorkspaceProps) {
  const { t, i18n } = useTranslation();
  const [original, setOriginal] = useState("");
  const [changed, setChanged] = useState("");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreSpace, setIgnoreSpace] = useState(false);
  const [view, setViewState] = useState<View>(loadView);
  const originalRef = useRef<HTMLTextAreaElement>(null);
  const num = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  // Comparing long documents on every keystroke can lag; let typing win.
  const a = useDeferredValue(original);
  const b = useDeferredValue(changed);
  const opts = useDeferredValue(useMemo(() => ({ ignoreCase, ignoreSpace }), [ignoreCase, ignoreSpace]));
  const result = useMemo(() => diffTexts(a, b, opts), [a, b, opts]);
  const stale = a !== original || b !== changed;
  const wordsA = useMemo(() => countWords(a), [a]);
  const wordsB = useMemo(() => countWords(b), [b]);
  const empty = !a && !b;

  function setView(next: View) {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage blocked: the choice just isn't remembered.
    }
  }

  function swap() {
    setOriginal(changed);
    setChanged(original);
  }

  function clear() {
    setOriginal("");
    setChanged("");
    originalRef.current?.focus();
  }

  const box =
    "min-h-[14rem] w-full resize-y rounded-[12px] border border-border-hi bg-surface p-4 text-[15px] leading-relaxed text-text placeholder:text-faint focus:border-accent focus:outline-none lg:min-h-[18rem]";
  const btn =
    "flex h-9 items-center rounded-[9px] border px-3.5 text-[13px] transition-transform duration-100 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50";
  const toggle = (active: boolean) =>
    `h-8 rounded-[7px] px-3 text-[12.5px] font-semibold transition-colors ${active ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`;

  const removedLabel = t("Removed:");
  const addedLabel = t("Added:");
  const renderPart = (p: DiffPart, i: number, side: "both" | "original" | "changed") => {
    if (p.op === "equal") return <span key={i}>{side === "original" ? p.original : p.text}</span>;
    if (p.op === "delete") {
      if (side === "changed") return null;
      return (
        <del key={i} className={DEL}>
          <span className="sr-only">{removedLabel} </span>
          {p.text}
        </del>
      );
    }
    if (side === "original") return null;
    return (
      <ins key={i} className={INS}>
        <span className="sr-only">{addedLabel} </span>
        {p.text}
      </ins>
    );
  };

  const flow = "m-0 min-w-0 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-text";

  return (
    <div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex min-w-0 flex-col">
          <label htmlFor="compare-original" className={`${LABEL} mb-2`}>
            {t("Original")}
          </label>
          <textarea
            id="compare-original"
            ref={originalRef}
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            placeholder={t("Paste the original text here…")}
            className={box}
            {...NO_ASSISTANTS}
          />
          <p className="mt-1.5 text-[12.5px] text-muted tabular-nums" data-testid="original-words">
            {t("Words: {{n}}", { n: num.format(wordsA) })}
          </p>
        </div>
        <div className="flex min-w-0 flex-col">
          <label htmlFor="compare-changed" className={`${LABEL} mb-2`}>
            {t("Changed")}
          </label>
          <textarea
            id="compare-changed"
            value={changed}
            onChange={(e) => setChanged(e.target.value)}
            placeholder={t("Paste the changed text here…")}
            className={box}
            {...NO_ASSISTANTS}
          />
          <p className="mt-1.5 text-[12.5px] text-muted tabular-nums" data-testid="changed-words">
            {t("Words: {{n}}", { n: num.format(wordsB) })}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="flex items-center gap-2 text-[13px] text-text">
          <input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} className="size-4 accent-accent" />
          {t("Ignore case")}
        </label>
        <label className="flex items-center gap-2 text-[13px] text-text">
          <input type="checkbox" checked={ignoreSpace} onChange={(e) => setIgnoreSpace(e.target.checked)} className="size-4 accent-accent" />
          {t("Ignore extra spaces")}
        </label>
        <div className="flex gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={swap}
            disabled={!original && !changed}
            className={`${btn} border-border-hi bg-surface-2 font-semibold text-text hover:bg-surface-3`}
          >
            {t("Swap")}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={!original && !changed}
            className={`${btn} border-border font-medium text-muted hover:bg-surface-2 hover:text-text`}
          >
            {t("Clear")}
          </button>
        </div>
      </div>

      <section aria-labelledby="compare-result" className="mt-6 rounded-[14px] border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h2 id="compare-result" className={`${LABEL} m-0`}>
            {t("Differences")}
          </h2>
          <div role="group" aria-label={t("Layout")} className="ml-auto inline-flex rounded-[9px] border border-border bg-surface-2 p-0.5">
            <button type="button" aria-pressed={view === "inline"} onClick={() => setView("inline")} className={toggle(view === "inline")}>
              {t("Inline")}
            </button>
            <button type="button" aria-pressed={view === "split"} onClick={() => setView("split")} className={toggle(view === "split")}>
              {t("Side by side")}
            </button>
          </div>
        </div>

        {empty ? (
          <p className="mt-4 text-[14px] text-muted">{t("Paste or type text in both boxes to see what changed.")}</p>
        ) : (
          <div className={`transition-opacity ${stale ? "opacity-60" : ""}`}>
            {result.identical ? (
              <p className="mt-4 flex items-center gap-2 text-[14px] font-semibold text-text" data-testid="compare-summary">
                <span className="size-1.5 flex-none rounded-full bg-ok" aria-hidden="true" />
                {t("The texts are identical.")}
              </p>
            ) : (
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]" data-testid="compare-summary">
                <div className="flex items-baseline gap-1.5">
                  <span className="size-2 flex-none self-center rounded-[2px] bg-ok" aria-hidden="true" />
                  <dt className="text-muted">{t("Words added")}</dt>
                  <dd className="m-0 font-semibold tabular-nums">{num.format(result.wordsAdded)}</dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="size-2 flex-none self-center rounded-[2px] bg-danger" aria-hidden="true" />
                  <dt className="text-muted">{t("Words removed")}</dt>
                  <dd className="m-0 font-semibold tabular-nums">{num.format(result.wordsRemoved)}</dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted">{t("Changes")}</dt>
                  <dd className="m-0 font-semibold tabular-nums">{num.format(result.changes)}</dd>
                </div>
              </dl>
            )}
            {result.approximate && (
              <p className="mt-2 text-[12.5px] text-faint">
                {t("These texts are very different, so some changed passages are shown whole instead of word by word.")}
              </p>
            )}

            {view === "inline" ? (
              <div className={`${flow} mt-4 border-t border-border pt-4`} data-testid="compare-inline">
                {result.parts.map((p, i) => renderPart(p, i, "both"))}
              </div>
            ) : (
              <div className="mt-4 grid gap-5 border-t border-border pt-4 md:grid-cols-2">
                <div className="min-w-0">
                  <h3 className={`${LABEL} mb-2`}>{t("Original")}</h3>
                  <div className={flow} data-testid="compare-original-side">
                    {result.parts.map((p, i) => renderPart(p, i, "original"))}
                  </div>
                </div>
                <div className="min-w-0 max-md:border-t max-md:border-border max-md:pt-4">
                  <h3 className={`${LABEL} mb-2`}>{t("Changed")}</h3>
                  <div className={flow} data-testid="compare-changed-side">
                    {result.parts.map((p, i) => renderPart(p, i, "changed"))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <p className="mt-3 flex items-center gap-1.5 px-1 text-[12.5px] text-muted">
        <span className="size-1.5 flex-none rounded-full bg-ok" aria-hidden="true" />
        {privacyNote}
      </p>
    </div>
  );
}
