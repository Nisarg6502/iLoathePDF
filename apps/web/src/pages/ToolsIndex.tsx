import { Link } from "react-router-dom";
import { TOOLS } from "@/tools/registry";
import { PreviewBadge } from "@/components/PreviewBadge";

export function ToolsIndex() {
  const pdfTools = TOOLS.filter((t) => t.category === "pdf");
  const imageTools = TOOLS.filter((t) => t.category === "image");

  return (
    <div className="mx-auto max-w-6xl px-8 py-13">
      <h1 className="m-0 text-4xl font-semibold tracking-[-0.032em]">All tools</h1>
      <p className="mt-2.5 max-w-[58ch] text-[15.5px] text-muted">
        Each one runs locally. Pick a tool, drop a file, get a file — the
        same seven that ship in the desktop app.
      </p>

      {[
        { label: "PDF TOOLS", tools: pdfTools },
        { label: "IMAGE TOOLS", tools: imageTools },
      ].map((group) => (
        <div key={group.label}>
          <div className="mt-9 flex items-center gap-3">
            <span className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-faint">{group.label}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.tools.map((tool) => (
              <Link
                key={tool.slug}
                to={`/tools/${tool.slug}`}
                className="rounded-[14px] border border-border bg-surface p-5 hover:border-accent hover:shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between">
                  <tool.Icon className="size-5.5" />
                  {tool.status === "preview" && <PreviewBadge />}
                </div>
                <div className="mt-3 text-[15px] font-semibold">{tool.name}</div>
                <div className="mt-1 text-[13px] leading-relaxed text-muted">{tool.description}</div>
                <div className="mt-3 font-mono text-[11px] text-accent">Open →</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
