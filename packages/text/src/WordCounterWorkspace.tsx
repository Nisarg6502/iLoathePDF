import { useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { msg, useTranslation } from "@iloathepdf/i18n";
import { formatDuration, textStats } from "./textStats";
import { KeywordsPanel } from "./KeywordsPanel";
import { ReadabilityPanel } from "./ReadabilityPanel";
import { LimitsPanel } from "./LimitsPanel";
import { TransformMenu } from "./TransformMenu";
import { NoTextFoundNotice, OpenFileButton } from "./OpenFileButton";
import { ExtractTextError, extractText, type OpenPdf } from "./extractText";
import { NO_ASSISTANTS } from "./noAssistants";

/**
 * An app's own way of getting files, for apps where the page can't do it
 * itself. The desktop app's window takes file drops natively and hands over
 * paths, and it has a native file dialog; the web app needs neither.
 */
export interface TextFileSource {
  /** Shows the app's file dialog. Resolves null when cancelled. */
  pick(): Promise<File | null>;
  /** Listens for files dropped on the window. Returns a function that stops listening. */
  onDrop(handlers: { over(): void; leave(): void; drop(file: Promise<File>): void }): () => void;
}

export interface WordCounterWorkspaceProps {
  /** Opens a PDF with the app's own pdf.js. */
  openPdf: OpenPdf;
  /** Where the "run OCR first" link goes in this app. */
  ocrPath: string;
  /** The app's own file dialog and window drop, when it has them. */
  files?: TextFileSource;
  /** The privacy line under the box, worded for where it runs. */
  privacyNote: string;
}

const UNITS = { hr: msg("hr"), min: msg("min"), sec: msg("sec") };

/**
 * The word counter itself: the text box with its toolbar, the counts, the
 * limit, most-used words and readability. Each app puts its own heading and
 * page padding around it.
 */
export function WordCounterWorkspace({ openPdf, ocrPath, files, privacyNote }: WordCounterWorkspaceProps) {
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

  async function openDropped(file: Promise<File>) {
    setDropNote(t("Opening…"));
    try {
      const extracted = await extractText(await file, { openPdf });
      if (!extracted.trim()) setDropNote(<NoTextFoundNotice ocrPath={ocrPath} />);
      else openedFile(extracted);
    } catch (err) {
      setDropNote(<span className="text-danger">{err instanceof ExtractTextError ? err.message : t("Couldn't read this file.")}</span>);
    }
  }

  // The app's own window drop, where the page doesn't get drop events itself.
  const openDroppedRef = useRef(openDropped);
  openDroppedRef.current = openDropped;
  useEffect(() => {
    if (!files) return;
    return files.onDrop({
      over: () => setDragging(true),
      leave: () => setDragging(false),
      drop: (file) => {
        setDragging(false);
        void openDroppedRef.current(file);
      },
    });
  }, [files]);

  function hasFiles(e: DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  function dropFile(e: DragEvent<HTMLTextAreaElement>) {
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return; // dropped text: let the browser insert it
    e.preventDefault();
    void openDropped(Promise.resolve(file));
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
    <div className="flex flex-col gap-8">
      {/* Narrow: counts, then the box, then the limit. Wide: the box on the left, counts and limit beside it. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:grid-rows-[auto_1fr]">
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
            <OpenFileButton onText={(next) => openedFile(next)} openPdf={openPdf} ocrPath={ocrPath} pick={files?.pick} />
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
            {dropNote && (
              <p className="text-[12.5px] text-muted" role="status">
                {dropNote}
              </p>
            )}
            <p className="ml-auto flex items-center gap-1.5 text-[12.5px] text-muted">
              <span className="size-1.5 flex-none rounded-full bg-ok" aria-hidden="true" />
              {privacyNote}
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
          <p className="mt-3 px-1 text-[12px] leading-snug text-faint">{t("Reading time assumes 238 words a minute; speaking time, 150.")}</p>
        </aside>
        <div className="lg:col-start-2 lg:row-start-2 lg:self-start">
          <LimitsPanel stats={stats} />
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <KeywordsPanel text={counted} />
        <ReadabilityPanel text={counted} />
      </div>
    </div>
  );
}
