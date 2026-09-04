/**
 * Settings. Deliberately short: this is a single-user tool, so anything that
 * can sensibly be decided once lives here, and everything else stays on the
 * tool screen where the decision is actually being made.
 */
import { useEffect, useState } from "react";
import { FolderOpen, RotateCcw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isTauri, ping, type PingResult } from "@/lib/jobs";
import { useOutputDir } from "@/lib/settings";

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

export default function Settings() {
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
            SETTINGS
          </span>
        </div>

        <Section
          title="Where results are saved"
          hint="By default a result is written next to the file it came from. Pick a folder to send every result to the same place instead."
        >
          <div className="flex items-center gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border-hi bg-surface px-3">
              <FolderOpen className="size-3.5 flex-none" style={{ color: "var(--tint-e)" }} />
              <span
                data-selectable
                className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text"
                title={outputDir ?? undefined}
              >
                {outputDir ?? "Next to each input file"}
              </span>
            </div>
            <Button variant="secondary" onClick={() => void choose()} disabled={!isTauri()}>
              Change
            </Button>
            {outputDir ? (
              <Button variant="ghost" onClick={clear} aria-label="Use the default location">
                <RotateCcw />
                Reset
              </Button>
            ) : null}
          </div>
          {!isTauri() ? (
            <p className="mt-2 text-[13px] text-faint">
              Choosing a folder needs the desktop app; the browser preview cannot open a native
              folder picker.
            </p>
          ) : null}
        </Section>

        <Section
          title="Privacy"
          hint="These are properties of the build, not preferences — there is nothing here to switch off, which is the point."
        >
          <ul className="grid gap-2">
            {[
              "No network code. The app makes no requests, and the window blocks every remote origin.",
              "No analytics, no crash reporting, no auto-updater.",
              "EXIF, including GPS, is stripped from converted images by default.",
              "Results are written atomically and never overwrite an existing file.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[13.5px] text-text">
                <ShieldCheck className="mt-px size-4 flex-none text-ok" />
                <span className="text-muted">{line}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Document engine" hint="The local process that does the actual work.">
          {engine ? (
            <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-[13.5px]">
              <dt className="text-muted">Status</dt>
              <dd className="text-ok">Running</dd>
              <dt className="text-muted">Engine version</dt>
              <dd className="font-mono text-[12.5px] text-text">{engine.version}</dd>
              <dt className="text-muted">Python</dt>
              <dd className="font-mono text-[12.5px] text-text">{engine.python}</dd>
            </dl>
          ) : engineError ? (
            <p className="text-[13.5px] text-danger">{engineError}</p>
          ) : (
            <p className="text-[13.5px] text-muted">Checking…</p>
          )}
        </Section>
      </div>
    </div>
  );
}
