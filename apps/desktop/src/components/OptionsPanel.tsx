import { useId, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "../lib/utils";
import type { OptionValues, Tool } from "../lib/tools";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Select } from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Tooltip } from "./ui/tooltip";

// ---------------------------------------------------------------------------
// Panel + labelled control primitives
// ---------------------------------------------------------------------------

export function OptionsPanel({
  title = "Options",
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        className,
      )}
      aria-label={title}
    >
      <header className="pb-3">
        <h2 className="sr-only">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
        ) : null}
      </header>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}

/** A labelled control. `hint` explains; `help` is a tooltip on the label. */
export function Field({
  label,
  hint,
  help,
  value,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  help?: string;
  /** Right-aligned live readout, e.g. the current slider value. */
  value?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-baseline gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        {help ? (
          <Tooltip content={help} side="top">
            <button
              type="button"
              aria-label={`About ${label}`}
              className="translate-y-px rounded text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Info className="size-3.5" />
            </button>
          </Tooltip>
        ) : null}
        {value != null ? (
          <span className="ml-auto text-[14px] tabular-nums text-muted">{value}</span>
        ) : null}
      </div>
      {children(id)}
      {hint ? <p className="text-xs leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}

/** A boolean row: label and description on the left, switch on the right. */
export function SwitchField({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <Label htmlFor={id}>{label}</Label>
        {hint ? <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-tool option forms. Every control maps onto a real sidecar param.
// ---------------------------------------------------------------------------

export function ToolOptions({
  tool,
  values,
  onChange,
  className,
}: {
  tool: Tool;
  values: OptionValues;
  onChange: (patch: OptionValues) => void;
  className?: string;
}) {
  const set = (patch: OptionValues) => onChange({ ...values, ...patch });
  const str = (k: string) => String(values[k] ?? "");
  const num = (k: string) => Number(values[k] ?? 0);

  switch (tool.id) {
    case "merge":
      return (
        <OptionsPanel className={className} description="The merged file is written next to the first input.">
          <Field label="Output file name" hint="'.pdf' is added for you.">
            {(id) => (
              <Input
                id={id}
                value={str("outputName")}
                onChange={(e) => set({ outputName: e.currentTarget.value })}
                placeholder="merged"
              />
            )}
          </Field>
        </OptionsPanel>
      );

    case "organize":
      return (
        <OptionsPanel
          className={className}
          description="Page order and rotation are set on the page canvas; this names the file it writes."
        >
          <Field label="Output file name" hint="The original is never overwritten.">
            {(id) => (
              <Input
                id={id}
                value={str("outputName")}
                onChange={(e) => set({ outputName: e.currentTarget.value })}
                placeholder="organized"
              />
            )}
          </Field>
        </OptionsPanel>
      );

    case "split":
      return (
        <OptionsPanel className={className} description="Page numbers are 1-based and inclusive.">
          <Field label="How to split">
            {() => (
              <RadioGroup
                value={str("mode")}
                onValueChange={(v) => set({ mode: v })}
                aria-label="Split mode"
              >
                <RadioGroupItem
                  value="ranges"
                  label="By ranges"
                  hint="One new PDF per range you list."
                />
                <RadioGroupItem
                  value="every"
                  label="Every N pages"
                  hint="Chop the document into equal chunks."
                />
                <RadioGroupItem
                  value="extract"
                  label="Extract pages"
                  hint="One PDF containing only the pages you name."
                />
                <RadioGroupItem
                  value="delete"
                  label="Remove pages"
                  hint="One PDF with the pages you name taken out."
                />
              </RadioGroup>
            )}
          </Field>

          {str("mode") === "ranges" ? (
            <Field
              label="Ranges"
              help="Comma separated. Each range becomes its own file."
              hint="Example: 1-3, 4-6, 7-12"
            >
              {(id) => (
                <Input
                  id={id}
                  value={str("ranges")}
                  onChange={(e) => set({ ranges: e.currentTarget.value })}
                  placeholder="1-3, 4-6"
                />
              )}
            </Field>
          ) : null}

          {str("mode") === "every" ? (
            <Field label="Pages per file" value={`${num("every")} pages`}>
              {(id) => (
                <Slider
                  id={id}
                  value={num("every")}
                  min={1}
                  max={50}
                  onValueChange={(v) => set({ every: v })}
                />
              )}
            </Field>
          ) : null}

          {str("mode") === "extract" || str("mode") === "delete" ? (
            <Field
              label={str("mode") === "extract" ? "Pages to keep" : "Pages to remove"}
              hint="Example: 2, 5-7, 11"
            >
              {(id) => (
                <Input
                  id={id}
                  value={str("pages")}
                  onChange={(e) => set({ pages: e.currentTarget.value })}
                  placeholder="2, 5-7"
                />
              )}
            </Field>
          ) : null}
        </OptionsPanel>
      );

    case "compress":
      return (
        <OptionsPanel className={className} description="Higher compression rewrites images, so text stays sharp but photos soften.">
          <Field label="Compression level">
            {() => (
              <RadioGroup
                value={str("level")}
                onValueChange={(v) => set({ level: v })}
                aria-label="Compression level"
              >
                <RadioGroupItem
                  value="lossless"
                  label="Lossless"
                  hint="Restructures the file only. Nothing is thrown away."
                />
                <RadioGroupItem
                  value="balanced"
                  label="Balanced"
                  hint="Good for email. Needs Ghostscript installed."
                />
                <RadioGroupItem
                  value="strong"
                  label="Strong"
                  hint="Smallest file. Images visibly soften."
                />
              </RadioGroup>
            )}
          </Field>
        </OptionsPanel>
      );

    case "pdf-to-image":
      return (
        <OptionsPanel className={className} description="Each page is rendered into its own image file.">
          <Field label="Format">
            {() => (
              <RadioGroup
                value={str("format")}
                onValueChange={(v) => set({ format: v })}
                className="grid-cols-2 sm:grid-flow-col"
                aria-label="Image format"
              >
                <RadioGroupItem value="png" label="PNG" hint="Crisp text, bigger files." />
                <RadioGroupItem value="jpg" label="JPG" hint="Smaller, best for scans." />
              </RadioGroup>
            )}
          </Field>
          <Field label="Resolution" help="Dots per inch. 150 matches a typical screen; 300 prints well.">
            {(id) => (
              <Select
                id={id}
                value={str("dpi")}
                onChange={(e) => set({ dpi: Number(e.currentTarget.value) })}
                options={[
                  { value: "72", label: "72 DPI — screen preview" },
                  { value: "150", label: "150 DPI — default" },
                  { value: "300", label: "300 DPI — print quality" },
                  { value: "600", label: "600 DPI — archival" },
                ]}
              />
            )}
          </Field>
          <Field label="Pages" hint="Leave empty for every page. Example: 1-3, 8">
            {(id) => (
              <Input
                id={id}
                value={str("pages")}
                onChange={(e) => set({ pages: e.currentTarget.value })}
                placeholder="All pages"
              />
            )}
          </Field>
        </OptionsPanel>
      );

    case "image-to-pdf":
      return (
        <OptionsPanel className={className} description="One image per page, in the order shown on the left.">
          <Field label="Output file name">
            {(id) => (
              <Input
                id={id}
                value={str("outputName")}
                onChange={(e) => set({ outputName: e.currentTarget.value })}
                placeholder="images"
              />
            )}
          </Field>
          <Field label="Page size" help="'Fit' makes every page exactly the size of its image.">
            {(id) => (
              <Select
                id={id}
                value={str("page_size")}
                onChange={(e) => set({ page_size: e.currentTarget.value })}
                options={[
                  { value: "fit", label: "Fit to image" },
                  { value: "a4", label: "A4" },
                  { value: "letter", label: "US Letter" },
                ]}
              />
            )}
          </Field>
          {str("page_size") !== "fit" ? (
            <>
              <Field label="Orientation">
                {(id) => (
                  <Select
                    id={id}
                    value={str("orientation")}
                    onChange={(e) => set({ orientation: e.currentTarget.value })}
                    options={[
                      { value: "auto", label: "Match each image" },
                      { value: "portrait", label: "Portrait" },
                      { value: "landscape", label: "Landscape" },
                    ]}
                  />
                )}
              </Field>
              <Field label="Margin" value={`${num("margin_mm")} mm`}>
                {(id) => (
                  <Slider
                    id={id}
                    value={num("margin_mm")}
                    min={0}
                    max={40}
                    onValueChange={(v) => set({ margin_mm: v })}
                  />
                )}
              </Field>
            </>
          ) : null}
        </OptionsPanel>
      );

    case "convert-image":
      return (
        <OptionsPanel className={className} description="Originals are left untouched; converted copies are written beside them.">
          <Field label="Convert to">
            {() => (
              <RadioGroup
                value={str("format")}
                onValueChange={(v) => set({ format: v })}
                aria-label="Target format"
              >
                <RadioGroupItem value="jpg" label="JPG" hint="Universal. No transparency." />
                <RadioGroupItem value="png" label="PNG" hint="Lossless, keeps transparency." />
                <RadioGroupItem value="webp" label="WebP" hint="Smallest at the same quality." />
              </RadioGroup>
            )}
          </Field>

          {str("format") !== "png" ? (
            <Field label="Quality" value={`${num("quality")}`}>
              {(id) => (
                <Slider
                  id={id}
                  value={num("quality")}
                  min={40}
                  max={100}
                  onValueChange={(v) => set({ quality: v })}
                />
              )}
            </Field>
          ) : null}

          <Field label="Resize">
            {() => (
              <RadioGroup
                value={str("resizeMode")}
                onValueChange={(v) => set({ resizeMode: v })}
                aria-label="Resize mode"
              >
                <RadioGroupItem value="none" label="Keep original size" />
                <RadioGroupItem value="max" label="Limit the longest edge" />
                <RadioGroupItem value="percent" label="Scale by percentage" />
              </RadioGroup>
            )}
          </Field>

          {str("resizeMode") === "max" ? (
            <Field label="Longest edge" value={`${num("max_px")} px`}>
              {(id) => (
                <Slider
                  id={id}
                  value={num("max_px")}
                  min={200}
                  max={6000}
                  step={100}
                  onValueChange={(v) => set({ max_px: v })}
                />
              )}
            </Field>
          ) : null}

          {str("resizeMode") === "percent" ? (
            <Field label="Scale" value={`${num("percent")}%`}>
              {(id) => (
                <Slider
                  id={id}
                  value={num("percent")}
                  min={5}
                  max={200}
                  step={5}
                  onValueChange={(v) => set({ percent: v })}
                />
              )}
            </Field>
          ) : null}

          <SwitchField
            label="Strip metadata"
            hint="Removes EXIF, including GPS location and camera serial. Recommended for ID documents."
            checked={Boolean(values.strip_metadata)}
            onCheckedChange={(v) => set({ strip_metadata: v })}
          />
        </OptionsPanel>
      );

    default:
      return null;
  }
}
