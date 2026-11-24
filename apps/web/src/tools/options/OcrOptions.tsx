import type { OptionsPanelProps } from "@/tools/ToolConfig";
import { useTranslation } from "@iloathepdf/i18n";

export function OcrOptions(_props: OptionsPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">
      {t("Scans your PDF and adds an invisible, searchable text layer over the original pages — the file looks identical, but the text can now be selected, copied, and searched. English only for now — no options to configure.")}
    </div>
  );
}
