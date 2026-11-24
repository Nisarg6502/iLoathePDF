import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "@iloathepdf/i18n";
import { ExtractTextError, TEXT_FILE_ACCEPT, extractText, type OpenPdf } from "./extractText";

/**
 * Shown when a PDF has no text layer, usually a scan. Reusable for drops.
 * (The tag is <a>, not <link>: Trans parses <link> as a void HTML element and
 * would leave the link empty.)
 */
export function NoTextFoundNotice({ ocrPath }: { ocrPath: string }) {
  return (
    <span className="text-[12.5px] text-muted">
      <Trans
        i18nKey="No text found in this PDF. If it's a scan, <a>run OCR first</a>."
        components={{ a: <Link to={ocrPath} className="font-semibold text-accent-deep underline underline-offset-2 hover:text-accent" /> }}
      />
    </span>
  );
}

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string } | { kind: "empty" };

/**
 * "Open file" button for the word counter: reads a .txt, .md, .csv, .pdf or
 * .docx in this tab and hands its text to onText. Nothing is uploaded.
 */
export function OpenFileButton({
  onText,
  openPdf,
  ocrPath,
  pick,
}: {
  onText: (text: string, fileName: string) => void;
  openPdf: OpenPdf;
  /** Where the "run OCR first" link goes in this app. */
  ocrPath: string;
  /** The app's own file picker (the desktop's native dialog). Without it, a file input is used. Resolves null when cancelled. */
  pick?: () => Promise<File | null>;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function open(file: File) {
    setStatus({ kind: "busy" });
    try {
      const text = await extractText(file, { openPdf });
      if (!alive.current) return;
      if (!text.trim() && /\.pdf$/i.test(file.name)) {
        setStatus({ kind: "empty" });
        return;
      }
      setStatus({ kind: "idle" });
      onText(text, file.name);
    } catch (e) {
      if (!alive.current) return;
      setStatus({ kind: "error", message: e instanceof ExtractTextError ? e.message : t("Couldn't read this file.") });
    }
  }

  const busy = status.kind === "busy";

  async function choose() {
    if (!pick) {
      input.current?.click();
      return;
    }
    let file: File | null;
    try {
      file = await pick();
    } catch {
      setStatus({ kind: "error", message: t("Couldn't read this file.") });
      return;
    }
    if (file && alive.current) await open(file);
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-y-1.5">
      <input
        ref={input}
        type="file"
        accept={TEXT_FILE_ACCEPT}
        className="hidden"
        data-testid="open-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear so picking the same file again still fires a change.
          e.target.value = "";
          if (file) void open(file);
        }}
      />
      <button
        type="button"
        onClick={() => void choose()}
        disabled={busy}
        aria-busy={busy}
        className="flex h-9 items-center gap-2 rounded-[9px] border border-border-hi bg-surface-2 px-3.5 text-[13px] font-semibold text-text transition-transform duration-100 hover:bg-surface-3 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-60"
      >
        {busy ? (
          <span className="size-3.5 flex-none animate-spin rounded-full border-2 border-border-hi border-t-accent" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 flex-none text-muted" aria-hidden="true">
            <path d="M9 1.75H4.25a1.5 1.5 0 0 0-1.5 1.5v9.5a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5V6Z" />
            <path d="M9 1.75V6h4.25" />
          </svg>
        )}
        {busy ? t("Opening…") : t("Open file")}
      </button>
      <span role="status" aria-live="polite" className="min-w-0 pl-3 empty:pl-0">
        {status.kind === "error" && <span className="text-[12.5px] text-danger">{status.message}</span>}
        {status.kind === "empty" && <NoTextFoundNotice ocrPath={ocrPath} />}
      </span>
    </div>
  );
}
