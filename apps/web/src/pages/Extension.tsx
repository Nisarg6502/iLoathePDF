import { Link } from "react-router-dom";
import { tr, Trans, useTranslation } from "@iloathepdf/i18n";
import { version } from "../../../extension/package.json";

// Straight links to this version's files. The site is built from the same
// commit as the extension, so the version matches the newest release once its
// tag is pushed. (The page can't ask the GitHub API: the site's CSP allows no
// connections to other servers.)
const RELEASE = `https://github.com/Nisarg6502/iLoathePDF/releases/download/extension-v${version}`;
const CHROME_ZIP = `${RELEASE}/iloathepdf-extension-${version}-chrome.zip`;
// Live on Microsoft Edge Add-ons. The Chrome Web Store listing is still in
// review: when it is live, give Chrome the same kind of button as Edge.
const EDGE_STORE = "https://microsoftedge.microsoft.com/addons/detail/igmikmgahdniamhadbhkpkhjcmdkhkpc";
const FIREFOX_ZIP = `${RELEASE}/iloathepdf-extension-${version}-firefox.zip`;

const SECONDARY_BUTTON =
  "inline-flex h-11 items-center gap-2 rounded-[11px] border border-border bg-surface px-5 text-[14px] font-semibold text-text transition-transform duration-100 hover:border-border-hi active:scale-[0.97]";

const BUTTON =
  "inline-flex h-11 items-center gap-2 rounded-[11px] bg-accent px-5 text-[14.5px] font-semibold text-on-accent shadow-[var(--shadow-card)] transition-transform duration-100 hover:bg-accent-hi active:bg-accent-deep active:scale-[0.97]";

/**
 * A one-click store install that isn't live yet (the Chrome Web Store
 * listing is in review). Not a link until it is listed.
 */
function StoreSoon({ store }: { store: string }) {
  const { t } = useTranslation();
  return (
    <div
      aria-disabled="true"
      className="inline-flex h-11 items-center gap-2.5 rounded-[11px] border border-border bg-surface px-4 text-[14px] font-semibold text-muted"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M2.5 5.5h11l-1 8h-9zM5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" />
      </svg>
      {store}
      <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-on-accent">{t("COMING SOON")}</span>
    </div>
  );
}

function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--ok)" strokeWidth="1.8" className="mt-0.5 flex-none" aria-hidden="true">
      <path d="M2.5 8.4l3.2 3.2L13.5 4" />
    </svg>
  );
}

export function Extension() {
  const { t } = useTranslation();

  const features = [
    [
      tr("Fit a file to an upload form"),
      tr("A Fit button appears next to upload fields. It reads the limits written beside the field, such as \"JPG only, max 100 KB\", shrinks your photo or PDF until it fits, and puts it straight into the form."),
    ],
    [
      tr("Save any image as PDF, JPG or PNG"),
      tr("Right-click an image on a page and choose the format. It is converted on your computer and saved to your Downloads folder."),
    ],
    [
      tr("Collect images into one PDF"),
      tr("Right-click images on any page to collect them, put them in order from the toolbar button, and make one PDF."),
    ],
  ];

  const permissions = [
    [tr("No access to your sites at install"), tr("The Fit buttons appear on a page after you click the toolbar button, or on the sites you choose to allow.")],
    [tr("Right-click menu items"), tr("Save image as PDF, JPG or PNG; Add image to PDF; Fit a file to this form.")],
    [
      tr("Downloads"),
      tr("To save the files it converts. Your browser lists this as \"Manage your downloads\"; the extension never reads your download history."),
    ],
    [tr("Nothing sent anywhere"), tr("No server, no account, no analytics. The only thing it fetches is the image you right-clicked.")],
  ];

  const steps = [
    tr("Download the Chrome and Edge zip and unzip it."),
    tr("Open chrome://extensions (in Edge, edge://extensions) and turn on Developer mode."),
    tr("Choose Load unpacked and pick the unzipped folder. Pin iLoathePDF to the toolbar."),
  ];

  return (
    <div className="mx-auto max-w-[1100px] px-5 sm:px-8 py-14">
      <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[1fr_400px]">
        <div>
          <span className="font-mono text-[10.5px] font-bold tracking-[0.15em] text-accent">{t("CHROME · EDGE · FIREFOX")}</span>
          <h1 className="mt-4 text-[40px] font-semibold leading-[1.05] tracking-[-0.035em]">{t("The tools, right on the page.")}</h1>
          <p className="mt-4 max-w-[50ch] text-base leading-relaxed text-muted">
            {t("A small browser extension that fixes files where you need them: on the upload form that rejects your photo, or on the image you just right-clicked. Your files never leave your computer.")}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href={EDGE_STORE} className={BUTTON}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M2.5 5.5h11l-1 8h-9zM5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" />
              </svg>
              {t("Add to Microsoft Edge")}
            </a>
            <StoreSoon store={t("Chrome Web Store")} />
          </div>
          <p className="mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
            {t("Edge: one click from Microsoft Edge Add-ons, and it keeps itself up to date. Chrome: the Chrome Web Store listing is in review, so for now it installs by hand in about a minute.")}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href={CHROME_ZIP} className={SECONDARY_BUTTON}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M8 2v8.5M4.5 7l3.5 3.5L11.5 7M3 13.5h10" />
              </svg>
              {t("Download the zip for Chrome")}
            </a>
            <span className="font-mono text-[12px] text-muted">v{version}</span>
          </div>
          <p className="mt-3 text-[13.5px] text-muted">
            <Trans
              i18nKey="Firefox: <a>download the Firefox zip</a> and open it from about:debugging (Load Temporary Add-on). Firefox removes it when it restarts, until the extension is in the add-ons store."
              components={{ a: <a href={FIREFOX_ZIP} className="text-accent" /> }}
            />
          </p>

          <h2 className="mt-12 text-[13px] font-semibold">{t("Install it in Chrome by hand")}</h2>
          <p className="mt-1.5 text-[13.5px] text-muted">{t("Until it's in the Chrome Web Store, it installs by hand. It takes a minute.")}</p>
          <ol className="mt-4 flex flex-col gap-3">
            {steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-[14px] leading-relaxed">
                <span className="grid size-6 flex-none place-items-center rounded-full bg-surface-3 font-mono text-[11.5px] font-bold text-muted">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <p className="mt-10 text-[13.5px] leading-relaxed text-muted">
            <Trans
              i18nKey="Want every tool, and whole folders at once? <a>Get the desktop app</a>."
              components={{ a: <Link to="/download" className="text-accent" /> }}
            />
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
            <div className="border-b border-border px-4.5 py-3.5 text-[12.5px] font-semibold">{t("What it does")}</div>
            <div className="px-4.5 pb-3.5 pt-1.5">
              {features.map(([title, body]) => (
                <div key={title} className="flex items-start gap-2.5 border-b border-border py-3.5 last:border-b-0">
                  <Check />
                  <div>
                    <div className="text-[13.5px] font-medium">{title}</div>
                    <div className="text-[12.5px] leading-snug text-muted">{body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
            <div className="border-b border-border px-4.5 py-3.5 text-[12.5px] font-semibold">{t("What it asks your browser for")}</div>
            <div className="px-4.5 pb-3.5 pt-1.5">
              {permissions.map(([title, body]) => (
                <div key={title} className="border-b border-border py-3.5 last:border-b-0">
                  <div className="text-[13.5px] font-medium">{title}</div>
                  <div className="text-[12.5px] leading-snug text-muted">{body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
