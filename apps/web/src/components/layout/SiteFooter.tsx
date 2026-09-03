import { Link } from "react-router-dom";
import { useRequestCount } from "./RequestStatusContext";

export function SiteFooter() {
  const reqCount = useRequestCount();

  return (
    <div className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-14 px-8 py-9">
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            <span className="size-[18px] rounded-[5px] bg-accent" />
            <span className="text-sm font-semibold tracking-tight">iLoathePDF</span>
          </div>
          <p className="mt-2.5 max-w-[34ch] text-[12.5px] leading-snug text-muted">
            Seven PDF and image tools that run on your machine. Browser or desktop, your choice.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-bold tracking-[0.13em] text-faint">TOOLS</span>
          <Link to="/tools" className="text-[12.5px] text-muted hover:text-text">All tools</Link>
          <Link to="/tools/compress" className="text-[12.5px] text-muted hover:text-text">Compress</Link>
          <Link to="/download" className="text-[12.5px] text-muted hover:text-text">Desktop app</Link>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-bold tracking-[0.13em] text-faint">ABOUT</span>
          <Link to="/how-it-works" className="text-[12.5px] text-muted hover:text-text">How it works</Link>
          <Link to="/privacy" className="text-[12.5px] text-muted hover:text-text">Privacy</Link>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-bold tracking-[0.13em] text-faint">STATUS</span>
          <span className="font-mono text-[11.5px] text-ok">local · wasm · offline ok</span>
          <span className="font-mono text-[11.5px] text-faint">{reqCount} requests this session</span>
        </div>
      </div>
    </div>
  );
}
