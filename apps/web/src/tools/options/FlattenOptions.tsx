import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function FlattenOptions(_props: OptionsPanelProps) {
  return (
    <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">
      Turns form fields and annotations into ordinary page content, so they can no longer be edited. Text stays
      selectable and the file stays small — no options to configure.
    </div>
  );
}
