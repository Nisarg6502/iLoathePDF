import type { OptionsPanelProps } from "@/tools/ToolConfig";

const MODES = [
  { value: "watermark", label: "Watermark" },
  { value: "page_numbers", label: "Page Numbers" },
  { value: "stamp", label: "Stamp" },
] as const;

const PAGE_NUMBER_POSITIONS = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];
const STAMP_POSITIONS = [...PAGE_NUMBER_POSITIONS, "left", "center", "right"];

function PageRangeField({ options, onChange, disabled }: OptionsPanelProps) {
  const pages = (options.pages as string) ?? "all";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold">Apply to</span>
      <div className="flex gap-1.5">
        {(["all", "first", "custom"] as const).map((p) => (
          <label
            key={p}
            className={`flex-1 cursor-pointer rounded-lg border p-2 text-center text-[12px] ${
              (p === "custom" ? !["all", "first"].includes(pages) : pages === p)
                ? "border-accent bg-accent-soft"
                : "border-border bg-surface-2"
            }`}
          >
            <input
              type="radio"
              name="watermark-pages"
              className="sr-only"
              disabled={disabled}
              checked={p === "custom" ? !["all", "first"].includes(pages) : pages === p}
              onChange={() => onChange({ ...options, pages: p === "custom" ? "1" : p })}
            />
            {p === "all" ? "All pages" : p === "first" ? "First page only" : "Custom"}
          </label>
        ))}
      </div>
      {!["all", "first"].includes(pages) && (
        <input
          type="text"
          disabled={disabled}
          value={pages}
          onChange={(e) => onChange({ ...options, pages: e.target.value })}
          placeholder="1-3,5"
          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
        />
      )}
    </div>
  );
}

export function WatermarkOptions(props: OptionsPanelProps) {
  const { options, onChange, disabled } = props;
  const mode = (options.mode as string) ?? "watermark";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`flex-1 cursor-pointer rounded-lg border p-2 text-center text-[12px] ${mode === m.value ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
          >
            <input
              type="radio"
              name="watermark-mode"
              className="sr-only"
              disabled={disabled}
              checked={mode === m.value}
              onChange={() => onChange({ ...options, mode: m.value })}
            />
            {m.label}
          </label>
        ))}
      </div>

      <PageRangeField {...props} />

      {mode === "watermark" && (
        <WatermarkFields options={options} onChange={onChange} disabled={disabled} />
      )}
      {mode === "page_numbers" && (
        <PageNumberFields options={options} onChange={onChange} disabled={disabled} />
      )}
      {mode === "stamp" && (
        <StampFields options={options} onChange={onChange} disabled={disabled} />
      )}
    </div>
  );
}

function ContentToggle({
  content, onSetContent, disabled,
}: { content: string; onSetContent: (c: string) => void; disabled: boolean }) {
  return (
    <div className="flex gap-1.5">
      {(["text", "image"] as const).map((c) => (
        <label
          key={c}
          className={`flex-1 cursor-pointer rounded-lg border p-1.5 text-center text-[12px] capitalize ${content === c ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
        >
          <input type="radio" name="content-kind" className="sr-only" disabled={disabled} checked={content === c} onChange={() => onSetContent(c)} />
          {c}
        </label>
      ))}
    </div>
  );
}

