import { useId, useState, type ReactNode } from "react";
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
import { msg, tr, useTranslation } from "@iloathepdf/i18n";

const CROP_SIDE_LABEL = { top: msg("Top (%)"), right: msg("Right (%)"), bottom: msg("Bottom (%)"), left: msg("Left (%)") };

// ---------------------------------------------------------------------------
// Panel + labelled control primitives
// ---------------------------------------------------------------------------

export function OptionsPanel({
  title = tr("Options"),
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
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-baseline gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        {help ? (
          <Tooltip content={help} side="top">
            <button
              type="button"
              aria-label={t("About {{label}}", { label })}
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
  const { t } = useTranslation();
  const set = (patch: OptionValues) => onChange({ ...values, ...patch });
  const str = (k: string) => String(values[k] ?? "");
  const num = (k: string) => Number(values[k] ?? 0);

  switch (tool.id) {
    case "merge":
      return (
        <OptionsPanel className={className} description={t("The merged file is written next to the first input.")}>
          <Field label={t("Output file name")} hint={t("'.pdf' is added for you.")}>
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
          description={t("Page order and rotation are set on the page canvas; this names the file it writes.")}
        >
          <Field label={t("Output file name")} hint={t("The original is never overwritten.")}>
            {(id) => (
              <Input
                id={id}
                value={str("outputName")}
                onChange={(e) => set({ outputName: e.currentTarget.value })}
                placeholder={t("Original name + -organized")}
              />
            )}
          </Field>
        </OptionsPanel>
      );

    case "split":
      return (
        <OptionsPanel className={className} description={t("Page numbers are 1-based and inclusive.")}>
          <Field label={t("How to split")}>
            {() => (
              <RadioGroup
                value={str("mode")}
                onValueChange={(v) => set({ mode: v })}
                aria-label={t("Split mode")}
              >
                <RadioGroupItem
                  value="ranges"
                  label={t("By ranges")}
                  hint={t("One new PDF per range you list.")}
                />
                <RadioGroupItem
                  value="every"
                  label={t("Every N pages")}
                  hint={t("Chop the document into equal chunks.")}
                />
                <RadioGroupItem
                  value="extract"
                  label={t("Extract pages")}
                  hint={t("One PDF containing only the pages you name.")}
                />
                <RadioGroupItem
                  value="delete"
                  label={t("Remove pages")}
                  hint={t("One PDF with the pages you name taken out.")}
                />
              </RadioGroup>
            )}
          </Field>

          {str("mode") === "ranges" ? (
            <Field
              label={t("Ranges")}
              help={tr("Comma separated. Each range becomes its own file.")}
              hint={t("Example: 1-3, 4-6, 7-12")}
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
            <Field label={t("Pages per file")} value={`${num("every")} pages`}>
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
              label={str("mode") === "extract" ? t("Pages to keep") : t("Pages to remove")}
              hint={t("Example: 2, 5-7, 11")}
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
        <OptionsPanel className={className} description={t("Higher compression rewrites images, so text stays sharp but photos soften.")}>
          <Field label={t("Compression level")}>
            {() => (
              <RadioGroup
                value={str("level")}
                onValueChange={(v) => set({ level: v })}
                aria-label={t("Compression level")}
              >
                <RadioGroupItem
                  value="lossless"
                  label={t("Lossless")}
                  hint={t("Restructures the file only. Nothing is thrown away.")}
                />
                <RadioGroupItem
                  value="balanced"
                  label={t("Balanced")}
                  hint={t("Good for email. Needs Ghostscript installed.")}
                />
                <RadioGroupItem
                  value="strong"
                  label={t("Strong")}
                  hint={t("Smallest file. Images visibly soften.")}
                />
              </RadioGroup>
            )}
          </Field>
        </OptionsPanel>
      );

    case "protect": {
      const mode = str("mode") as "protect" | "unlock";
      const password = str("password");
      const confirmPassword = str("confirmPassword");
      const mismatch = mode === "protect" && confirmPassword.length > 0 && password !== confirmPassword;
      return (
        <OptionsPanel
          className={className}
          description={
            mode === "protect"
              ? t("Anyone opening this PDF will need the password you set here.")
              : t("Enter the PDF's current password to remove it.")
          }
        >
          <Field label={t("Mode")}>
            {() => (
              <RadioGroup
                value={mode}
                onValueChange={(v) => set({ mode: v, password: "", confirmPassword: "" })}
                aria-label={t("Protect or unlock")}
              >
                <RadioGroupItem value="protect" label={t("Protect")} hint={t("Set a password to open the PDF.")} />
                <RadioGroupItem value="unlock" label={t("Unlock")} hint={t("Remove an existing password.")} />
              </RadioGroup>
            )}
          </Field>
          <ProtectPasswordField
            label={mode === "protect" ? t("Set password") : t("Enter password")}
            value={password}
            onChange={(v) => set({ password: v })}
          />
          {mode === "protect" ? (
            <ProtectPasswordField
              label={t("Confirm password")}
              value={confirmPassword}
              onChange={(v) => set({ confirmPassword: v })}
              hint={mismatch ? t("Passwords do not match.") : undefined}
            />
          ) : null}
        </OptionsPanel>
      );
    }

    case "pdf-to-image":
      return (
        <OptionsPanel className={className} description={t("Each page is rendered into its own image file.")}>
          <Field label={t("Format")}>
            {() => (
              <RadioGroup
                value={str("format")}
                onValueChange={(v) => set({ format: v })}
                className="grid-cols-2 sm:grid-flow-col"
                aria-label={t("Image format")}
              >
                <RadioGroupItem value="png" label="PNG" hint={t("Crisp text, bigger files.")} />
                <RadioGroupItem value="jpg" label="JPG" hint={t("Smaller, best for scans.")} />
              </RadioGroup>
            )}
          </Field>
          <Field label={t("Resolution")} help={tr("Dots per inch. 150 matches a typical screen; 300 prints well.")}>
            {(id) => (
              <Select
                id={id}
                value={str("dpi")}
                onChange={(e) => set({ dpi: Number(e.currentTarget.value) })}
                options={[
                  { value: "72", label: tr("72 DPI — screen preview") },
                  { value: "150", label: tr("150 DPI — default") },
                  { value: "300", label: tr("300 DPI — print quality") },
                  { value: "600", label: tr("600 DPI — archival") },
                ]}
              />
            )}
          </Field>
          <Field label={t("Pages")} hint={t("Leave empty for every page. Example: 1-3, 8")}>
            {(id) => (
              <Input
                id={id}
                value={str("pages")}
                onChange={(e) => set({ pages: e.currentTarget.value })}
                placeholder={t("All pages")}
              />
            )}
          </Field>
        </OptionsPanel>
      );

    case "image-to-pdf":
      return (
        <OptionsPanel className={className} description={t("One image per page, in the order shown on the left.")}>
          <Field label={t("Output file name")}>
            {(id) => (
              <Input
                id={id}
                value={str("outputName")}
                onChange={(e) => set({ outputName: e.currentTarget.value })}
                placeholder={t("images")}
              />
            )}
          </Field>
          <Field label={t("Page size")} help={tr("'Fit' makes every page exactly the size of its image.")}>
            {(id) => (
              <Select
                id={id}
                value={str("page_size")}
                onChange={(e) => set({ page_size: e.currentTarget.value })}
                options={[
                  { value: "fit", label: tr("Fit to image") },
                  { value: "a4", label: "A4" },
                  { value: "letter", label: tr("US Letter") },
                ]}
              />
            )}
          </Field>
          {str("page_size") !== "fit" ? (
            <>
              <Field label={t("Orientation")}>
                {(id) => (
                  <Select
                    id={id}
                    value={str("orientation")}
                    onChange={(e) => set({ orientation: e.currentTarget.value })}
                    options={[
                      { value: "auto", label: tr("Match each image") },
                      { value: "portrait", label: tr("Portrait") },
                      { value: "landscape", label: tr("Landscape") },
                    ]}
                  />
                )}
              </Field>
              <Field label={t("Margin")} value={`${num("margin_mm")} mm`}>
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
        <OptionsPanel className={className} description={t("Originals are left untouched; converted copies are written beside them.")}>
          <Field label={t("Convert to")}>
            {() => (
              <RadioGroup
                value={str("format")}
                onValueChange={(v) => set({ format: v })}
                aria-label={t("Target format")}
              >
                <RadioGroupItem value="jpg" label="JPG" hint={t("Universal. No transparency.")} />
                <RadioGroupItem value="png" label="PNG" hint={t("Lossless, keeps transparency.")} />
                <RadioGroupItem value="webp" label="WebP" hint={t("Smallest at the same quality.")} />
              </RadioGroup>
            )}
          </Field>

          {str("format") !== "png" ? (
            <Field label={t("Quality")} value={`${num("quality")}`}>
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

          <Field label={t("Resize")}>
            {() => (
              <RadioGroup
                value={str("resizeMode")}
                onValueChange={(v) => set({ resizeMode: v })}
                aria-label={t("Resize mode")}
              >
                <RadioGroupItem value="none" label={t("Keep original size")} />
                <RadioGroupItem value="max" label={t("Limit the longest edge")} />
                <RadioGroupItem value="percent" label={t("Scale by percentage")} />
              </RadioGroup>
            )}
          </Field>

          {str("resizeMode") === "max" ? (
            <Field label={t("Longest edge")} value={`${num("max_px")} px`}>
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
            <Field label={t("Scale")} value={`${num("percent")}%`}>
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
            label={t("Strip metadata")}
            hint={t("Removes EXIF, including GPS location and camera serial. Recommended for ID documents.")}
            checked={Boolean(values.strip_metadata)}
            onCheckedChange={(v) => set({ strip_metadata: v })}
          />
        </OptionsPanel>
      );

    case "watermark":
      return (
        <OptionsPanel className={className} description={t("Add watermarks, page numbers, or stamps to PDF pages.")}>
          <Field label={t("What to add")}>
            {() => (
              <RadioGroup
                value={str("mode")}
                onValueChange={(v) => set({ mode: v })}
                aria-label={t("Watermark mode")}
              >
                <RadioGroupItem
                  value="watermark"
                  label={t("Watermark")}
                  hint={t("Repeating text or image on every page.")}
                />
                <RadioGroupItem
                  value="page_numbers"
                  label={t("Page numbers")}
                  hint={t("Sequential numbering on every page.")}
                />
                <RadioGroupItem
                  value="stamp"
                  label={t("Stamp")}
                  hint={t("Fixed text or image at a specific position.")}
                />
              </RadioGroup>
            )}
          </Field>

          <Field label={t("Apply to")}>
            {() => (
              <RadioGroup
                value={str("pages")}
                onValueChange={(v) => set({ pages: v })}
                aria-label={t("Page range")}
              >
                <RadioGroupItem value="all" label={t("Every page")} />
                <RadioGroupItem value="first" label={t("First page only")} />
                <RadioGroupItem value="custom" label={t("Custom range")} />
              </RadioGroup>
            )}
          </Field>

          {str("pages") === "custom" ? (
            <Field label={t("Pages")} hint={t("Example: 1-3, 5, 7-10")}>
              {(id) => (
                <Input
                  id={id}
                  value={str("customPages") || ""}
                  onChange={(e) => set({ customPages: e.currentTarget.value })}
                  placeholder="1-3, 5, 7"
                />
              )}
            </Field>
          ) : null}

          {str("mode") === "watermark" ? (
            <>
              <Field label={t("Content")}>
                {() => (
                  <RadioGroup
                    value={str("watermarkContent")}
                    onValueChange={(v) => set({ watermarkContent: v })}
                    aria-label={t("Watermark content type")}
                  >
                    <RadioGroupItem value="text" label={t("Text")} />
                    <RadioGroupItem value="image" label={t("Image")} />
                  </RadioGroup>
                )}
              </Field>

              {str("watermarkContent") === "text" ? (
                <Field label={t("Text")}>
                  {(id) => (
                    <Input
                      id={id}
                      value={str("watermarkText")}
                      onChange={(e) => set({ watermarkText: e.currentTarget.value })}
                      placeholder={t("CONFIDENTIAL")}
                    />
                  )}
                </Field>
              ) : (
                <ImageFileField
                  label={t("Watermark image")}
                  value={str("watermarkImageDataUrl")}
                  onChange={(v) => set({ watermarkImageDataUrl: v })}
                />
              )}

              <Field label={t("Font size")} value={`${num("watermarkFontSize")} pt`}>
                {(id) => (
                  <Slider
                    id={id}
                    value={num("watermarkFontSize")}
                    min={12}
                    max={144}
                    step={1}
                    onValueChange={(v) => set({ watermarkFontSize: v })}
                  />
                )}
              </Field>

              <Field label={t("Color")}>
                {(id) => (
                  <Input
                    id={id}
                    type="color"
                    value={str("watermarkColor")}
                    onChange={(e) => set({ watermarkColor: e.currentTarget.value })}
                  />
                )}
              </Field>

              <Field label={t("Opacity")} value={`${Math.round(num("watermarkOpacity") * 100)}%`}>
                {(id) => (
                  <Slider
                    id={id}
                    value={num("watermarkOpacity")}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={(v) => set({ watermarkOpacity: v })}
                  />
                )}
              </Field>

              <Field label={t("Rotation")} value={`${num("watermarkRotation")}°`}>
                {(id) => (
                  <Slider
                    id={id}
                    value={num("watermarkRotation")}
                    min={0}
                    max={360}
                    step={1}
                    onValueChange={(v) => set({ watermarkRotation: v })}
                  />
                )}
              </Field>

              <Field label={t("Placement")}>
                {() => (
                  <RadioGroup
                    value={str("watermarkPlacement")}
                    onValueChange={(v) => set({ watermarkPlacement: v })}
                    aria-label={t("Watermark placement")}
                  >
                    <RadioGroupItem
                      value="single"
                      label={t("Single")}
                      hint={t("One instance in the center.")}
                    />
                    <RadioGroupItem
                      value="tiled"
                      label={t("Tiled")}
                      hint={t("Repeating across the page.")}
                    />
                  </RadioGroup>
                )}
              </Field>
            </>
          ) : null}

          {str("mode") === "page_numbers" ? (
            <>
              <Field label={t("Position")}>
                {(id) => (
                  <Select
                    id={id}
                    value={str("pageNumberPosition")}
                    onChange={(e) => set({ pageNumberPosition: e.currentTarget.value })}
                    options={[
                      { value: "top-left", label: tr("Top left") },
                      { value: "top-center", label: tr("Top center") },
                      { value: "top-right", label: tr("Top right") },
                      { value: "bottom-left", label: tr("Bottom left") },
                      { value: "bottom-center", label: tr("Bottom center") },
                      { value: "bottom-right", label: tr("Bottom right") },
                    ]}
                  />
                )}
              </Field>

              <Field label={t("Format")}>
                {() => (
                  <RadioGroup
                    value={str("pageNumberFormat")}
                    onValueChange={(v) => set({ pageNumberFormat: v })}
                    aria-label={t("Page number format")}
                  >
                    <RadioGroupItem value="n" label="1, 2, 3..." />
                    <RadioGroupItem value="page-n" label={t("Page 1, Page 2...")} />
                    <RadioGroupItem value="n-of-total" label={t("1 of 10, 2 of 10...")} />
                  </RadioGroup>
                )}
              </Field>

              <Field label={t("Start at")} value={`${num("pageNumberStart")}`}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    value={String(num("pageNumberStart"))}
                    onChange={(e) => set({ pageNumberStart: parseInt(e.currentTarget.value) || 1 })}
                  />
                )}
              </Field>

              <Field label={t("Font size")} value={`${num("pageNumberFontSize")} pt`}>
                {(id) => (
                  <Slider
                    id={id}
                    value={num("pageNumberFontSize")}
                    min={8}
                    max={72}
                    step={1}
                    onValueChange={(v) => set({ pageNumberFontSize: v })}
                  />
                )}
              </Field>

              <Field label={t("Color")}>
                {(id) => (
                  <Input
                    id={id}
                    type="color"
                    value={str("pageNumberColor")}
                    onChange={(e) => set({ pageNumberColor: e.currentTarget.value })}
                  />
                )}
              </Field>
            </>
          ) : null}

          {str("mode") === "stamp" ? (
            <>
              <Field label={t("Content")}>
                {() => (
                  <RadioGroup
                    value={str("stampContent")}
                    onValueChange={(v) => set({ stampContent: v })}
                    aria-label={t("Stamp content type")}
                  >
                    <RadioGroupItem value="text" label={t("Text")} />
                    <RadioGroupItem value="image" label={t("Image")} />
                  </RadioGroup>
                )}
              </Field>

              {str("stampContent") === "text" ? (
                <Field label={t("Text")}>
                  {(id) => (
                    <Input
                      id={id}
                      value={str("stampText")}
                      onChange={(e) => set({ stampText: e.currentTarget.value })}
                      placeholder={t("APPROVED")}
                    />
                  )}
                </Field>
              ) : (
                <ImageFileField
                  label={t("Stamp image")}
                  value={str("stampImageDataUrl")}
                  onChange={(v) => set({ stampImageDataUrl: v })}
                />
              )}

              <Field label={t("Position")}>
                {(id) => (
                  <Select
                    id={id}
                    value={str("stampPosition")}
                    onChange={(e) => set({ stampPosition: e.currentTarget.value })}
                    options={[
                      { value: "top-left", label: tr("Top left") },
                      { value: "top-center", label: tr("Top center") },
                      { value: "top-right", label: tr("Top right") },
                      { value: "left", label: tr("Left") },
                      { value: "center", label: tr("Center") },
                      { value: "right", label: tr("Right") },
                      { value: "bottom-left", label: tr("Bottom left") },
                      { value: "bottom-center", label: tr("Bottom center") },
                      { value: "bottom-right", label: tr("Bottom right") },
                    ]}
                  />
                )}
              </Field>

              <Field label={t("Font size")} value={`${num("stampFontSize")} pt`}>
                {(id) => (
                  <Slider
                    id={id}
                    value={num("stampFontSize")}
                    min={8}
                    max={72}
                    step={1}
                    onValueChange={(v) => set({ stampFontSize: v })}
                  />
                )}
              </Field>

              <Field label={t("Color")}>
                {(id) => (
                  <Input
                    id={id}
                    type="color"
                    value={str("stampColor")}
                    onChange={(e) => set({ stampColor: e.currentTarget.value })}
                  />
                )}
              </Field>
            </>
          ) : null}
        </OptionsPanel>
      );

    case "ocr":
      return (
        <OptionsPanel
          className={className}
          description={t("Scans your PDF and adds an invisible, searchable text layer over the original pages. English only for now — no options to configure.")}
        >
          {null}
        </OptionsPanel>
      );

    case "txt-to-pdf":
    case "csv-to-pdf":
    case "html-to-pdf":
    case "zip-to-pdf": {
      const isZip = tool.id === "zip-to-pdf";
      const isCsv = tool.id === "csv-to-pdf";
      const isTxt = tool.id === "txt-to-pdf";
      const description = isZip
        ? tr("Entries are joined in filename order. Images, PDFs and .txt files are used; anything else is skipped.")
        : isCsv
          ? tr("The delimiter is detected for you. Wide tables switch to landscape on Auto.")
          : isTxt
            ? tr("Each file becomes its own PDF, saved next to the original.")
            : tr("Headings, paragraphs, lists, tables and preformatted text are kept. Scripts, styles and images are ignored.");
      return (
        <OptionsPanel className={className} description={description}>
          <Field label={t("Page size")}>
            {(id) => (
              <Select
                id={id}
                value={str("page_size")}
                onChange={(e) => set({ page_size: e.currentTarget.value })}
                options={[
                  ...(isZip ? [{ value: "fit", label: tr("Fit each image") }] : []),
                  { value: "a4", label: "A4" },
                  { value: "letter", label: tr("US Letter") },
                ]}
              />
            )}
          </Field>
          <Field label={t("Orientation")}>
            {() => (
              <RadioGroup
                value={str("orientation")}
                onValueChange={(v) => set({ orientation: v })}
                className="grid-cols-3"
                aria-label={t("Orientation")}
              >
                {isCsv || isZip ? <RadioGroupItem value="auto" label={t("Auto")} /> : null}
                <RadioGroupItem value="portrait" label={t("Portrait")} />
                <RadioGroupItem value="landscape" label={t("Landscape")} />
              </RadioGroup>
            )}
          </Field>
          {isZip ? null : (
            <Field label={t("Margins")}>
              {(id) => (
                <Select
                  id={id}
                  value={str("margin_mm")}
                  onChange={(e) => set({ margin_mm: Number(e.currentTarget.value) })}
                  options={[
                    { value: "10", label: tr("Narrow") },
                    { value: "15", label: tr("Medium") },
                    { value: "20", label: tr("Normal") },
                    { value: "30", label: tr("Wide") },
                  ]}
                />
              )}
            </Field>
          )}
          {isTxt ? (
            <Field label={t("Font")}>
              {() => (
                <RadioGroup
                  value={str("font")}
                  onValueChange={(v) => set({ font: v })}
                  className="grid-cols-2"
                  aria-label={t("Font")}
                >
                  <RadioGroupItem value="sans" label={t("Proportional")} />
                  <RadioGroupItem value="mono" label={t("Monospaced")} />
                </RadioGroup>
              )}
            </Field>
          ) : null}
          {isTxt || tool.id === "html-to-pdf" ? (
            <Field label={t("Text size")}>
              {(id) => (
                <Select
                  id={id}
                  value={str("font_size")}
                  onChange={(e) => set({ font_size: Number(e.currentTarget.value) })}
                  options={[
                    { value: "9", label: tr("Small (9 pt)") },
                    { value: "11", label: tr("Normal (11 pt)") },
                    { value: "13", label: tr("Large (13 pt)") },
                    { value: "16", label: tr("Extra large (16 pt)") },
                  ]}
                />
              )}
            </Field>
          ) : null}
        </OptionsPanel>
      );
    }

    case "crop":
      return (
        <OptionsPanel
          className={className}
          description={t("Trim each side by a percentage of the page. Cropped-out content stays inside the file, hidden — use Redact to remove it for good.")}
        >
          <div className="grid grid-cols-2 gap-3">
            {(["top", "right", "bottom", "left"] as const).map((side) => (
              <Field key={side} label={t(CROP_SIDE_LABEL[side])}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={99}
                    step={1}
                    value={String(values[side] ?? 0)}
                    onChange={(e) => set({ [side]: Number(e.currentTarget.value) })}
                  />
                )}
              </Field>
            ))}
          </div>
          <Field label={t("Pages")} hint={t("Leave empty for every page. Example: 1-3, 8")}>
            {(id) => (
              <Input
                id={id}
                value={str("pages")}
                onChange={(e) => set({ pages: e.currentTarget.value })}
                placeholder={t("All pages")}
              />
            )}
          </Field>
        </OptionsPanel>
      );

    case "scan":
      return (
        <OptionsPanel
          className={className}
          description={t("Photos are straightened, cleaned up and joined in the order shown. To scan with a camera, use the web app.")}
        >
          <Field label={t("Cleanup")}>
            {() => (
              <RadioGroup
                value={str("mode")}
                onValueChange={(v) => set({ mode: v })}
                aria-label={t("Cleanup")}
              >
                <RadioGroupItem value="enhanced" label={t("Enhanced")} hint={t("Stronger contrast: paper reads white, ink reads dark.")} />
                <RadioGroupItem value="bw" label={t("Black & white")} hint={t("Crisp ink on white. Ignores shadows and uneven light.")} />
                <RadioGroupItem value="color" label={t("Original colour")} hint={t("The photo as it is.")} />
              </RadioGroup>
            )}
          </Field>
          <Field label={t("Page size")}>
            {(id) => (
              <Select
                id={id}
                value={str("page_size")}
                onChange={(e) => set({ page_size: e.currentTarget.value })}
                options={[
                  { value: "a4", label: "A4" },
                  { value: "letter", label: tr("US Letter") },
                  { value: "fit", label: tr("Fit each photo") },
                ]}
              />
            )}
          </Field>
          <Field label={t("Output name")}>
            {(id) => (
              <Input id={id} value={str("outputName")} onChange={(e) => set({ outputName: e.currentTarget.value })} placeholder="scan" />
            )}
          </Field>
        </OptionsPanel>
      );

    case "pdfa":
      return (
        <OptionsPanel
          className={className}
          description={t("Embeds fonts, converts colours to sRGB and marks the file as PDF/A-2b for archiving. Best-effort: it has not been run through a validator such as veraPDF, and features PDF/A forbids are dropped. No options to configure.")}
        >
          {null}
        </OptionsPanel>
      );

    case "flatten":
      return (
        <OptionsPanel
          className={className}
          description={t("Turns form fields and annotations into ordinary page content. Text stays selectable and the file stays small. No options to configure.")}
        >
          {null}
        </OptionsPanel>
      );

    case "pdf-to-excel":
      return (
        <OptionsPanel
          className={className}
          description={t("Extracts every table it finds into a spreadsheet — one sheet per page. No options to configure.")}
        >
          {null}
        </OptionsPanel>
      );

    default:
      return null;
  }
}

function ImageFileField({ label, value, onChange }: { label: string; value: string; onChange: (dataUrl: string) => void }) {
  const { t } = useTranslation();
  return (
    <Field label={label} hint={value ? t("Image selected.") : undefined}>
      {(id) => (
        <input
          id={id}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result as string);
            reader.readAsDataURL(file);
          }}
          className="text-xs text-muted file:mr-2 file:rounded-md file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs"
        />
      )}
    </Field>
  );
}

function ProtectPasswordField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="relative">
          <Input
            id={id}
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            placeholder={t("At least 4 characters")}
            className="pr-14"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-text"
          >
            {show ? t("Hide") : t("Show")}
          </button>
        </div>
      )}
    </Field>
  );
}
