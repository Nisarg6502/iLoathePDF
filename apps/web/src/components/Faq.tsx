import { Link } from "react-router-dom";
import { msg, Trans, useTranslation } from "@iloathepdf/i18n";

const FAQS: [string, React.ReactNode][] = [
  [
    msg("Do my files actually get uploaded anywhere?"),
    msg("No. The web app has no upload endpoint to send them to — processing runs in this browser tab using pdf-lib and pdf.js. The desktop app goes further: it is offline by default, and its only network code is an optional update check that stays off until you switch it on and never sends your files or anything about you."),
  ],
  [
    msg("Do I need to sign up or make an account?"),
    msg("No accounts, no email, no usage caps tied to an identity. Open a tool and use it."),
  ],
  [
    msg("Is there a file size limit?"),
    msg("In the browser you're limited by tab memory, roughly 200 MB in practice. The desktop app is disk-bound instead, so it comfortably handles much larger files and whole folders at once."),
  ],
  [
    msg("What file types are supported?"),
    msg("PDF for merge, split, organize, compress, sign & fill. PNG, JPG and WebP for image conversion, plus HEIC on the desktop app (browser support for HEIC is preview-only for now)."),
  ],
  [
    msg("Is the desktop app free?"),
    msg("Yes — it's MIT-licensed and free, same as the web app. Download it from the project's GitHub Releases."),
  ],
  [
    msg("Does it work offline?"),
    msg("The web app's tool code loads once with the page, then makes no further requests — it keeps working with no connection. The desktop app never needs one in the first place."),
  ],
  [
    msg("What about macOS or Linux?"),
    <Trans
      i18nKey="There's no installer for those yet — the web app runs all but one of the same tools in any modern browser on any OS (PDF to Excel needs the desktop build). See <a>browser support</a> for the specifics."
      components={{ a: <Link to="/how-it-works" className="text-accent" /> }}
    />,
  ],
];

export function Faq() {
  const { t } = useTranslation();
  return (
    <div id="faq" className="mx-auto max-w-6xl px-5 sm:px-8 pb-20">
      <h2 className="m-0 mb-1.5 text-[26px] font-semibold tracking-[-0.025em]">{t("Questions")}</h2>
      <p className="m-0 max-w-[56ch] text-[15px] text-muted">
        {t("The things people usually ask before they trust a PDF tool with a file they care about.")}
      </p>
      <div className="mt-7 flex flex-col divide-y divide-border rounded-[13px] border border-border bg-surface">
        {FAQS.map(([q, a]) => (
          <details key={q} className="group px-5.5 py-4.5 first:rounded-t-[13px] last:rounded-b-[13px]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-medium marker:content-none [&::-webkit-details-marker]:hidden">
              {t(q)}
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="var(--muted)"
                strokeWidth="1.7"
                className="flex-none transition-transform duration-200 ease-[var(--ease-out-strong)] group-open:rotate-45"
              >
                <path d="M8 2.5v11M2.5 8h11" strokeLinecap="round" />
              </svg>
            </summary>
            <p className="mt-2.5 max-w-[68ch] text-[13.5px] leading-relaxed text-muted">{typeof a === "string" ? t(a) : a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
