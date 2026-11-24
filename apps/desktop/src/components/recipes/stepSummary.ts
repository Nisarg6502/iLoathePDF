import { msg, tr } from "@iloathepdf/i18n";
import type { Options, RecipeStep } from "@/lib/chain";

const PAGE: Record<string, string> = { fit: msg("fit to image"), a4: "A4", letter: msg("US Letter") };
const page = (value: unknown, fallback: string) => tr(PAGE[String(value)] ?? fallback);
const POSITION: Record<string, string> = {
  "top-left": msg("top left"),
  "top-center": msg("top center"),
  "top-right": msg("top right"),
  "bottom-left": msg("bottom left"),
  "bottom-center": msg("bottom center"),
  "bottom-right": msg("bottom right"),
};
const position = (p: unknown) => {
  const key = String(p ?? "");
  return POSITION[key] ? tr(POSITION[key]) : key.replace("-", " ");
};
const ORIENTATION: Record<string, string> = { portrait: msg("portrait"), landscape: msg("landscape"), auto: msg("auto") };
const LEVEL: Record<string, string> = { lossless: msg("Lossless"), balanced: msg("Balanced"), strong: msg("Strong · smallest file") };

/** One short line describing a step's settings, shown on its card. Call while rendering, so it follows the language. */
export function stepSummary(step: RecipeStep, defaults: Options): string {
  const o = { ...defaults, ...step.options };
  switch (step.tool) {
    case "compress":
      return tr(LEVEL[String(o.level)] ?? "Balanced");
    case "convert-image": {
      const parts = [tr("To {{format}}", { format: String(o.format ?? "jpg").toUpperCase() })];
      if (o.format !== "png") parts.push(tr("quality {{quality}}", { quality: Number(o.quality ?? 85) }));
      if (o.resizeMode === "max") parts.push(tr("max {{px}}px", { px: Number(o.max_px) }));
      if (o.resizeMode === "percent") parts.push(tr("{{percent}}% size", { percent: Number(o.percent) }));
      return parts.join(" · ");
    }
    case "pdf-to-image":
      return tr("{{format}} at {{dpi}} DPI", { format: String(o.format ?? "png").toUpperCase(), dpi: Number(o.dpi ?? 150) });
    case "image-to-pdf": {
      const size = page(o.page_size, "fit to image");
      return o.page_size !== "fit" && Number(o.margin_mm) ? `${size} · ${tr("{{mm}} mm margin", { mm: Number(o.margin_mm) })}` : size;
    }
    case "scan": {
      const mode = o.mode === "bw" ? tr("Black & white") : o.mode === "color" ? tr("Original colour") : tr("Enhanced");
      return `${mode} · ${page(o.page_size, "A4")}`;
    }
    case "merge":
      return tr("Saves as {{name}}.pdf", { name: String(o.outputName || "merged") });
    case "split":
      if (o.mode === "every") return Number(o.every) === 1 ? tr("One file per page") : tr("Every {{count}} pages", { count: Number(o.every) });
      if (o.mode === "extract") return tr("Keep pages {{pages}}", { pages: String(o.pages || "…") });
      if (o.mode === "delete") return tr("Remove pages {{pages}}", { pages: String(o.pages || "…") });
      return tr("Ranges {{ranges}}", { ranges: String(o.ranges || "…") });
    case "crop": {
      const m = ["top", "right", "bottom", "left"].map((s) => Number(o[s] ?? 0));
      if (m.every((v) => v === m[0])) return m[0] ? tr("{{percent}}% off every side", { percent: m[0] }) : tr("No margins set yet");
      return tr("Trim {{margins}}%", { margins: m.join("/") });
    }
    case "watermark": {
      const where = o.pages === "first" ? tr("first page") : o.pages === "custom" ? tr("pages {{pages}}", { pages: String(o.customPages ?? "") }) : "";
      const withWhere = (text: string) => (where ? `${text}, ${where}` : text);
      if (o.mode === "page_numbers") {
        const fmt = o.pageNumberFormat === "n-of-total" ? tr("“1 of N”") : o.pageNumberFormat === "page-n" ? tr("“Page 1”") : "“1”";
        return withWhere(tr("Page numbers {{format}}, {{position}}", { format: fmt, position: position(o.pageNumberPosition ?? "bottom-center") }));
      }
      const stamp = o.mode === "stamp";
      const content = stamp ? o.stampContent : o.watermarkContent;
      const text = stamp ? o.stampText : o.watermarkText;
      const what = content === "image" ? tr("image") : text ? `“${String(text)}”` : tr("text not set");
      return withWhere(stamp ? tr("Stamp {{what}}", { what }) : tr("Watermark {{what}}", { what }));
    }
    case "protect":
      return o.mode === "unlock" ? tr("Removes the password") : tr("Locks with a password");
    case "ocr":
      return tr("English text layer");
    case "flatten":
      return tr("Forms and notes baked in");
    case "pdfa":
      return "PDF/A-2b";
    case "pdf-to-excel":
      return tr("One sheet per page with tables");
    case "txt-to-pdf":
    case "html-to-pdf": {
      const orientation = String(o.orientation ?? "portrait");
      return `${page(o.page_size, "A4")} · ${ORIENTATION[orientation] ? tr(ORIENTATION[orientation]) : orientation}`;
    }
    case "csv-to-pdf":
      return tr("{{size}} · header on every page", { size: page(o.page_size, "A4") });
    case "zip-to-pdf":
      return tr("{{size}} pages", { size: page(o.page_size, "fit to image") });
    default:
      return tr("Default settings");
  }
}
