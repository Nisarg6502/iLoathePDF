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
import { ProtectOptions } from "./options/ProtectOptions";
import { protectEngine } from "@/engines/protect";
import { WatermarkOptions } from "./options/WatermarkOptions";
import { watermarkEngine } from "@/engines/watermark";
import { RedactOptions } from "./options/RedactOptions";
import { redactEngine } from "@/engines/redact";
import { RedactWorkspace } from "./redact/RedactWorkspace";
import { OcrOptions } from "./options/OcrOptions";
import { ocrEngine } from "@/engines/ocr";
import {
  CompressIcon,
  MergeIcon,
  SplitIcon,
  OrganizeIcon,
  PdfToImagesIcon,
  ImagesToPdfIcon,
  ConvertImagesIcon,
  SignIcon,
  ProtectIcon,
  WatermarkIcon,
  RedactIcon,
  OcrIcon,
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
  { slug: "protect", name: "Protect & Unlock PDF", description: "Add or remove a password that's required to open the file.", category: "pdf", Icon: ProtectIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "protect", password: "", confirmPassword: "" }, OptionsPanel: ProtectOptions, engine: protectEngine, status: "live", tint: "i" },
  { slug: "watermark", name: "Watermark, Page Numbers & Stamp", description: "Add a repeating watermark, sequential page numbers, or a fixed stamp to every page.", category: "pdf", Icon: WatermarkIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "watermark", pages: "all", watermark: { content: "text", text: "", opacity: 0.35, rotation: 45, placement: "single" }, page_numbers: { position: "bottom-center", format: "n", start: 1 }, stamp: { content: "text", text: "", position: "bottom-right", maxWidthPct: 0.2 } }, OptionsPanel: WatermarkOptions, engine: watermarkEngine, status: "live", tint: "j" },
  { slug: "redact", name: "Redact PDF", description: "Black out sensitive text, photos or signatures — visually or for good.", category: "pdf", Icon: RedactIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "visual", boxes: [] }, OptionsPanel: RedactOptions, engine: redactEngine, status: "live", tint: "k", Workspace: RedactWorkspace },
  { slug: "ocr", name: "OCR → Searchable PDF", description: "Add an invisible text layer to a scanned PDF so it's searchable and selectable.", category: "pdf", Icon: OcrIcon, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: OcrOptions, engine: ocrEngine, status: "live", tint: "l" },
];

export function getTool(slug: string): ToolConfig | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
