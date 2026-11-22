import type { Options, RecipeStep } from "@/lib/chain";

const PAGE: Record<string, string> = { fit: "fit to image", a4: "A4", letter: "US Letter" };
const POS = (p: unknown) => String(p ?? "").replace("-", " ");
const LEVEL: Record<string, string> = { lossless: "Lossless", balanced: "Balanced", strong: "Strong · smallest file" };

/** One short line describing a step's settings, shown on its card. */
export function stepSummary(step: RecipeStep, defaults: Options): string {
  const o = { ...defaults, ...step.options };
  switch (step.tool) {
    case "compress":
      return LEVEL[String(o.level)] ?? "Balanced";
    case "convert-image": {
      const parts = [`To ${String(o.format ?? "jpg").toUpperCase()}`];
      if (o.format !== "png") parts.push(`quality ${o.quality ?? 85}`);
      if (o.resizeMode === "max") parts.push(`max ${o.max_px}px`);
      if (o.resizeMode === "percent") parts.push(`${o.percent}% size`);
      return parts.join(" · ");
    }
    case "pdf-to-image":
      return `${String(o.format ?? "png").toUpperCase()} at ${o.dpi ?? 150} DPI`;
    case "image-to-pdf":
      return `${PAGE[String(o.page_size)] ?? "fit to image"}${o.page_size !== "fit" && Number(o.margin_mm) ? ` · ${o.margin_mm} mm margin` : ""}`;
    case "scan": {
      const mode = o.mode === "bw" ? "Black & white" : o.mode === "color" ? "Original colour" : "Enhanced";
      return `${mode} · ${PAGE[String(o.page_size)] ?? "A4"}`;
    }
    case "merge":
      return `Saves as ${String(o.outputName || "merged")}.pdf`;
    case "split":
      if (o.mode === "every") return Number(o.every) === 1 ? "One file per page" : `Every ${o.every} pages`;
      if (o.mode === "extract") return `Keep pages ${o.pages || "…"}`;
      if (o.mode === "delete") return `Remove pages ${o.pages || "…"}`;
      return `Ranges ${o.ranges || "…"}`;
    case "crop": {
      const m = ["top", "right", "bottom", "left"].map((s) => Number(o[s] ?? 0));
      if (m.every((v) => v === m[0])) return m[0] ? `${m[0]}% off every side` : "No margins set yet";
      return `Trim ${m.join("/")}%`;
    }
    case "watermark": {
      const where = o.pages === "first" ? ", first page" : o.pages === "custom" ? `, pages ${o.customPages}` : "";
      if (o.mode === "page_numbers") {
        const fmt = o.pageNumberFormat === "n-of-total" ? "“1 of N”" : o.pageNumberFormat === "page-n" ? "“Page 1”" : "“1”";
        return `Page numbers ${fmt}, ${POS(o.pageNumberPosition ?? "bottom-center")}${where}`;
      }
      const stamp = o.mode === "stamp";
      const content = stamp ? o.stampContent : o.watermarkContent;
      const text = stamp ? o.stampText : o.watermarkText;
      const what = content === "image" ? "image" : text ? `“${text}”` : "text not set";
      return `${stamp ? "Stamp" : "Watermark"} ${what}${where}`;
    }
    case "protect":
      return o.mode === "unlock" ? "Removes the password" : "Locks with a password";
    case "ocr":
      return "English text layer";
    case "flatten":
      return "Forms and notes baked in";
    case "pdfa":
      return "PDF/A-2b";
    case "pdf-to-excel":
      return "One sheet per page with tables";
    case "txt-to-pdf":
    case "html-to-pdf":
      return `${PAGE[String(o.page_size)] ?? "A4"} · ${o.orientation ?? "portrait"}`;
    case "csv-to-pdf":
      return `${PAGE[String(o.page_size)] ?? "A4"} · header on every page`;
    case "zip-to-pdf":
      return `${PAGE[String(o.page_size)] ?? "fit to image"} pages`;
    default:
      return "Default settings";
  }
}
