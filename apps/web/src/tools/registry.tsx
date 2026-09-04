import type { ToolConfig } from "./ToolConfig";
import { PlaceholderOptions } from "./options/PlaceholderOptions";
import { MergeOptions } from "./options/MergeOptions";
import { mergeEngine } from "@/engines/merge";
import { SplitOptions } from "./options/SplitOptions";
import { splitEngine } from "@/engines/split";
import { OrganizeOptions } from "./options/OrganizeOptions";
import { organizeEngine } from "@/engines/organize";
import { PdfToImagesOptions } from "./options/PdfToImagesOptions";
import { pdfToImagesEngine } from "@/engines/pdfToImages";

const notImplemented: ToolConfig["engine"] = async () => {
  throw new Error("This tool's engine has not been implemented yet.");
};

const IconStub = () => (
  <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="14" height="14" rx="2" />
  </svg>
);

export const TOOLS: ToolConfig[] = [
  { slug: "merge", name: "Merge PDF", description: "Combine PDFs in the order you choose, with page ranges per file.", category: "pdf", Icon: IconStub, accept: [".pdf"], multiple: true, defaultOptions: {}, OptionsPanel: MergeOptions, engine: mergeEngine, status: "live" },
  { slug: "split", name: "Split PDF", description: "Cut into ranges, chop every N pages, extract or delete a selection.", category: "pdf", Icon: IconStub, accept: [".pdf"], multiple: false, defaultOptions: { mode: "ranges", ranges: "", n: 2 }, OptionsPanel: SplitOptions, engine: splitEngine, status: "live" },
  { slug: "organize", name: "Organize pages", description: "Reorder, rotate and drop pages on a page canvas.", category: "pdf", Icon: IconStub, accept: [".pdf"], multiple: false, defaultOptions: { order: [], rotate: {}, remove: [] }, OptionsPanel: OrganizeOptions, engine: organizeEngine, status: "live" },
  { slug: "compress", name: "Compress PDF", description: "Shrink for email, with the quality trade-off shown before you commit.", category: "pdf", Icon: IconStub, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: PlaceholderOptions, engine: notImplemented, status: "preview" },
  { slug: "pdf-to-images", name: "PDF to images", description: "Render pages to PNG or JPG at the DPI you pick.", category: "pdf", Icon: IconStub, accept: [".pdf"], multiple: false, defaultOptions: { dpi: 144, format: "png" }, OptionsPanel: PdfToImagesOptions, engine: pdfToImagesEngine, status: "live" },
  { slug: "images-to-pdf", name: "Images to PDF", description: "Scans and photos into one PDF, one image per page.", category: "image", Icon: IconStub, accept: [".png", ".jpg", ".jpeg"], multiple: true, defaultOptions: {}, OptionsPanel: PlaceholderOptions, engine: notImplemented, status: "live" },
  { slug: "convert-images", name: "Convert images", description: "PNG, JPG and WebP any direction — and HEIC off an iPhone.", category: "image", Icon: IconStub, accept: [".png", ".jpg", ".jpeg", ".webp", ".heic"], multiple: true, defaultOptions: {}, OptionsPanel: PlaceholderOptions, engine: notImplemented, status: "preview" },
];

export function getTool(slug: string): ToolConfig | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
