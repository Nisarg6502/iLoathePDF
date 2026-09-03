export function HowItWorks() {
  const steps = [
    { n: "01", title: "The tool code arrives with the page", body: "The site is a normal web app: HTML, CSS and JS load like any other page. After that, opening a tool makes no further requests." },
    { n: "02", title: "Your file is read, not uploaded", body: "Dropping a file hands the browser a local handle. The bytes go into memory the tab owns. There is no fetch() anywhere in the tool code." },
    { n: "03", title: "Processing happens in your browser", body: "Merge, split, organize and the PDF/image conversions run against the file in memory using pdf-lib and pdf.js — the same libraries, running locally, every time." },
    { n: "04", title: "The result is a download", body: "Output comes back as a blob and your browser saves it wherever downloads go. Nothing persists in the tab once you close it." },
  ];

  const rows = [
    ["File size ceiling", "~200 MB", "Disk-bound"],
    ["Batch / whole folders", "No", "Yes"],
    ["Saves to a folder you pick", "Downloads only", "Yes"],
    ["Ghostscript-grade compression", "Preview only", "Full"],
    ["Install required", "None", "14 MB installer"],
  ];

  return (
    <div className="mx-auto max-w-[820px] px-8 py-14">
      <h1 className="m-0 text-4xl font-semibold tracking-[-0.032em]">How it works</h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        The desktop app and this website process the same kinds of files. On
        Windows the engine is native (Rust + Python + Ghostscript); in the
        browser it's pdf-lib and pdf.js, running against the file you drop.
        Neither one has a server behind it.
      </p>

      <div className="mt-10 flex flex-col">
        {steps.map((s) => (
          <div key={s.n} className="grid grid-cols-[80px_1fr] gap-6 border-t border-border py-6 last:border-b">
            <span className="font-mono text-xs font-bold text-accent">{s.n}</span>
            <div>
              <div className="text-[17px] font-semibold">{s.title}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-[22px] font-semibold tracking-[-0.02em]">Where the browser has limits</h2>
      <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">
        Being honest about this is the point of the desktop build.
      </p>
      <div className="mt-5 overflow-hidden rounded-[14px] border border-border">
        <div className="grid grid-cols-3 border-b border-border bg-surface-2 px-4.5 py-3 font-mono text-[10.5px] font-bold tracking-[0.12em] text-faint">
          <span /><span>BROWSER</span><span>DESKTOP</span>
        </div>
        {rows.map((row) => (
          <div key={row[0]} className="grid grid-cols-3 items-center border-b border-border px-4.5 py-3.5 text-[13.5px] last:border-b-0">
            <span>{row[0]}</span>
            <span className="text-muted">{row[1]}</span>
            <span className="text-muted">{row[2]}</span>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-[22px] font-semibold tracking-[-0.02em]">Browser support</h2>
      <div className="mt-4 flex flex-wrap gap-2.5 font-mono text-[11.5px]">
        {["Chrome 111+", "Edge 111+", "Firefox 113+", "Safari 16.4+"].map((b) => (
          <span key={b} className="rounded-lg border border-border bg-surface px-3 py-1.5">{b}</span>
        ))}
      </div>
    </div>
  );
}
