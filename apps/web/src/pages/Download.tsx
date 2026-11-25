import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LayoutGroup, motion } from "motion/react";
import { DesktopAppArt } from "@/components/DesktopAppArt";
import { tr, Trans, useTranslation } from "@iloathepdf/i18n";

const RELEASES_URL = "https://github.com/Nisarg6502/iLoathePDF/releases";
// Fixed file names on every release (see release-desktop.yml), so these
// always download the newest build. The page can't ask the GitHub API which
// version is newest: the site's CSP allows no connections to other servers,
// and that promise matters more than showing a version number.
const LATEST = "https://github.com/Nisarg6502/iLoathePDF/releases/latest/download";
const WINDOWS_URL = `${LATEST}/iLoathePDF-setup.exe`;
const MAC_APPLE_SILICON_URL = `${LATEST}/iLoathePDF-mac-apple-silicon.dmg`;
const MAC_INTEL_URL = `${LATEST}/iLoathePDF-mac-intel.dmg`;

type Os = "windows" | "mac";

/** ?os=mac or ?os=windows wins (for links); otherwise the visitor's own system. */
function initialOs(param: string | null): Os {
  if (param === "mac" || param === "windows") return param;
  if (typeof navigator === "undefined") return "windows";
  return /Macintosh|Mac OS X/.test(navigator.userAgent) ? "mac" : "windows";
}

const BUTTON =
  "inline-flex h-11 items-center gap-2 rounded-[11px] bg-accent px-5 text-[14.5px] font-semibold text-on-accent shadow-[var(--shadow-card)] transition-transform duration-100 hover:bg-accent-hi active:bg-accent-deep active:scale-[0.97]";

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M8 2v8.5M4.5 7l3.5 3.5L11.5 7M3 13.5h10" />
    </svg>
  );
}

