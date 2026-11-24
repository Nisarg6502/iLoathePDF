import type { OptionsPanelProps } from "@/tools/ToolConfig";
import { useTranslation } from "@iloathepdf/i18n";

export function PdfaOptions(_props: OptionsPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">
      {t("Converts a PDF to PDF/A-2b for long-term archiving. This needs Ghostscript, so it is only available in the desktop app.")}
    </div>
  );
}
