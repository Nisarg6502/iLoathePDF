import type { ToolConfig } from "./ToolConfig";
import { MergeOptions } from "./options/MergeOptions";
import { mergeEngine } from "@/engines/merge";
import { SplitOptions } from "./options/SplitOptions";
import { splitEngine } from "@/engines/split";
import { OrganizeOptions } from "./options/OrganizeOptions";
import { organizeEngine } from "@/engines/organize";
import { PdfToImagesOptions } from "./options/PdfToImagesOptions";
import { pdfToImagesEngine } from "@/engines/pdfToImages";
import { ImagesToPdfOptions } from "./options/ImagesToPdfOptions";
import { imagesToPdfEngine } from "@/engines/imagesToPdf";
import { CompressOptions } from "./options/CompressOptions";
import { compressEngine } from "@/engines/compress";
import { ConvertImagesOptions } from "./options/ConvertImagesOptions";
import { convertImagesEngine } from "@/engines/convertImages";
import { SignOptions } from "./options/SignOptions";
import { signEngine } from "@/engines/sign";
import { SignWorkspace } from "./sign/SignWorkspace";
import {
  CompressIcon,
  MergeIcon,
  SplitIcon,
  OrganizeIcon,
  PdfToImagesIcon,
  ImagesToPdfIcon,
  ConvertImagesIcon,
  SignIcon,
} from "./icons";

export const TOOLS: ToolConfig[] = [
  { slug: "merge", name: "Merge PDF", description: "Combine PDFs in the order you choose, with page ranges per file.", category: "pdf", Icon: MergeIcon, accept: [".pdf"], multiple: true, defaultOptions: {}, OptionsPanel: MergeOptions, engine: mergeEngine, status: "live", tint: "a" },
  { slug: "split", name: "Split PDF", description: "Cut into ranges, chop every N pages, extract or delete a selection.", category: "pdf", Icon: SplitIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "ranges", ranges: "", n: 2 }, OptionsPanel: SplitOptions, engine: splitEngine, status: "live", tint: "b" },
  { slug: "organize", name: "Organize pages", description: "Reorder, rotate and drop pages on a page canvas.", category: "pdf", Icon: OrganizeIcon, accept: [".pdf"], multiple: false, defaultOptions: { order: [], rotate: {}, remove: [] }, OptionsPanel: OrganizeOptions, engine: organizeEngine, status: "live", tint: "c" },
  { slug: "compress", name: "Compress PDF", description: "Shrink for email, with the quality trade-off shown before you commit.", category: "pdf", Icon: CompressIcon, accept: [".pdf"], multiple: false, defaultOptions: { dpi: 96 }, OptionsPanel: CompressOptions, engine: compressEngine, status: "preview", tint: "d" },
  { slug: "pdf-to-images", name: "PDF to images", description: "Render pages to PNG or JPG at the DPI you pick.", category: "pdf", Icon: PdfToImagesIcon, accept: [".pdf"], multiple: false, defaultOptions: { dpi: 144, format: "png" }, OptionsPanel: PdfToImagesOptions, engine: pdfToImagesEngine, status: "live", tint: "e" },
  { slug: "images-to-pdf", name: "Images to PDF", description: "Scans and photos into one PDF, one image per page.", category: "image", Icon: ImagesToPdfIcon, accept: [".png", ".jpg", ".jpeg"], multiple: true, defaultOptions: { margin: 24 }, OptionsPanel: ImagesToPdfOptions, engine: imagesToPdfEngine, status: "live", tint: "f" },
  { slug: "convert-images", name: "Convert images", description: "PNG, JPG and WebP any direction — and HEIC off an iPhone.", category: "image", Icon: ConvertImagesIcon, accept: [".png", ".jpg", ".jpeg", ".webp", ".heic"], multiple: true, defaultOptions: { to: "png" }, OptionsPanel: ConvertImagesOptions, engine: convertImagesEngine, status: "preview", tint: "g" },
  { slug: "sign", name: "Sign & Fill", description: "Draw or upload a signature, then add text, dates and initials on the page.", category: "pdf", Icon: SignIcon, accept: [".pdf"], multiple: false, defaultOptions: { elements: [] }, OptionsPanel: SignOptions, engine: signEngine, status: "live", tint: "h", Workspace: SignWorkspace },
];

export function getTool(slug: string): ToolConfig | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
