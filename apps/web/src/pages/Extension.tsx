import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { tr, Trans, useTranslation } from "@iloathepdf/i18n";

const RELEASES_URL = "https://github.com/Nisarg6502/iLoathePDF/releases";
// Extension releases are never marked "latest" (that one is the desktop app,
// which its updater reads), so look through the recent ones for its tag.
const RELEASES_API = "https://api.github.com/repos/Nisarg6502/iLoathePDF/releases?per_page=30";
const TAG_PREFIX = "extension-v";

interface ExtensionRelease {
  version: string;
  pageUrl: string;
  chromeZip?: string;
  firefoxZip?: string;
}

type Asset = { name: string; browser_download_url: string };
type Release = { tag_name: string; html_url: string; draft: boolean; prerelease: boolean; assets: Asset[] };

function useExtensionRelease() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [release, setRelease] = useState<ExtensionRelease | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(RELEASES_API)
      .then((res) => {
        if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
        return res.json() as Promise<Release[]>;
      })
      .then((releases) => {
        if (cancelled) return;
        const found = releases.find((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(TAG_PREFIX));
        if (!found) throw new Error("no extension release yet");
        const zip = (suffix: string) => found.assets.find((a) => a.name.endsWith(suffix))?.browser_download_url;
        setRelease({
          version: found.tag_name.slice(TAG_PREFIX.length),
          pageUrl: found.html_url,
          chromeZip: zip("-chrome.zip"),
          firefoxZip: zip("-firefox.zip"),
        });
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { state, release };
}

const BUTTON =
  "inline-flex h-11 items-center gap-2 rounded-[11px] bg-accent px-5 text-[14.5px] font-semibold text-on-accent shadow-[var(--shadow-card)] transition-transform duration-100 hover:bg-accent-hi active:bg-accent-deep active:scale-[0.97]";

function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--ok)" strokeWidth="1.8" className="mt-0.5 flex-none" aria-hidden="true">
      <path d="M2.5 8.4l3.2 3.2L13.5 4" />
    </svg>
  );
}

export function Extension() {
  const { t } = useTranslation();
  const { state, release } = useExtensionRelease();

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
            {state === "ready" && release?.chromeZip ? (
              <a href={release.chromeZip} className={BUTTON}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <path d="M8 2v8.5M4.5 7l3.5 3.5L11.5 7M3 13.5h10" />
                </svg>
                {t("Get the extension for Chrome and Edge")}
              </a>
            ) : state === "loading" ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-[11px] bg-surface-3 px-5 text-[14.5px] font-semibold text-faint">
                {t("Checking latest release…")}
              </span>
            ) : (
              <a href={release?.pageUrl ?? RELEASES_URL} className={BUTTON}>
                {t("See the latest release")}
              </a>
            )}
            {state === "ready" && release && <span className="font-mono text-[12px] text-muted">v{release.version}</span>}
          </div>
          {state === "ready" && release?.firefoxZip && (
            <p className="mt-3 text-[13.5px] text-muted">
              <Trans
                i18nKey="Firefox: <a>download the Firefox zip</a> and open it from about:debugging (Load Temporary Add-on). Firefox removes it when it restarts, until the extension is in the add-ons store."
                components={{ a: <a href={release.firefoxZip} className="text-accent" /> }}
              />
            </p>
          )}

          <h2 className="mt-12 text-[13px] font-semibold">{t("Install it in Chrome or Edge")}</h2>
          <p className="mt-1.5 text-[13.5px] text-muted">{t("It isn't in the browser stores yet, so it installs by hand. It takes a minute.")}</p>
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
