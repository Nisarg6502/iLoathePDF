import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const RELEASES_URL = "https://github.com/Nisarg6502/iLoathePDF/releases";
const LATEST_RELEASE_API = "https://api.github.com/repos/Nisarg6502/iLoathePDF/releases/latest";

interface LatestRelease {
  version: string;
  downloadUrl: string;
  sizeMb: number;
}

function useLatestRelease() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [release, setRelease] = useState<LatestRelease | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(LATEST_RELEASE_API)
      .then((res) => {
        if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
        return res.json();
      })
      .then((data: { tag_name: string; assets: { name: string; browser_download_url: string; size: number }[] }) => {
        if (cancelled) return;
        const asset = data.assets.find((a) => a.name.endsWith(".exe"));
        if (!asset) throw new Error("no .exe asset on the latest release");
        setRelease({
          version: data.tag_name,
          downloadUrl: asset.browser_download_url,
          sizeMb: Math.round(asset.size / (1024 * 1024)),
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

export function Download() {
  const { state, release } = useLatestRelease();

  const perks = [
    ["Files of any size", "Limited by your disk, not by tab memory."],
    ["Batch and folders", "Point it at 300 scans and walk away."],
    ["Output where you want it", "Per-tool destinations, remembered."],
    ["Ghostscript compression", "The full engine, not the browser preview."],
    ["Zero network code", "Not \"we don't send\" — it cannot send."],
  ];

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-14">
      <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[1fr_400px]">
        <div>
          <span className="font-mono text-[10.5px] font-bold tracking-[0.15em] text-accent">WINDOWS</span>
          <h1 className="mt-4 text-[40px] font-semibold leading-[1.05] tracking-[-0.035em]">
            The same eight tools, with no browser in the way.
          </h1>
          <p className="mt-4 max-w-[48ch] text-base leading-relaxed text-muted">
            Bigger files, whole folders at once, output saved where you want
            it. Contains no networking code at all — the build cannot phone
            home even if you ask it to.
          </p>

          <div className="mt-7 flex items-center gap-3">
            {state === "ready" && release ? (
              <a
                href={release.downloadUrl}
                className="inline-flex h-11 items-center gap-2 rounded-[11px] bg-accent px-5 text-[14.5px] font-semibold text-on-accent shadow-[var(--shadow-card)] transition-transform duration-100 hover:bg-accent-hi active:bg-accent-deep active:scale-[0.97]"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M8 2v8.5M4.5 7l3.5 3.5L11.5 7M3 13.5h10" />
                </svg>
                Download for Windows
              </a>
            ) : state === "loading" ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-[11px] bg-surface-3 px-5 text-[14.5px] font-semibold text-faint">
                <svg className="spinner size-3.5" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                  <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Checking latest release…
              </span>
            ) : (
              <a
                href={RELEASES_URL}
                className="inline-flex h-11 items-center gap-2 rounded-[11px] bg-accent px-5 text-[14.5px] font-semibold text-on-accent shadow-[var(--shadow-card)] transition-transform duration-100 hover:bg-accent-hi active:bg-accent-deep active:scale-[0.97]"
              >
                See the latest release
              </a>
            )}
            {state === "ready" && release && (
              <span className="font-mono text-[12px] text-muted">
                {release.version} · {release.sizeMb} MB
              </span>
            )}
          </div>

          <p className="mt-5 text-[13.5px] leading-relaxed text-muted">
            Builds are published from{" "}
            <a href={RELEASES_URL} className="text-accent">
              the project's GitHub Releases
            </a>
            .
          </p>
          <p className="mt-6 text-[13.5px] leading-relaxed text-muted">
            No installer for macOS or Linux yet. Both work fine in the
            browser version — <Link to="/tools" className="text-accent">open the tools</Link> instead.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-border px-4.5 py-3.5 text-[12.5px] font-semibold">
            What the desktop app adds
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
  );
}
