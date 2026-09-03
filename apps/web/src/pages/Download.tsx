import { Link } from "react-router-dom";

export function Download() {
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
            The same seven tools, with no browser in the way.
          </h1>
          <p className="mt-4 max-w-[48ch] text-base leading-relaxed text-muted">
            Bigger files, whole folders at once, output saved where you want
            it. Contains no networking code at all — the build cannot phone
            home even if you ask it to.
          </p>
          <p className="mt-6 text-[13.5px] leading-relaxed text-muted">
            Builds are published from{" "}
            <a href="https://github.com/Nisarg6502/IHatePDF/releases" className="text-accent">
              the project's GitHub Releases
            </a>{" "}
            once available.
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
