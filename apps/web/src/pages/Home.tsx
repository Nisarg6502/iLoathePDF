import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useRequestCount } from "@/components/layout/RequestStatusContext";
import { HeroDemo } from "@/components/HeroDemo";
import { TOOLS } from "@/tools/registry";
import { tintColor, tintWash } from "@/tools/tint";

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

        <HeroDemo />
      </div>

      <div className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-8 py-14">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="m-0 text-[26px] font-semibold tracking-[-0.025em]">Seven tools, one page each</h2>
            <Link to="/tools" className="text-[13.5px] text-accent">See all →</Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {["compress", "merge", "split", "organize"]
              .map((slug) => TOOLS.find((t) => t.slug === slug))
              .filter((t): t is (typeof TOOLS)[number] => Boolean(t))
              .map((tool, i) => (
                <motion.div
                  key={tool.slug}
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  whileInView={{ opacity: 1, transform: "translateY(0px)" }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.08, ease: [0.23, 1, 0.32, 1] }}
                >
                  <Link
                    to={`/tools/${tool.slug}`}
                    className="block rounded-[13px] border border-border p-4.5 transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
                    style={{ background: tintWash(tool.tint, 5) }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = tintColor(tool.tint);
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "";
                    }}
                  >
                    <tool.Icon className="size-5" />
                    <div className="mt-2.5 text-sm font-semibold">{tool.name}</div>
                    <div className="mt-1 text-[12.5px] leading-snug text-muted">{tool.description}</div>
                  </Link>
                </motion.div>
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
          ].map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, transform: "translateY(10px)" }}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="rounded-[13px] border border-border bg-surface p-5.5"
            >
              <span className="font-mono text-[11px] font-bold text-accent">{s.n}</span>
              <div className="mt-2.5 text-[15px] font-semibold">{s.title}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.body}</p>
            </motion.div>
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
