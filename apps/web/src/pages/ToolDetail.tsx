import { useParams, Link } from "react-router-dom";
import { getTool } from "@/tools/registry";
import { ToolPage } from "@/components/ToolPage";
import { PreviewBadge } from "@/components/PreviewBadge";
import { DesktopOnlyBadge } from "@/components/DesktopOnlyBadge";
import { tintColor, tintWash } from "@/tools/tint";

export function ToolDetail() {
  const { slug } = useParams<{ slug: string }>();
  const tool = slug ? getTool(slug) : undefined;

  if (!tool) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-14">
        <h1 className="text-2xl font-semibold">Tool not found</h1>
      </div>
    );
  }

  if (tool.status === "desktop-only") {
    return (
      <div>
        <div className="mx-auto flex max-w-6xl items-start gap-3.5 px-8 pt-8">
          <span
            className="grid size-9.5 flex-none place-items-center rounded-[11px] border border-border"
            style={{ background: tintWash(tool.tint, 14) }}
          >
            <tool.Icon className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{tool.name}</h1>
              <DesktopOnlyBadge />
            </div>
            <p className="mt-1 text-sm text-muted">{tool.description}</p>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-8 py-10">
          <p className="max-w-[58ch] text-[14px] leading-relaxed text-muted">
            This tool needs a local table-extraction engine that isn't available in a browser yet — it's desktop-only for now.
          </p>
          <Link to="/download" className="mt-4 inline-block font-mono text-[12px]" style={{ color: tintColor(tool.tint) }}>
            Get the desktop app →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto flex max-w-6xl items-start gap-3.5 px-8 pt-8">
        <span
          className="grid size-9.5 flex-none place-items-center rounded-[11px] border border-border"
          style={{ background: tintWash(tool.tint, 14) }}
        >
          <tool.Icon className="size-5" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="m-0 text-[28px] font-semibold tracking-[-0.028em]">{tool.name}</h1>
            {tool.status === "preview" && <PreviewBadge />}
          </div>
          <p className="mt-1 text-sm text-muted">{tool.description}</p>
        </div>
      </div>
      {tool.Workspace ? <tool.Workspace tool={tool} /> : <ToolPage tool={tool} />}
    </div>
  );
}
