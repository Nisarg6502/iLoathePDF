import type { Options, RecipeStep } from "@/recipes/chain";

const PAGE: Record<string, string> = { fit: "fit to image", a4: "A4", letter: "US Letter" };
const POS = (p: unknown) => String(p ?? "").replace("-", " ");

function compressLevel(dpi: number): string {
  if (dpi <= 80) return "smallest file";
  if (dpi <= 110) return "small file";
  if (dpi <= 160) return "balanced";
  return "sharp";
}

/** One short line describing a step's settings, shown on its card. */
export function stepSummary(step: RecipeStep, defaults: Options): string {
  const o = { ...defaults, ...step.options };
  switch (step.tool) {
    case "compress": {
      const dpi = Number(o.dpi ?? 96);
      return `${dpi} DPI · ${compressLevel(dpi)}`;
    }
    case "compress-images": {
      const parts = [`Quality ${o.quality ?? 75}%`];
      if (o.maxDimension) parts.push(`max ${o.maxDimension}px`);
      if (o.format && o.format !== "keep") parts.push(String(o.format).toUpperCase());
      return parts.join(" · ");
    }
    case "convert-images":
      return `To ${String(o.to ?? "png").toUpperCase()}`;
    case "pdf-to-images":
      return `${String(o.format ?? "png").toUpperCase()} at ${o.dpi ?? 144} DPI`;
    case "images-to-pdf":
      return `${PAGE[String(o.page_size)] ?? "fit to image"}${Number(o.margin_mm) ? ` · ${o.margin_mm} mm margin` : ""}`;
    case "scan": {
      const mode = o.mode === "bw" ? "Black & white" : o.mode === "color" ? "Original colour" : "Enhanced";
      return `${mode} · ${PAGE[String(o.page_size)] ?? "A4"}`;
    }
    case "merge":
      return `Saves as ${String(o.outputName || "merged")}.pdf`;
    case "split":
      if (o.mode === "everyN") return Number(o.n) === 1 ? "One file per page" : `Every ${o.n} pages`;
      if (o.mode === "extract") return o.ranges ? `Keep pages ${o.ranges}` : "Keep pages: you choose";
      if (o.mode === "delete") return o.ranges ? `Remove pages ${o.ranges}` : "Remove pages: you choose";
      return o.ranges ? `Ranges ${o.ranges}` : "Ranges: you choose";
    case "crop": {
      const m = ["top", "right", "bottom", "left"].map((s) => Number(o[s] ?? 0));
      if (m.every((v) => v === m[0])) return m[0] ? `${m[0]}% off every side` : "No margins set yet";
      return `Trim ${m.join("/")}%`;
    }
    case "watermark": {
      const where = o.pages === "first" ? ", first page" : o.pages && o.pages !== "all" ? `, pages ${o.pages}` : "";
      if (o.mode === "page_numbers") {
        const pn = (o.page_numbers ?? {}) as { position?: string; format?: string };
        const fmt = pn.format === "n-of-total" ? "“1 of N”" : pn.format === "page-n" ? "“Page 1”" : "“1”";
        return `Page numbers ${fmt}, ${POS(pn.position ?? "bottom-center")}${where}`;
      }
      const spec = ((o.mode === "stamp" ? o.stamp : o.watermark) ?? {}) as { content?: string; text?: string };
      const what = spec.content === "image" ? "image" : spec.text ? `“${spec.text}”` : "text not set";
      return `${o.mode === "stamp" ? "Stamp" : "Watermark"} ${what}${where}`;
    }
    case "protect":
      return o.mode === "unlock" ? "Removes the password" : "Locks with a password";
    case "ocr":
      return "English text layer";
    case "flatten":
      return "Forms and notes baked in";
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
