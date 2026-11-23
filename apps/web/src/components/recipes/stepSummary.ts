import { msg, tr } from "@iloathepdf/i18n";
import type { Options, RecipeStep } from "@/recipes/chain";

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

function compressLevel(dpi: number): string {
  if (dpi <= 80) return tr("smallest file");
  if (dpi <= 110) return tr("small file");
  if (dpi <= 160) return tr("balanced");
  return tr("sharp");
}

/** One short line describing a step's settings, shown on its card. Call while rendering, so it follows the language. */
export function stepSummary(step: RecipeStep, defaults: Options): string {
  const o = { ...defaults, ...step.options };
  switch (step.tool) {
    case "compress": {
      const dpi = Number(o.dpi ?? 96);
      return `${dpi} DPI · ${compressLevel(dpi)}`;
    }
    case "compress-images": {
      const parts = [tr("Quality {{quality}}%", { quality: Number(o.quality ?? 75) })];
      if (o.maxDimension) parts.push(tr("max {{px}}px", { px: Number(o.maxDimension) }));
      if (o.format && o.format !== "keep") parts.push(String(o.format).toUpperCase());
      return parts.join(" · ");
    }
    case "convert-images":
      return tr("To {{format}}", { format: String(o.to ?? "png").toUpperCase() });
    case "pdf-to-images":
      return tr("{{format}} at {{dpi}} DPI", { format: String(o.format ?? "png").toUpperCase(), dpi: Number(o.dpi ?? 144) });
    case "images-to-pdf": {
      const size = page(o.page_size, "fit to image");
      return Number(o.margin_mm) ? `${size} · ${tr("{{mm}} mm margin", { mm: Number(o.margin_mm) })}` : size;
    }
    case "scan": {
      const mode = o.mode === "bw" ? tr("Black & white") : o.mode === "color" ? tr("Original colour") : tr("Enhanced");
      return `${mode} · ${page(o.page_size, "A4")}`;
    }
    case "merge":
      return tr("Saves as {{name}}.pdf", { name: String(o.outputName || "merged") });
    case "split":
      if (o.mode === "everyN") return Number(o.n) === 1 ? tr("One file per page") : tr("Every {{count}} pages", { count: Number(o.n) });
      if (o.mode === "extract") return o.ranges ? tr("Keep pages {{pages}}", { pages: String(o.ranges) }) : tr("Keep pages: you choose");
      if (o.mode === "delete") return o.ranges ? tr("Remove pages {{pages}}", { pages: String(o.ranges) }) : tr("Remove pages: you choose");
      return o.ranges ? tr("Ranges {{ranges}}", { ranges: String(o.ranges) }) : tr("Ranges: you choose");
    case "crop": {
      const m = ["top", "right", "bottom", "left"].map((s) => Number(o[s] ?? 0));
      if (m.every((v) => v === m[0])) return m[0] ? tr("{{percent}}% off every side", { percent: m[0] }) : tr("No margins set yet");
      return tr("Trim {{margins}}%", { margins: m.join("/") });
    }
    case "watermark": {
      const where = o.pages === "first" ? tr("first page") : o.pages && o.pages !== "all" ? tr("pages {{pages}}", { pages: String(o.pages) }) : "";
      const withWhere = (text: string) => (where ? `${text}, ${where}` : text);
      if (o.mode === "page_numbers") {
        const pn = (o.page_numbers ?? {}) as { position?: string; format?: string };
        const fmt = pn.format === "n-of-total" ? tr("“1 of N”") : pn.format === "page-n" ? tr("“Page 1”") : "“1”";
        return withWhere(tr("Page numbers {{format}}, {{position}}", { format: fmt, position: position(pn.position ?? "bottom-center") }));
      }
      const spec = ((o.mode === "stamp" ? o.stamp : o.watermark) ?? {}) as { content?: string; text?: string };
      const what = spec.content === "image" ? tr("image") : spec.text ? `“${spec.text}”` : tr("text not set");
      return withWhere(o.mode === "stamp" ? tr("Stamp {{what}}", { what }) : tr("Watermark {{what}}", { what }));
    }
    case "protect":
      return o.mode === "unlock" ? tr("Removes the password") : tr("Locks with a password");
    case "ocr":
      return tr("English text layer");
    case "flatten":
      return tr("Forms and notes baked in");
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
