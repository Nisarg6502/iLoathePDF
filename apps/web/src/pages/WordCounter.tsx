import { useDeferredValue, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { msg, useTranslation } from "@iloathepdf/i18n";
import { formatDuration, textStats } from "@/lib/textStats";
import { WordCounterIcon } from "@/text/registry";
import { KeywordsPanel } from "@/text/KeywordsPanel";
import { ReadabilityPanel } from "@/text/ReadabilityPanel";
import { LimitsPanel } from "@/text/LimitsPanel";
import { TransformMenu } from "@/text/TransformMenu";
import { NoTextFoundNotice, OpenFileButton } from "@/text/OpenFileButton";
import { ExtractTextError, extractText } from "@/text/extractText";

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
  /** The text before the last whole-box change (case change, clean-up, opened file), for Undo. */
  const [undoText, setUndoText] = useState<string | null>(null);
  /** Feedback for a file dropped on the box (the Open file button shows its own). */
  const [dropNote, setDropNote] = useState<ReactNode>(null);
  const [dragging, setDragging] = useState(false);
  const [selection, setSelection] = useState<[number, number]>([0, 0]);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  // Counting a long document on every keystroke can lag; let typing win.
  const counted = useDeferredValue(text);
  const stats = useMemo(() => textStats(counted), [counted]);
  const selected = selection[1] > selection[0] ? text.slice(selection[0], selection[1]) : "";
  const selectedStats = useMemo(() => (selected ? textStats(selected) : null), [selected]);
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
      edit(box.value);
    } catch {
      // Permission refused or nothing readable: Ctrl+V still works.
      box.focus();
    }
  }

  function edit(next: string) {
    setText(next);
    setUndoText(null);
  }

  /** Replaces the whole text in one step that Undo can take back. */
  function replaceAll(next: string) {
    if (next === text) return;
    setUndoText(text);
    setText(next);
    setSelection([0, 0]);
  }

  function undo() {
    if (undoText === null) return;
    setText(undoText);
    setUndoText(null);
    boxRef.current?.focus();
  }

  function clear() {
    replaceAll("");
    boxRef.current?.focus();
  }

  function openedFile(next: string) {
    setDropNote(null);
    replaceAll(next);
    boxRef.current?.focus();
  }

  function hasFiles(e: DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  async function dropFile(e: DragEvent<HTMLTextAreaElement>) {
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return; // dropped text: let the browser insert it
    e.preventDefault();
    setDropNote(t("Opening…"));
    try {
      const extracted = await extractText(file);
      if (!extracted.trim()) setDropNote(<NoTextFoundNotice />);
      else openedFile(extracted);
    } catch (err) {
      setDropNote(<span className="text-danger">{err instanceof ExtractTextError ? err.message : t("Couldn't read this file.")}</span>);
    }
  }

  function trackSelection(e: { currentTarget: HTMLTextAreaElement }) {
    const { selectionStart, selectionEnd } = e.currentTarget;
    setSelection((prev) => (prev[0] === selectionStart && prev[1] === selectionEnd ? prev : [selectionStart, selectionEnd]));
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
          <WordCounterIcon className="size-5" />
        </span>
        <div>
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{t("Word counter")}</h1>
          <p className="mt-1 text-sm text-muted">{t("Paste or type your text to count words, characters, sentences and reading time.")}</p>
        </div>
      </div>

      {/* Phones: counts, then the box, then the limit. Desktop: the box on the left, counts and limit beside it. */}
      <div className="mx-auto grid max-w-6xl gap-5 px-5 sm:px-8 pt-6 pb-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <label htmlFor="word-counter-text" className="sr-only">
            {t("Your text")}
          </label>
          <textarea
            id="word-counter-text"
            ref={boxRef}
            value={text}
            onChange={(e) => {
              edit(e.target.value);
              trackSelection(e);
            }}
            onSelect={trackSelection}
            onDragOver={(e) => {
              if (!hasFiles(e)) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={dropFile}
            placeholder={t("Start typing, paste your text, or drop a PDF, Word or text file here…")}
            className={`min-h-[22rem] w-full resize-y rounded-[12px] border border-border-hi bg-surface p-4 text-[15px] leading-relaxed text-text placeholder:text-faint focus:border-accent focus:outline-none lg:min-h-[30rem] ${dragging ? "border-accent bg-accent-soft" : ""}`}
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
            <OpenFileButton onText={(next) => openedFile(next)} />
            <TransformMenu
              text={text}
              onChange={(next) => {
                replaceAll(next);
                boxRef.current?.focus();
              }}
            />
            <button
              type="button"
              onClick={clear}
              disabled={!text}
              className="flex h-9 items-center rounded-[9px] border border-border px-3.5 text-[13px] font-medium text-muted transition-transform duration-100 hover:bg-surface-2 hover:text-text active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50"
            >
              {t("Clear")}
            </button>
            {undoText !== null && (
              <button
                type="button"
                onClick={undo}
                className="flex h-9 items-center rounded-[9px] border border-border px-3.5 text-[13px] font-medium text-muted transition-transform duration-100 hover:bg-surface-2 hover:text-text active:scale-[0.96]"
              >
                {t("Undo")}
              </button>
            )}
            {dropNote && <p className="text-[12.5px] text-muted" role="status">{dropNote}</p>}
            <p className="ml-auto flex items-center gap-1.5 text-[12.5px] text-muted">
              <span className="size-1.5 flex-none rounded-full bg-ok" aria-hidden="true" />
              {t("Counted in this tab. Your text is never uploaded or saved.")}
            </p>
          </div>
        </div>

        <aside aria-label={t("Counts")} className="max-lg:order-first lg:col-start-2 lg:row-start-1">
          <div className="rounded-[14px] border border-border bg-surface p-5">
            {selectedStats && (
              <p className="-mx-1 mb-4 rounded-[9px] bg-accent-soft px-3 py-2 text-[12.5px] text-text" data-testid="selection-count">
                <span className="font-mono text-[10px] font-bold tracking-[0.13em] text-accent-deep">{t("SELECTED")}</span>{" "}
                {t("{{words}} words · {{characters}} characters", {
                  words: num.format(selectedStats.words),
                  characters: num.format(selectedStats.characters),
                })}
              </p>
            )}
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
        <div className="lg:col-start-2 lg:row-start-2 lg:self-start">
          <LimitsPanel stats={stats} />
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl items-start gap-5 px-5 sm:px-8 pb-16 lg:grid-cols-2">
        <KeywordsPanel text={counted} />
        <ReadabilityPanel text={counted} />
      </div>
    </div>
  );
}
