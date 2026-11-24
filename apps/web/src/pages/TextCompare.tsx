import { useTranslation } from "@iloathepdf/i18n";
import { CompareWorkspace } from "@iloathepdf/text";
import { CompareIcon } from "@/text/registry";

export function TextCompare() {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mx-auto flex max-w-6xl items-start gap-3.5 px-5 sm:px-8 pt-8">
        <span className="grid size-9.5 flex-none place-items-center rounded-[11px] border border-border bg-accent-soft">
          <CompareIcon className="size-5" />
        </span>
        <div>
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{t("Compare texts")}</h1>
          <p className="mt-1 text-sm text-muted">{t("Paste two versions to see every word that was added or removed. Your text never leaves this tab.")}</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 pb-14">
        <CompareWorkspace privacyNote={t("Compared in this tab. Your text is never uploaded or saved.")} />
      </div>
    </div>
  );
}