function OsSwitch({ os, onChange }: { os: Os; onChange: (os: Os) => void }) {
  const { t } = useTranslation();
  const options: [Os, string][] = [
    ["windows", t("Windows")],
    ["mac", t("macOS")],
  ];
  return (
    <LayoutGroup id="download-os">
      <div role="tablist" aria-label={t("Your computer")} className="inline-flex gap-1 rounded-full border border-border bg-surface p-1">
        {options.map(([id, label]) => (
          <button
            key={id}
            id={`os-tab-${id}`}
            role="tab"
            type="button"
            aria-selected={os === id}
            aria-controls={`os-panel-${id}`}
            onClick={() => onChange(id)}
            className={`relative rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-colors duration-150 ${
              os === id ? "text-on-tint" : "text-muted hover:text-text"
            }`}
          >
            {os === id && (
              <motion.span layoutId="download-os-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

function WindowsPanel() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a href={WINDOWS_URL} className={BUTTON}>
        <DownloadIcon />
        {t("Download for Windows")}
      </a>
      <span className="font-mono text-[12px] text-muted">{t("Windows 10 and 11, 64-bit")}</span>
    </div>
  );
}

function MacPanel() {
  const { t } = useTranslation();
  const steps = [
    tr("Open the downloaded file and drag iLoathePDF into Applications."),
    tr("Open iLoathePDF from Applications. macOS says it can't check the app, so click Done."),
    tr("Open System Settings, then Privacy & Security. Scroll down and click Open Anyway next to iLoathePDF, then confirm."),
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <a href={MAC_APPLE_SILICON_URL} className={BUTTON}>
          <DownloadIcon />
          {t("Download for Mac with Apple silicon")}
        </a>
        <span className="font-mono text-[12px] text-muted">{t("macOS 11 or later")}</span>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
        <Trans
          i18nKey="Mac with an Intel chip? <a>Download the Intel version</a>. To check, open the Apple menu and choose About This Mac: a chip called Apple M1, M2 or later is Apple silicon."
          components={{ a: <a href={MAC_INTEL_URL} className="text-accent" /> }}
        />
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-border px-4.5 py-3.5">
          <div className="text-[13px] font-semibold">{t("The first time you open it")}</div>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">
            {t("iLoathePDF is free, so it isn't registered with Apple, which charges developers a yearly fee. macOS asks you to confirm it once.")}
          </p>
        </div>
        <ol className="flex flex-col gap-3 px-4.5 py-4">
          {steps.map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-[13.5px] leading-relaxed">
              <span className="grid size-6 flex-none place-items-center rounded-full bg-surface-3 font-mono text-[11.5px] font-bold text-muted">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="border-t border-border px-4.5 py-3.5 text-[12.5px] leading-relaxed text-muted">
          <p>{t("On macOS 14 or earlier you can instead Control-click the app in Applications and choose Open.")}</p>
          <p className="mt-2">
            {t("If macOS says the app is damaged, run this once in Terminal, then open it again:")}{" "}
            <code className="select-all rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11.5px] text-text">xattr -cr /Applications/iLoathePDF.app</code>
          </p>
        </div>
      </div>
    </>
  );
}

export function Download() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [os, setOs] = useState<Os>(() => initialOs(params.get("os")));

  const perks = [
    [tr("Files of any size"), tr("Limited by your disk, not by tab memory.")],
    [tr("Batch and folders"), tr("Point it at 300 scans and walk away.")],
    [tr("Output where you want it"), tr("Per-tool destinations, remembered.")],
    [tr("Ghostscript compression"), tr("The full engine, not the browser preview.")],
    [tr("Offline by default"), tr("An optional update check is off until you turn it on.")],
  ];

  return (
    <div className="mx-auto max-w-[1100px] px-5 sm:px-8 py-14">
      <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[1fr_400px]">
        <div>
          <span className="font-mono text-[10.5px] font-bold tracking-[0.15em] text-accent">{t("WINDOWS · MACOS")}</span>
          <h1 className="mt-4 text-[40px] font-semibold leading-[1.05] tracking-[-0.035em]">
            {t("All twenty-two tools, with no browser in the way.")}
          </h1>
          <p className="mt-4 max-w-[48ch] text-base leading-relaxed text-muted">
            {t("Bigger files, whole folders at once, output saved where you want it. Your files never touch the network. The only network feature is an optional update check, off until you switch it on.")}
          </p>

          <div className="mt-7">
            <OsSwitch os={os} onChange={setOs} />
          </div>
          <div id={`os-panel-${os}`} role="tabpanel" aria-labelledby={`os-tab-${os}`} className="mt-5">
            {os === "windows" ? <WindowsPanel /> : <MacPanel />}
          </div>

          <p className="mt-6 text-[13.5px] leading-relaxed text-muted">
            <Trans
              i18nKey="Builds are published from <a>the project's GitHub Releases</a>."
              components={{ a: <a href={RELEASES_URL} className="text-accent" /> }}
            />
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            <Trans
              i18nKey="No installer for Linux yet. It works fine in the browser version: <a>open the tools</a> instead."
              components={{ a: <Link to="/tools" className="text-accent" /> }}
            />
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            <Trans
              i18nKey="Use Chrome, Edge or Firefox? <a>Get the browser extension</a> to fit files to upload forms and save any image as a PDF."
              components={{ a: <Link to="/extension" className="text-accent" /> }}
            />
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <DesktopAppArt />

          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
            <div className="border-b border-border px-4.5 py-3.5 text-[12.5px] font-semibold">
              {t("What the desktop app adds")}
            </div>
            <div className="px-4.5 pb-3.5 pt-1.5">
              {perks.map(([title, body]) => (
                <div key={title} className="flex items-start gap-2.5 border-b border-border py-3.5 last:border-b-0">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--ok)" strokeWidth="1.8" className="mt-0.5 flex-none">
                    <path d="M2.5 8.4l3.2 3.2L13.5 4" />
                  </svg>
                  <div>
                    <div className="text-[13.5px] font-medium">{title}</div>
                    <div className="text-[12.5px] text-muted">{body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
