import { MergeIcon, SplitIcon, OrganizeIcon, CompressIcon, SignIcon } from "@/tools/icons";

const SIDEBAR_TOOLS = [
  { Icon: MergeIcon, active: false },
  { Icon: SplitIcon, active: false },
  { Icon: OrganizeIcon, active: false },
  { Icon: CompressIcon, active: true },
  { Icon: SignIcon, active: false },
];

const QUEUE = [
  { name: "scan_001.pdf", pct: 100 },
  { name: "scan_002.pdf", pct: 100 },
  { name: "scan_003.pdf", pct: 63 },
  { name: "scan_004.pdf", pct: 0 },
];

export function DesktopAppArt() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
      {/* native Windows-style title bar */}
      <div className="flex h-9 items-center gap-2 border-b border-border bg-surface-2 px-3">
        <span className="size-3.5 rounded-[4px] bg-accent" />
        <span className="text-[12px] font-semibold">iLoathePDF</span>
        <span className="flex-1" />
        <span className="flex items-center gap-3.5 pr-1 text-faint">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg>
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" /></svg>
        </span>
      </div>

      <div className="flex">
        {/* sidebar */}
        <div className="flex w-12 flex-none flex-col items-center gap-2 border-r border-border bg-surface-2 py-3">
          {SIDEBAR_TOOLS.map(({ Icon, active }, i) => (
            <span
              key={i}
              className="grid size-8 place-items-center rounded-[9px]"
              style={active ? { background: "var(--accent-soft)" } : undefined}
            >
              <Icon className="size-4" />
            </span>
          ))}
        </div>

        {/* main panel: batch queue */}
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold">Compress · batch</span>
            <span className="font-mono text-[10px] font-bold tracking-[0.1em] text-faint">4 FILES</span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {QUEUE.map((f) => (
              <div key={f.name} className="rounded-[9px] border border-border bg-surface px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px]">{f.name}</span>
                  <span className="font-mono text-[10px] text-muted">{f.pct === 100 ? "done" : f.pct === 0 ? "queued" : `${f.pct}%`}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${f.pct}%`, background: f.pct === 100 ? "var(--ok)" : "var(--accent)" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-[9px] border border-dashed border-border-hi px-3 py-2.5 text-[11px] text-faint">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v7M4.5 6.5L8 3l3.5 3.5M3 12.5h10" /></svg>
            Drop a whole folder to queue it
          </div>
        </div>
      </div>
    </div>
  );
}
