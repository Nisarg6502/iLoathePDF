import type { ReactNode } from "react";
import { useTranslation } from "@iloathepdf/i18n";
import { CompareWorkspace, WordCounterWorkspace } from "@iloathepdf/text";
import { TEXT_TOOLS, type TextTool } from "../lib/textTools";
import { openPdfText } from "../lib/pdfText";
import { textFiles } from "../lib/textFiles";
import { cn } from "../lib/utils";

function TextToolLayout({ tool, subtitle, children }: { tool: TextTool; subtitle: string; children: ReactNode }) {
  const { t } = useTranslation();
  const Icon = tool.icon;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-10 pt-[30px] pb-10">
        <div className="mb-6 flex items-start gap-3.5">
          <span
            aria-hidden
            style={{ ["--tool-tint" as string]: `var(--tint-${tool.tint})` }}
            className={cn(
              "grid size-10 flex-none place-items-center rounded-xl",
              "bg-[color-mix(in_oklab,var(--tool-tint)_15%,transparent)] text-[var(--tool-tint)]",
            )}
          >
            <Icon className="size-5" />
          </span>
          <div>
            <h1 className="m-0 text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-text">{t(tool.title)}</h1>
            <p className="mt-1.5 max-w-[640px] text-[14.5px] text-muted">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

const tool = (id: string) => TEXT_TOOLS.find((x) => x.id === id)!;

export function WordCounterPage() {
  const { t } = useTranslation();
  return (
    <TextToolLayout
      tool={tool("word-counter")}
      subtitle={t("Paste or type your text to count words, characters, sentences and reading time.")}
    >
      <WordCounterWorkspace
        openPdf={openPdfText}
        ocrPath="/t/ocr"
        files={textFiles}
        privacyNote={t("Counted on this computer. Your text is never uploaded or saved.")}
        savedNote={t("Saved on this computer only, never uploaded. Forgotten after 7 days unused.")}
      />
    </TextToolLayout>
  );
}

export function TextComparePage() {
  const { t } = useTranslation();
  return (
    <TextToolLayout
      tool={tool("compare")}
      subtitle={t("Paste two versions to see every word that was added or removed. Your text never leaves this computer.")}
    >
      <CompareWorkspace privacyNote={t("Compared on this computer. Your text is never uploaded or saved.")} />
    </TextToolLayout>
  );
}
