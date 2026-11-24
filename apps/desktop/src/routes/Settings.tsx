/**
 * Settings. Deliberately short: this is a single-user tool, so anything that
 * can sensibly be decided once lives here, and everything else stays on the
 * tool screen where the decision is actually being made.
 */
import { useEffect, useState } from "react";
import { FolderOpen, RotateCcw, ShieldCheck } from "lucide-react";

import { i18n, isLanguageCode, LANGUAGES, tr, Trans, useLanguage, useTranslation } from "@iloathepdf/i18n";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CHANGELOG } from "@/lib/changelog";
import { isTauri, ping, type PingResult } from "@/lib/jobs";
import { useOutputDir } from "@/lib/settings";
import {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  setAutoDownload,
  setUpdateCheckEnabled,
  useUpdateCheck,
} from "@/lib/useUpdateCheck";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-6 first:border-t-0 first:pt-0">
      <h2 className="text-[14.5px] font-semibold text-text">{title}</h2>
      {hint ? <p className="mt-1 max-w-[62ch] text-[13.5px] text-muted">{hint}</p> : null}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

function UpdatesPanel() {
  const { t } = useTranslation();
  const update = useUpdateCheck();
  const { enabled, autoDownload, status, latest, progress, checkedAt, error } = update;

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <Switch
          id="update-check"
          checked={enabled}
          onCheckedChange={setUpdateCheckEnabled}
          aria-labelledby="update-check-label"
        />
        <div className="min-w-0">
          <label
            id="update-check-label"
            htmlFor="update-check"
            className="text-[13.5px] font-semibold text-text"
          >
            {t("Tell me when a new version is available")}
          </label>
          <p className="mt-0.5 text-[13px] text-muted">
            {enabled
              ? t("On. The app checks when it starts and shows a notice if there is a newer release. You choose when to install it. Switch this off at any time and it stops.")
              : t("Off. The app makes no network requests.")}
          </p>
        </div>
      </div>

      <div className="max-w-[62ch] rounded-lg border border-border bg-surface px-3.5 py-3 text-[13px] text-muted">
        <div className="mb-1.5 font-mono text-[11px] font-bold tracking-[0.13em] text-faint">
          {t("WHAT HAPPENS WHEN THIS IS ON")}
        </div>
        <ul className="grid gap-1.5">
          <li>
            {t("The app asks GitHub one question, “what is the latest release of iLoathePDF?”, by fetching one small file:")}{" "}
            <span className="font-mono text-[12px] text-text">
              github.com/Nisarg6502/iLoathePDF/releases/latest/download/latest.json
            </span>
          </li>
          <li>
            {t("Nothing about you goes out: no files, no file names, no settings, no installed version, no ID, no cookies. The comparison with your version happens on this computer.")}
          </li>
          <li>
            {t("Like any website you visit, GitHub can see that a connection came from your internet address. We receive nothing and keep no record.")}
          </li>
          <li>
            <Trans
              i18nKey="Nothing is downloaded until you press <b>Update now</b> (or turn on automatic download below). The download keeps running in the background while you work, and it is checked against a signing key built into this app; a file that does not match is thrown away. Installing only happens when you press <b>Restart & update</b>."
              components={{ b: <strong /> }}
            />
          </li>
        </ul>
      </div>

      {enabled ? (
        <div className="flex items-start gap-3">
          <Switch
            id="update-auto"
            checked={autoDownload}
            onCheckedChange={setAutoDownload}
            aria-labelledby="update-auto-label"
          />
          <div className="min-w-0">
            <label
              id="update-auto-label"
              htmlFor="update-auto"
              className="text-[13.5px] font-semibold text-text"
            >
              {t("Download new versions in the background")}
            </label>
            <p className="mt-0.5 text-[13px] text-muted">
              {autoDownload
                ? t("On. A new version downloads by itself (the installer is large) and waits for you to restart. It is never installed without you.")
                : t("Off. A new version only downloads when you press Update now.")}
            </p>
          </div>
        </div>
      ) : null}

      {enabled ? (
        <div className="flex flex-wrap items-center gap-3">
          {status === "available" && latest ? (
            <Button onClick={() => void downloadUpdate()}>
              {error ? t("Retry update") : t("Update now")}
            </Button>
          ) : status === "downloading" ? (
            <Button disabled>{t("Downloading…")}</Button>
          ) : status === "ready" ? (
            <Button onClick={() => void installUpdate()}>
              {error ? t("Retry install") : t("Restart & update")}
            </Button>
          ) : status === "installing" ? (
            <Button disabled>{t("Installing…")}</Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => void checkForUpdate()}
              disabled={status === "checking"}
            >
              {status === "checking" ? t("Checking…") : t("Check now")}
            </Button>
          )}
          <span
            className={`text-[13.5px] ${status === "error" || error ? "text-danger" : "text-muted"}`}
            role="status"
          >
            {error
              ? error
              : status === "error"
                ? t("The check failed.")
                : status === "downloading" && latest
                  ? progress?.total
                    ? t("Downloading {{version}}: {{percent}}%…", {
                        version: latest.version,
                        percent: Math.round((progress.downloaded / progress.total) * 100),
                      })
                    : t("Downloading {{version}}…", { version: latest.version })
                  : status === "ready" && latest
                    ? t("Version {{version}} is downloaded and ready. Windows will ask for permission, then the app reopens.", { version: latest.version })
                    : status === "installing"
                      ? t("Handing over to the installer…")
                      : status === "available" && latest
                        ? t("Version {{version}} is available (you have {{appVersion}}).", { version: latest.version, appVersion: __APP_VERSION__ })
                        : status === "current"
                          ? checkedAt
                            ? t("You are up to date (checked {{when}}).", { when: formatChecked(checkedAt) })
                            : t("You are up to date.")
                          : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function formatChecked(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return tr("just now");
  // The interface language, not the OS locale, so the time reads the same way as the text around it.
  return new Date(at).toLocaleTimeString(i18n.resolvedLanguage, { hour: "numeric", minute: "2-digit" });
}

function LanguagePanel() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <div className="max-w-[280px]">
      <Select
        aria-label={t("Interface language")}
        value={language}
        onChange={(e) => {
          if (isLanguageCode(e.target.value)) void setLanguage(e.target.value);
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.code === "en" ? l.nativeName : `${l.nativeName} (${l.englishName})`}
          </option>
        ))}
      </Select>
    </div>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const { outputDir, choose, clear } = useOutputDir();
  const [engine, setEngine] = useState<PingResult | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    ping()
      .then((r) => alive && setEngine(r))
      .catch((e) => alive && setEngineError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl px-10 pt-8 pb-12">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="size-1.5 rounded-[2px] bg-accent" />
          <span className="font-mono text-[11px] font-bold tracking-[0.16em] text-muted">
            {t("SETTINGS")}
          </span>
        </div>

        <Section
          title={t("Language")}
          hint={t("Changes the app's own text. Your files and their contents are never translated or changed.")}
        >
          <LanguagePanel />
        </Section>

        <Section
          title={`iLoathePDF ${__APP_VERSION__}`}
          hint={t(
            "To update, switch on the update check under Updates below and the app can download and install new versions itself. Or download the newest installer from the Download page on the website (or the GitHub Releases page) and run it over this one.",
          )}
        >
          <div className="mb-2 font-mono text-[11px] font-bold tracking-[0.13em] text-faint">
            {t("WHAT’S NEW")}
          </div>
          <div className="grid gap-4">
            {CHANGELOG.map((release) => (
              <div key={release.version}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[13.5px] font-semibold text-text">v{release.version}</span>
                  <span className="font-mono text-[11.5px] text-faint">{release.date}</span>
                  {release.version === __APP_VERSION__ ? (
                    <span className="rounded bg-accent-soft px-1.5 py-px font-mono text-[10.5px] font-bold tracking-[0.06em] text-accent">
                      {t("INSTALLED")}
                    </span>
                  ) : null}
                </div>
                <ul className="mt-1.5 grid gap-1">
                  {release.highlights.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-[13.5px] text-muted">
                      <span className="mt-[9px] size-1 flex-none rounded-full bg-faint" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title={t("Updates")}
          hint={t(
            "Off by default. iLoathePDF is otherwise fully offline; this is the one thing that can change that, and only if you switch it on.",
          )}
        >
          <UpdatesPanel />
        </Section>

        <Section
          title={t("Where results are saved")}
          hint={t(
            "By default a result is written next to the file it came from. Pick a folder to send every result to the same place instead.",
          )}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border-hi bg-surface px-3">
              <FolderOpen className="size-3.5 flex-none" style={{ color: "var(--tint-e)" }} />
              <span
                data-selectable
                className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text"
                title={outputDir ?? undefined}
              >
                {outputDir ?? t("Next to each input file")}
              </span>
            </div>
            <Button variant="secondary" onClick={() => void choose()} disabled={!isTauri()}>
              {t("Change")}
            </Button>
            {outputDir ? (
              <Button variant="ghost" onClick={clear} aria-label={t("Use the default location")}>
                <RotateCcw />
                {t("Reset")}
              </Button>
            ) : null}
          </div>
          {!isTauri() ? (
            <p className="mt-2 text-[13px] text-faint">
              {t(
                "Choosing a folder needs the desktop app; the browser preview cannot open a native folder picker.",
              )}
            </p>
          ) : null}
        </Section>

        <Section
          title={t("Privacy")}
          hint={t("Everything below is true of the build whether or not you turn on the update check.")}
        >
          <ul className="grid gap-2">
            {[
              t("Your files never touch the network. The only network code is the optional update check above (and the update download you start from it), and it is off unless you turn it on. The window itself blocks every remote origin."),
              t("No analytics, no crash reporting, and nothing is ever downloaded or installed automatically."),
              t("EXIF, including GPS, is stripped from converted images by default."),
              t("Results are written atomically and never overwrite an existing file."),
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[13.5px] text-text">
                <ShieldCheck className="mt-px size-4 flex-none text-ok" />
                <span className="text-muted">{line}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("Document engine")} hint={t("The local process that does the actual work.")}>
          {engine ? (
            <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-[13.5px]">
              <dt className="text-muted">{t("Status")}</dt>
              <dd className="text-ok">{t("Running")}</dd>
              <dt className="text-muted">{t("Engine version")}</dt>
              <dd className="font-mono text-[12.5px] text-text">{engine.version}</dd>
              <dt className="text-muted">Python</dt>
              <dd className="font-mono text-[12.5px] text-text">{engine.python}</dd>
            </dl>
          ) : engineError ? (
            <p className="text-[13.5px] text-danger">{engineError}</p>
          ) : (
            <p className="text-[13.5px] text-muted">{t("Checking…")}</p>
          )}
        </Section>
      </div>
    </div>
  );
}
