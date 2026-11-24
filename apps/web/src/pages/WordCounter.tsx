import { useTranslation } from "@iloathepdf/i18n";
import { WordCounterWorkspace } from "@iloathepdf/text";
import { WordCounterIcon } from "@/text/registry";
import { openPdfText } from "@/lib/openPdfText";

export function WordCounter() {
  const { t } = useTranslation();
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

      <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 pb-16">
        <WordCounterWorkspace
          openPdf={openPdfText}
          ocrPath="/tools/ocr"
          privacyNote={t("Counted in this tab. Your text is never uploaded or saved.")}
        />
      </div>
    </div>
  );
}
