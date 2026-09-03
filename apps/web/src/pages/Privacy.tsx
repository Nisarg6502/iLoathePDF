import { Link } from "react-router-dom";
import { useRequestCount } from "@/components/layout/RequestStatusContext";

export function Privacy() {
  const reqCount = useRequestCount();
  const items = [
    ["Upload your file", "there is no endpoint that accepts one."],
    ["Set cookies", "your theme choice is the one exception, kept in this browser via localStorage."],
    ["Load web fonts or scripts from third parties", "fonts and code are served from this domain."],
    ["Ask who you are", "no sign-up, no email, no usage cap tied to an identity."],
  ];

  return (
    <div className="mx-auto max-w-[820px] px-8 py-14">
      <h1 className="m-0 text-4xl font-semibold tracking-[-0.032em]">Privacy</h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        Short version: this site has no server-side processing, no accounts,
        no analytics and no cookies beyond a theme preference. There is
        nothing to write a policy about, so here is what happens instead.
      </p>

      <div className="mt-8 rounded-[14px] border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <span className="size-1.75 rounded-full bg-ok" />
          <span className="font-mono text-[10.5px] font-bold tracking-[0.13em] text-ok">THIS SESSION</span>
        </div>
        <div className="mt-4.5 grid grid-cols-2 gap-4 font-mono sm:grid-cols-4">
          <div>
            <div className="text-[30px] font-bold tracking-[-0.03em]">{reqCount}</div>
            <div className="mt-0.5 text-[10.5px] text-muted">REQUESTS</div>
          </div>
          <div>
            <div className="text-[30px] font-bold tracking-[-0.03em]">0</div>
            <div className="mt-0.5 text-[10.5px] text-muted">BYTES SENT</div>
          </div>
          <div>
            <div className="text-[30px] font-bold tracking-[-0.03em]">0</div>
            <div className="mt-0.5 text-[10.5px] text-muted">TRACKERS</div>
          </div>
        </div>
        <p className="mt-4.5 text-[13px] leading-relaxed text-muted">
          Counted by the page itself, live, from every fetch() and
          XMLHttpRequest call. Confirm it in DevTools → Network: load the
          site, run a tool, and the request list stays where it is.
        </p>
      </div>

      <h2 className="mt-11 text-xl font-semibold tracking-[-0.02em]">What the site does not do</h2>
      <div className="mt-4 flex flex-col">
        {items.map(([title, body]) => (
          <div key={title} className="flex items-start gap-3 border-t border-border py-3.5 last:border-b">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--faint)" strokeWidth="1.5" className="mt-0.5 flex-none">
              <circle cx="8" cy="8" r="6.3" />
              <path d="M4 4l8 8" />
            </svg>
            <div>
              <span className="text-sm font-medium">{title}</span>
              <span className="text-sm text-muted"> — {body}</span>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-11 text-xl font-semibold tracking-[-0.02em]">The desktop build goes further</h2>
      <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">
        A browser can always be told to make a request by something else on
        the page. The Windows app removes that possibility: it ships with no
        networking code, no analytics, no auto-updater and no web fonts.
        Nothing in it can be switched on.
      </p>
      <Link to="/download" className="mt-4.5 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
        Get the desktop app
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </Link>
    </div>
  );
}
