import { Link } from "react-router-dom";
import { useTranslation } from "@iloathepdf/i18n";
import { LogoMark, Wordmark } from "./BrandLogo";

export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <div className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-14 px-5 sm:px-8 py-9">
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            <LogoMark size={20} />
            <Wordmark className="text-[15px]" />
          </div>
          <p className="mt-2.5 max-w-[34ch] text-[12.5px] leading-snug text-muted">
            {t("Twenty-three PDF and image tools that run on your machine. Twenty-one run in your browser; the desktop app has all but Compress images, for now.")}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-bold tracking-[0.13em] text-faint">{t("TOOLS")}</span>
          <Link to="/tools" className="text-[12.5px] text-muted hover:text-text">{t("All tools")}</Link>
          <Link to="/tools/compress" className="text-[12.5px] text-muted hover:text-text">{t("Compress")}</Link>
          <Link to="/download" className="text-[12.5px] text-muted hover:text-text">{t("Desktop app")}</Link>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-bold tracking-[0.13em] text-faint">{t("ABOUT")}</span>
          <Link to="/how-it-works" className="text-[12.5px] text-muted hover:text-text">{t("How it works")}</Link>
          <Link to="/privacy" className="text-[12.5px] text-muted hover:text-text">{t("Privacy")}</Link>
        </div>
      </div>
    </div>
  );
}
