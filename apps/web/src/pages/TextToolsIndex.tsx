import { Link } from "react-router-dom";
import { useTranslation } from "@iloathepdf/i18n";
import { TEXT_TOOLS } from "@/text/registry";

export function TextToolsIndex() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-13">
      <h1 className="m-0 text-4xl font-semibold tracking-[-0.032em]">{t("Text tools")}</h1>
      <p className="mt-2.5 max-w-[58ch] text-[15.5px] text-muted">
        {t("For text you'd rather not paste into a stranger's website. Everything is worked out in this tab: nothing is uploaded, saved or tracked.")}
      </p>
      <div className="mt-9 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {TEXT_TOOLS.map((tool) => (
          <Link
            key={tool.path}
            to={tool.path}
            className="rounded-[14px] border border-border bg-surface p-5 transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-strong)] hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--shadow-card)]"
          >
            <span className="grid size-9 place-items-center rounded-[10px] border border-border bg-accent-soft">
              <tool.Icon className="size-5" />
            </span>
            <div className="mt-3 text-[15px] font-semibold">{t(tool.name)}</div>
            <div className="mt-1 text-[13px] leading-relaxed text-muted">{t(tool.description)}</div>
            <div className="mt-3 font-mono text-[11px] text-accent-deep">{t("Open →")}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