function WatermarkFields({ options, onChange, disabled }: OptionsPanelProps) {
  const wm = (options.watermark as Record<string, unknown>) ?? {};
  const set = (patch: Record<string, unknown>) => onChange({ ...options, watermark: { ...wm, ...patch } });
  const content = (wm.content as string) ?? "text";

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <ContentToggle content={content} onSetContent={(c) => set({ content: c })} disabled={!!disabled} />
      {content === "text" ? (
        <>
          <input
            type="text" disabled={disabled} placeholder="CONFIDENTIAL"
            value={(wm.text as string) ?? ""}
            onChange={(e) => set({ text: e.target.value })}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <label className="flex flex-1 items-center justify-between text-[12.5px]">
              Font size
              <input type="number" min={4} disabled={disabled}
                value={(wm.fontSize as number) ?? 48}
                onChange={(e) => set({ fontSize: Number(e.target.value) })}
                className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-[12.5px]">
              Color
              <input type="color" disabled={disabled}
                value={(wm.color as string) ?? "#888888"}
                onChange={(e) => set({ color: e.target.value })}
                className="h-7 w-10 rounded border border-border bg-surface" />
            </label>
          </div>
        </>
      ) : (
        <ImagePicker disabled={!!disabled} onPick={(dataUrl) => set({ imageDataUrl: dataUrl })} />
      )}
      <label className="flex items-center justify-between text-[12.5px]">
        Opacity
        <input type="range" min={0} max={1} step={0.05} disabled={disabled}
          value={(wm.opacity as number) ?? 0.35}
          onChange={(e) => set({ opacity: Number(e.target.value) })} />
      </label>
      <label className="flex items-center justify-between text-[12.5px]">
        Rotation (degrees)
        <input type="number" disabled={disabled}
          value={(wm.rotation as number) ?? 45}
          onChange={(e) => set({ rotation: Number(e.target.value) })}
          className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
      </label>
      <div className="flex gap-1.5">
        {(["single", "tiled"] as const).map((p) => (
          <label key={p} className={`flex-1 cursor-pointer rounded-lg border p-1.5 text-center text-[12px] capitalize ${((wm.placement as string) ?? "single") === p ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}>
            <input type="radio" name="watermark-placement" className="sr-only" disabled={disabled} checked={((wm.placement as string) ?? "single") === p} onChange={() => set({ placement: p })} />
            {p}
          </label>
        ))}
      </div>
    </div>
  );
}

function PageNumberFields({ options, onChange, disabled }: OptionsPanelProps) {
  const pn = (options.page_numbers as Record<string, unknown>) ?? {};
  const set = (patch: Record<string, unknown>) => onChange({ ...options, page_numbers: { ...pn, ...patch } });

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <select
        disabled={disabled}
        value={(pn.position as string) ?? "bottom-center"}
        onChange={(e) => set({ position: e.target.value })}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
      >
        {PAGE_NUMBER_POSITIONS.map((p) => (
          <option key={p} value={p}>{p.replace("-", " ")}</option>
        ))}
      </select>
      <select
        disabled={disabled}
        value={(pn.format as string) ?? "n"}
        onChange={(e) => set({ format: e.target.value })}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
      >
        <option value="n">1</option>
        <option value="page-n">Page 1</option>
        <option value="n-of-total">1 of N</option>
      </select>
      <label className="flex items-center justify-between text-[12.5px]">
        Starting number
        <input type="number" min={1} disabled={disabled}
          value={(pn.start as number) ?? 1}
          onChange={(e) => set({ start: Number(e.target.value) })}
          className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 items-center justify-between text-[12.5px]">
          Font size
          <input type="number" min={4} disabled={disabled}
            value={(pn.fontSize as number) ?? 11}
            onChange={(e) => set({ fontSize: Number(e.target.value) })}
            className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-[12.5px]">
          Color
          <input type="color" disabled={disabled}
            value={(pn.color as string) ?? "#000000"}
            onChange={(e) => set({ color: e.target.value })}
            className="h-7 w-10 rounded border border-border bg-surface" />
        </label>
      </div>
    </div>
  );
}

function StampFields({ options, onChange, disabled }: OptionsPanelProps) {
  const st = (options.stamp as Record<string, unknown>) ?? {};
  const set = (patch: Record<string, unknown>) => onChange({ ...options, stamp: { ...st, ...patch } });
  const content = (st.content as string) ?? "text";

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <ContentToggle content={content} onSetContent={(c) => set({ content: c })} disabled={!!disabled} />
      {content === "text" ? (
        <>
          <input
            type="text" disabled={disabled} placeholder="APPROVED"
            value={(st.text as string) ?? ""}
            onChange={(e) => set({ text: e.target.value })}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <label className="flex flex-1 items-center justify-between text-[12.5px]">
              Font size
              <input type="number" min={4} disabled={disabled}
                value={(st.fontSize as number) ?? 24}
                onChange={(e) => set({ fontSize: Number(e.target.value) })}
                className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-[12.5px]">
              Color
              <input type="color" disabled={disabled}
                value={(st.color as string) ?? "#000000"}
                onChange={(e) => set({ color: e.target.value })}
                className="h-7 w-10 rounded border border-border bg-surface" />
            </label>
          </div>
        </>
      ) : (
        <ImagePicker disabled={!!disabled} onPick={(dataUrl) => set({ imageDataUrl: dataUrl })} />
      )}
      <select
        disabled={disabled}
        value={(st.position as string) ?? "bottom-right"}
        onChange={(e) => set({ position: e.target.value })}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
      >
        {STAMP_POSITIONS.map((p) => (
          <option key={p} value={p}>{p.replace("-", " ")}</option>
        ))}
      </select>
    </div>
  );
}

function ImagePicker({ onPick, disabled }: { onPick: (dataUrl: string) => void; disabled: boolean }) {
  return (
    <input
      type="file" accept="image/*" disabled={disabled}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => onPick(reader.result as string);
        reader.readAsDataURL(f);
      }}
      className="text-[12.5px]"
    />
  );
}
