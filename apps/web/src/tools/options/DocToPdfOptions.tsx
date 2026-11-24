import type { OptionsPanelProps } from "@/tools/ToolConfig";
import { msg, tr, useTranslation } from "@iloathepdf/i18n";

type Kind = "txt" | "csv" | "html" | "zip";

const input = "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";

const NOTES: Record<Kind, string> = {
  txt: msg("Each file becomes its own PDF. Characters outside Latin-1 (Hindi, Arabic, emoji) can't be drawn in the browser; the desktop app handles more."),
  csv: msg("The delimiter is detected for you, and the header row repeats on every page. Wide tables switch to landscape on Auto."),
  html: msg("Headings, paragraphs, lists, tables and preformatted text are kept. Scripts, styles and images are ignored."),
  zip: msg("Entries are joined in filename order. Images, PDFs and .txt files are used; anything else is skipped."),
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
            {tr(o.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

function DocToPdfOptions({ kind, options, onChange, disabled }: OptionsPanelProps & { kind: Kind }) {
  const { t } = useTranslation();
  const set = (patch: Record<string, unknown>) => onChange({ ...options, ...patch });
  const str = (k: string, fallback: string) => String(options[k] ?? fallback);

  return (
    <div className="flex flex-col gap-4">
      <Choice
        label={t("Page size")}
        value={str("page_size", kind === "zip" ? "fit" : "a4")}
        disabled={disabled}
        onPick={(v) => set({ page_size: v })}
        options={[
          ...(kind === "zip" ? [{ value: "fit", label: tr("Fit each image") }] : []),
          { value: "a4", label: "A4" },
          { value: "letter", label: tr("US Letter") },
        ]}
      />
      <Choice
        label={t("Orientation")}
        value={str("orientation", kind === "csv" || kind === "zip" ? "auto" : "portrait")}
        disabled={disabled}
        onPick={(v) => set({ orientation: v })}
        options={[
          ...(kind === "csv" || kind === "zip" ? [{ value: "auto", label: tr("Auto") }] : []),
          { value: "portrait", label: tr("Portrait") },
          { value: "landscape", label: tr("Landscape") },
        ]}
      />
      {kind !== "zip" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">{t("Margins")}</span>
          <select
            disabled={disabled}
            value={String(options.margin_mm ?? 20)}
            onChange={(e) => set({ margin_mm: Number(e.target.value) })}
            className={input}
          >
            <option value="10">{t("Narrow")}</option>
            <option value="15">{t("Medium")}</option>
            <option value="20">{t("Normal")}</option>
            <option value="30">{t("Wide")}</option>
          </select>
        </label>
      )}
      {kind === "txt" && (
        <Choice
          label={t("Font")}
          value={str("font", "sans")}
          disabled={disabled}
          onPick={(v) => set({ font: v })}
          options={[
            { value: "sans", label: tr("Proportional") },
            { value: "mono", label: tr("Monospaced") },
          ]}
        />
      )}
      {(kind === "txt" || kind === "html") && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">{t("Text size")}</span>
          <select
            disabled={disabled}
            value={String(options.font_size ?? 11)}
            onChange={(e) => set({ font_size: Number(e.target.value) })}
            className={input}
          >
            <option value="9">{t("Small (9 pt)")}</option>
            <option value="11">{t("Normal (11 pt)")}</option>
            <option value="13">{t("Large (13 pt)")}</option>
            <option value="16">{t("Extra large (16 pt)")}</option>
          </select>
        </label>
      )}
      <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">{tr(NOTES[kind])}</div>
    </div>
  );
}

export const TxtToPdfOptions = (p: OptionsPanelProps) => <DocToPdfOptions kind="txt" {...p} />;
export const CsvToPdfOptions = (p: OptionsPanelProps) => <DocToPdfOptions kind="csv" {...p} />;
export const HtmlToPdfOptions = (p: OptionsPanelProps) => <DocToPdfOptions kind="html" {...p} />;
export const ZipToPdfOptions = (p: OptionsPanelProps) => <DocToPdfOptions kind="zip" {...p} />;
