import { useParams } from "react-router-dom";
import { getTool } from "@/tools/registry";
import { ToolPage } from "@/components/ToolPage";
import { PreviewBadge } from "@/components/PreviewBadge";

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

  return (
    <div>
      <div className="mx-auto flex max-w-6xl items-start gap-3.5 px-8 pt-8">
        <span className="grid size-9.5 flex-none place-items-center rounded-[11px] border border-border bg-surface">
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
      <ToolPage tool={tool} />
    </div>
  );
}
