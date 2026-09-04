import { Link } from "react-router-dom";
import { useRequestCount } from "@/components/layout/RequestStatusContext";

export function Home() {
  const reqCount = useRequestCount();

  return (
    <div>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-8 pb-16 pt-12 md:grid-cols-2 md:gap-16">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <span className="size-1.5 rounded-sm bg-accent" />
            <span className="font-mono text-[10.5px] font-bold tracking-[0.15em] text-muted">
              SEVEN TOOLS · ZERO UPLOADS
            </span>
          </div>
          <h1 className="m-0 text-[clamp(38px,4.2vw,58px)] font-semibold leading-[1.02] tracking-[-0.035em] text-balance">
            Your files never leave this tab.
          </h1>
          <p className="mt-5 max-w-[44ch] text-[16.5px] leading-relaxed text-muted text-pretty">
            Merge, split, compress, organize and convert — running entirely
            on your own machine. There is no upload step, because there is
            nowhere to upload to.
          </p>
          <div className="mt-8 flex gap-2.5">
            <Link
              to="/tools/compress"
              className="inline-flex h-11 items-center gap-2 rounded-[11px] bg-accent px-5 text-[14.5px] font-semibold text-on-accent shadow-[var(--shadow-card)] transition-transform duration-100 hover:bg-accent-hi active:scale-[0.97]"
            >
              Open the tools
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <Link
              to="/download"
              className="inline-flex h-11 items-center rounded-[11px] border border-border-hi bg-surface px-4.5 text-[14.5px] font-medium text-text transition-transform duration-100 hover:bg-surface-2 active:scale-[0.97]"
            >
              Get the desktop app
            </Link>
          </div>
          <div className="mt-6 flex w-fit items-center gap-3.5 rounded-[10px] border border-border bg-surface px-3.5 py-2.5">
            <span className="flex items-center gap-1.5 text-xs text-ok">
              <span className="size-1.5 rounded-full bg-ok" />
              Runs locally, no uploads
            </span>
            <span className="h-3.5 w-px bg-border" />
            <span className="font-mono text-[11.5px] text-muted">
              {reqCount} network requests since load · 0 bytes sent
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
          <div className="flex h-[38px] items-center gap-2 border-b border-border bg-surface-2 px-3.5">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-border-hi" />
              <span className="size-2.5 rounded-full bg-border-hi" />
              <span className="size-2.5 rounded-full bg-border-hi" />
            </span>
            <span className="flex-1" />
            <span className="font-mono text-[10.5px] text-faint">iloathepdf.app/compress</span>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-6.5 place-items-center rounded-lg bg-surface-2">
                <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="var(--tint-d)" strokeWidth="1.5">
                  <rect x="2.5" y="2.5" width="13" height="13" rx="1.2" />
                  <path d="M5.5 5.5L8 8M8 8V5.6M8 8H5.6M12.5 12.5L10 10M10 10v2.4M10 10h2.4" />
                </svg>
              </span>
              <span className="text-[13.5px] font-semibold">Compress PDF</span>
              <span className="flex-1" />
              <span className="font-mono text-[10.5px] text-ok">DONE</span>
            </div>
            <div className="mt-4.5 rounded-xl border border-border bg-surface-2 p-5">
              <div className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-faint">RESULT</div>
              <div className="mt-3 flex items-baseline gap-3 font-mono">
                <span className="text-[22px] text-faint line-through">3.14 MB</span>
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--faint)" strokeWidth="1.5">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
                <span className="text-[38px] font-bold tracking-[-0.03em]">812 KB</span>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-3">
                <span className="w-1/4 bg-ok" />
              </div>
              <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
                <span>−75% smaller</span>
                <span>quality: balanced</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-8 py-14">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="m-0 text-[26px] font-semibold tracking-[-0.025em]">Seven tools, one page each</h2>
            <Link to="/tools" className="text-[13.5px] text-accent">See all →</Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { to: "/tools/compress", title: "Compress PDF", desc: "Shrink for email, with the quality trade-off shown first." },
              { to: "/tools/merge", title: "Merge PDF", desc: "Combine in the order you choose, page ranges per file." },
              { to: "/tools/split", title: "Split PDF", desc: "Ranges, every N pages, extract or delete a selection." },
              { to: "/tools/organize", title: "Organize pages", desc: "Reorder, rotate and drop pages on a page canvas." },
            ].map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="rounded-[13px] border border-border bg-bg p-4.5 transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-strong)] hover:-translate-y-0.5 hover:border-border-hi hover:shadow-[var(--shadow-card)]"
              >
                <div className="mt-2.5 text-sm font-semibold">{t.title}</div>
                <div className="mt-1 text-[12.5px] leading-snug text-muted">{t.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-8 py-16">
        <h2 className="m-0 mb-1.5 text-[26px] font-semibold tracking-[-0.025em]">Why nothing uploads</h2>
        <p className="m-0 max-w-[56ch] text-[15px] text-muted">
          Merge, split and the other tools run against the same file
          structures the desktop app understands. Your browser runs them
          locally.
        </p>
        <div className="mt-7 grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {[
            { n: "01", title: "Nothing loads except the page", body: "The tool code arrives with the page like any other script and runs in this tab. That is the last request the site makes." },
            { n: "02", title: "Your file stays put", body: "Files are read through the File API into memory the tab owns. No fetch, no form post, no signed URL." },
            { n: "03", title: "Result is a local save", body: "Output is a blob your browser writes to disk. Close the tab and every trace is gone." },
          ].map((s) => (
            <div key={s.n} className="rounded-[13px] border border-border bg-surface p-5.5">
              <span className="font-mono text-[11px] font-bold text-accent">{s.n}</span>
              <div className="mt-2.5 text-[15px] font-semibold">{s.title}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-[1fr_300px]">
          <div className="flex items-center gap-3 rounded-[13px] border border-border bg-surface px-5 py-4.5">
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" className="flex-none">
              <circle cx="8" cy="8" r="6.3" />
              <path d="M8 5.2v.2M8 7.4v3.4" />
            </svg>
            <span className="text-[13.5px] leading-relaxed text-muted">
              Verify it yourself: open DevTools → Network, run any tool, and
              watch the request list stay exactly where it is.{" "}
              <Link to="/privacy" className="text-accent">More on privacy</Link>
            </span>
          </div>
          <div className="rounded-[13px] border border-border bg-surface px-5 py-4.5 font-mono">
            <div className="text-[10px] font-bold tracking-[0.13em] text-faint">NETWORK PANEL</div>
            <div className="mt-3 flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted">requests</span><span>{reqCount}</span></div>
              <div className="flex justify-between"><span className="text-muted">bytes sent</span><span>0</span></div>
              <div className="flex justify-between"><span className="text-muted">cookies</span><span>0</span></div>
              <div className="flex justify-between border-t border-border pt-1.5"><span className="text-muted">engine</span><span className="text-ok">local</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
