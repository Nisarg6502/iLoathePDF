import type { OptionsPanelProps } from "@/tools/ToolConfig";

type Kind = "txt" | "csv" | "html" | "zip";

const input = "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";

const NOTES: Record<Kind, string> = {
  txt: "Each file becomes its own PDF. Characters outside Latin-1 (Hindi, Arabic, emoji) can't be drawn in the browser; the desktop app handles more.",
  csv: "The delimiter is detected for you, and the header row repeats on every page. Wide tables switch to landscape on Auto.",
  html: "Headings, paragraphs, lists, tables and preformatted text are kept. Scripts, styles and images are ignored.",
  zip: "Entries are joined in filename order. Images, PDFs and .txt files are used; anything else is skipped.",
};

function Choice({
  label,
  options,
  value,
  onPick,
  disabled,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onPick: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(o.value)}
            className={`rounded-lg border px-3 py-1.5 text-[12.5px] ${value === o.value ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DocToPdfOptions({ kind, options, onChange, disabled }: OptionsPanelProps & { kind: Kind }) {
  const set = (patch: Record<string, unknown>) => onChange({ ...options, ...patch });
  const str = (k: string, fallback: string) => String(options[k] ?? fallback);

  return (
    <div className="flex flex-col gap-4">
      <Choice
        label="Page size"
        value={str("page_size", kind === "zip" ? "fit" : "a4")}
        disabled={disabled}
        onPick={(v) => set({ page_size: v })}
        options={[
          ...(kind === "zip" ? [{ value: "fit", label: "Fit each image" }] : []),
          { value: "a4", label: "A4" },
          { value: "letter", label: "US Letter" },
        ]}
      />
      <Choice
        label="Orientation"
        value={str("orientation", kind === "csv" || kind === "zip" ? "auto" : "portrait")}
        disabled={disabled}
        onPick={(v) => set({ orientation: v })}
        options={[
          ...(kind === "csv" || kind === "zip" ? [{ value: "auto", label: "Auto" }] : []),
          { value: "portrait", label: "Portrait" },
          { value: "landscape", label: "Landscape" },
        ]}
      />
      {kind !== "zip" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">Margins</span>
          <select
            disabled={disabled}
            value={String(options.margin_mm ?? 20)}
            onChange={(e) => set({ margin_mm: Number(e.target.value) })}
            className={input}
          >
            <option value="10">Narrow</option>
            <option value="15">Medium</option>
            <option value="20">Normal</option>
            <option value="30">Wide</option>
          </select>
        </label>
      )}
      {kind === "txt" && (
        <Choice
          label="Font"
          value={str("font", "sans")}
          disabled={disabled}
          onPick={(v) => set({ font: v })}
          options={[
            { value: "sans", label: "Proportional" },
            { value: "mono", label: "Monospaced" },
          ]}
        />
      )}
      {(kind === "txt" || kind === "html") && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">Text size</span>
          <select
            disabled={disabled}
            value={String(options.font_size ?? 11)}
            onChange={(e) => set({ font_size: Number(e.target.value) })}
            className={input}
          >
            <option value="9">Small (9 pt)</option>
            <option value="11">Normal (11 pt)</option>
            <option value="13">Large (13 pt)</option>
            <option value="16">Extra large (16 pt)</option>
          </select>
        </label>
      )}
      <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">{NOTES[kind]}</div>
    </div>
  );
}

export const TxtToPdfOptions = (p: OptionsPanelProps) => <DocToPdfOptions kind="txt" {...p} />;
export const CsvToPdfOptions = (p: OptionsPanelProps) => <DocToPdfOptions kind="csv" {...p} />;
export const HtmlToPdfOptions = (p: OptionsPanelProps) => <DocToPdfOptions kind="html" {...p} />;
export const ZipToPdfOptions = (p: OptionsPanelProps) => <DocToPdfOptions kind="zip" {...p} />;
