import type { ToolConfig } from "./ToolConfig";
import type { Engine } from "@/engines/types";
import { lazyComponent, lazyEngine } from "./lazy";
import {
  CompressIcon,
  MergeIcon,
  SplitIcon,
  OrganizeIcon,
  PdfToImagesIcon,
  ImagesToPdfIcon,
  ConvertImagesIcon,
  CompressImagesIcon,
  SignIcon,
  ProtectIcon,
  WatermarkIcon,
  RedactIcon,
  OcrIcon,
  PdfToExcelIcon,
  CropIcon,
  FlattenIcon,
  TxtToPdfIcon,
  CsvToPdfIcon,
  HtmlToPdfIcon,
  ZipToPdfIcon,
  PdfaIcon,
  ReaderIcon,
  ScanIcon,
} from "./icons";

const MergeOptions = lazyComponent(() => import("./options/MergeOptions").then((m) => m.MergeOptions));
const mergeEngine = lazyEngine(() => import("@/engines/merge").then((m) => m.mergeEngine));
const SplitOptions = lazyComponent(() => import("./options/SplitOptions").then((m) => m.SplitOptions));
const splitEngine = lazyEngine(() => import("@/engines/split").then((m) => m.splitEngine));
const OrganizeOptions = lazyComponent(() => import("./options/OrganizeOptions").then((m) => m.OrganizeOptions));
const organizeEngine = lazyEngine(() => import("@/engines/organize").then((m) => m.organizeEngine));
const PdfToImagesOptions = lazyComponent(() => import("./options/PdfToImagesOptions").then((m) => m.PdfToImagesOptions));
const pdfToImagesEngine = lazyEngine(() => import("@/engines/pdfToImages").then((m) => m.pdfToImagesEngine));
const ImagesToPdfOptions = lazyComponent(() => import("./options/ImagesToPdfOptions").then((m) => m.ImagesToPdfOptions));
const imagesToPdfEngine = lazyEngine(() => import("@/engines/imagesToPdf").then((m) => m.imagesToPdfEngine));
const CompressOptions = lazyComponent(() => import("./options/CompressOptions").then((m) => m.CompressOptions));
const compressEngine = lazyEngine(() => import("@/engines/compress").then((m) => m.compressEngine));
const ConvertImagesOptions = lazyComponent(() => import("./options/ConvertImagesOptions").then((m) => m.ConvertImagesOptions));
const convertImagesEngine = lazyEngine(() => import("@/engines/convertImages").then((m) => m.convertImagesEngine));
const CompressImagesOptions = lazyComponent(() => import("./options/CompressImagesOptions").then((m) => m.CompressImagesOptions));
const compressImagesEngine = lazyEngine(() => import("@/engines/compressImages").then((m) => m.compressImagesEngine));
const SignOptions = lazyComponent(() => import("./options/SignOptions").then((m) => m.SignOptions));
const signEngine = lazyEngine(() => import("@/engines/sign").then((m) => m.signEngine));
const SignWorkspace = lazyComponent(() => import("./sign/SignWorkspace").then((m) => m.SignWorkspace));
const ProtectOptions = lazyComponent(() => import("./options/ProtectOptions").then((m) => m.ProtectOptions));
const protectEngine = lazyEngine(() => import("@/engines/protect").then((m) => m.protectEngine));
const WatermarkOptions = lazyComponent(() => import("./options/WatermarkOptions").then((m) => m.WatermarkOptions));
const watermarkEngine = lazyEngine(() => import("@/engines/watermark").then((m) => m.watermarkEngine));
const RedactOptions = lazyComponent(() => import("./options/RedactOptions").then((m) => m.RedactOptions));
const redactEngine = lazyEngine(() => import("@/engines/redact").then((m) => m.redactEngine));
const RedactWorkspace = lazyComponent(() => import("./redact/RedactWorkspace").then((m) => m.RedactWorkspace));
const OcrOptions = lazyComponent(() => import("./options/OcrOptions").then((m) => m.OcrOptions));
const ocrEngine = lazyEngine(() => import("@/engines/ocr").then((m) => m.ocrEngine));
const CropOptions = lazyComponent(() => import("./options/CropOptions").then((m) => m.CropOptions));
const cropEngine = lazyEngine(() => import("@/engines/crop").then((m) => m.cropEngine));
const FlattenOptions = lazyComponent(() => import("./options/FlattenOptions").then((m) => m.FlattenOptions));
const flattenEngine = lazyEngine(() => import("@/engines/flatten").then((m) => m.flattenEngine));
const TxtToPdfOptions = lazyComponent(() => import("./options/DocToPdfOptions").then((m) => m.TxtToPdfOptions));
const CsvToPdfOptions = lazyComponent(() => import("./options/DocToPdfOptions").then((m) => m.CsvToPdfOptions));
const HtmlToPdfOptions = lazyComponent(() => import("./options/DocToPdfOptions").then((m) => m.HtmlToPdfOptions));
const ZipToPdfOptions = lazyComponent(() => import("./options/DocToPdfOptions").then((m) => m.ZipToPdfOptions));
const txtToPdfEngine = lazyEngine(() => import("@/engines/docToPdf").then((m) => m.txtToPdfEngine));
const csvToPdfEngine = lazyEngine(() => import("@/engines/docToPdf").then((m) => m.csvToPdfEngine));
const htmlToPdfEngine = lazyEngine(() => import("@/engines/docToPdf").then((m) => m.htmlToPdfEngine));
const zipToPdfEngine = lazyEngine(() => import("@/engines/zipToPdf").then((m) => m.zipToPdfEngine));
const PdfaOptions = lazyComponent(() => import("./options/PdfaOptions").then((m) => m.PdfaOptions));
const ReaderOptions = lazyComponent(() => import("./options/ReaderOptions").then((m) => m.ReaderOptions));
const ReaderWorkspace = lazyComponent(() => import("./reader/ReaderWorkspace").then((m) => m.ReaderWorkspace));
const readerEngine: Engine = async () => {
  throw new Error("The reader only displays a PDF; it has nothing to save.");
};
const ScanOptions = lazyComponent(() => import("./options/ScanOptions").then((m) => m.ScanOptions));
const scanEngine = lazyEngine(() => import("@/engines/scanToPdf").then((m) => m.scanToPdfEngine));
const PdfToExcelOptions = lazyComponent(() => import("./options/PdfToExcelOptions").then((m) => m.PdfToExcelOptions));

const desktopOnlyEngine: Engine = async () => {
  throw new Error("This tool is only available in the desktop app.");
};

export const TOOLS: ToolConfig[] = [
  { slug: "merge", name: "Merge PDF", description: "Combine PDFs in the order you choose, with page ranges per file.", category: "pdf", Icon: MergeIcon, accept: [".pdf"], multiple: true, defaultOptions: { outputName: "merged" }, OptionsPanel: MergeOptions, engine: mergeEngine, status: "live", tint: "a" },
  { slug: "split", name: "Split PDF", description: "Cut into ranges, chop every N pages, extract or delete a selection.", category: "pdf", Icon: SplitIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "ranges", ranges: "", n: 2 }, OptionsPanel: SplitOptions, engine: splitEngine, status: "live", tint: "b" },
  { slug: "organize", name: "Organize pages", description: "Reorder, rotate and drop pages on a page canvas.", category: "pdf", Icon: OrganizeIcon, accept: [".pdf"], multiple: false, defaultOptions: { order: [], rotate: {}, remove: [] }, OptionsPanel: OrganizeOptions, engine: organizeEngine, status: "live", tint: "c" },
  { slug: "compress", name: "Compress PDF", description: "Shrink for email, with the quality trade-off shown before you commit.", category: "pdf", Icon: CompressIcon, accept: [".pdf"], multiple: false, defaultOptions: { dpi: 96 }, OptionsPanel: CompressOptions, engine: compressEngine, status: "preview", tint: "d" },
  { slug: "pdf-to-images", name: "PDF to images", description: "Render pages to PNG or JPG at the DPI you pick.", category: "pdf", Icon: PdfToImagesIcon, accept: [".pdf"], multiple: false, defaultOptions: { dpi: 144, format: "png" }, OptionsPanel: PdfToImagesOptions, engine: pdfToImagesEngine, status: "live", tint: "e" },
  { slug: "images-to-pdf", name: "Images to PDF", description: "Scans and photos into one PDF, one image per page.", category: "image", Icon: ImagesToPdfIcon, accept: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"], multiple: true, defaultOptions: { outputName: "images", page_size: "fit", orientation: "auto", margin_mm: 0 }, OptionsPanel: ImagesToPdfOptions, engine: imagesToPdfEngine, status: "live", tint: "f" },
  { slug: "convert-images", name: "Convert images", description: "PNG, JPG and WebP any direction — and HEIC off an iPhone.", category: "image", Icon: ConvertImagesIcon, accept: [".png", ".jpg", ".jpeg", ".webp", ".heic"], multiple: true, defaultOptions: { to: "png" }, OptionsPanel: ConvertImagesOptions, engine: convertImagesEngine, status: "preview", tint: "g" },
  { slug: "compress-images", name: "Compress images", description: "Shrink JPG, PNG and WebP files with a live size estimate before you commit.", category: "image", Icon: CompressImagesIcon, accept: [".png", ".jpg", ".jpeg", ".webp"], multiple: true, defaultOptions: { quality: 75, format: "keep", maxDimension: null }, OptionsPanel: CompressImagesOptions, engine: compressImagesEngine, status: "live", tint: "n" },
  { slug: "sign", name: "Sign & Fill", description: "Draw or upload a signature, add text, dates and initials, or mark the page up with highlights and boxes.", category: "pdf", Icon: SignIcon, accept: [".pdf"], multiple: false, defaultOptions: { elements: [] }, OptionsPanel: SignOptions, engine: signEngine, status: "live", tint: "h", Workspace: SignWorkspace },
  { slug: "protect", name: "Protect & Unlock PDF", description: "Add or remove a password that's required to open the file.", category: "pdf", Icon: ProtectIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "protect", password: "", confirmPassword: "" }, OptionsPanel: ProtectOptions, engine: protectEngine, status: "live", tint: "i" },
  { slug: "watermark", name: "Watermark, Page Numbers & Stamp", description: "Add a repeating watermark, sequential page numbers, or a fixed stamp to every page.", category: "pdf", Icon: WatermarkIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "watermark", pages: "all", watermark: { content: "text", text: "", opacity: 0.35, rotation: 45, placement: "single" }, page_numbers: { position: "bottom-center", format: "n", start: 1 }, stamp: { content: "text", text: "", position: "bottom-right", maxWidthPct: 0.2 } }, OptionsPanel: WatermarkOptions, engine: watermarkEngine, status: "live", tint: "j" },
  { slug: "redact", name: "Redact PDF", description: "Black out sensitive text, photos or signatures — visually or for good.", category: "pdf", Icon: RedactIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "visual", boxes: [] }, OptionsPanel: RedactOptions, engine: redactEngine, status: "live", tint: "k", Workspace: RedactWorkspace },
  { slug: "ocr", name: "OCR → Searchable PDF", description: "Add an invisible text layer to a scanned PDF so it's searchable and selectable.", category: "pdf", Icon: OcrIcon, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: OcrOptions, engine: ocrEngine, status: "live", tint: "l" },
  { slug: "pdf-to-excel", name: "PDF to Excel", description: "Extract tables from a PDF into a real, editable spreadsheet.", category: "pdf", Icon: PdfToExcelIcon, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: PdfToExcelOptions, engine: desktopOnlyEngine, status: "desktop-only", tint: "m", desktopOnlyNote: "This tool needs a local table-extraction engine that isn't available in a browser yet — it's desktop-only for now." },
  { slug: "crop", name: "Crop PDF", description: "Trim the margins off every page, or just the pages you pick.", category: "pdf", Icon: CropIcon, accept: [".pdf"], multiple: false, defaultOptions: { top: 0, right: 0, bottom: 0, left: 0, pages: "" }, OptionsPanel: CropOptions, engine: cropEngine, status: "live", tint: "o" },
  { slug: "flatten", name: "Flatten PDF", description: "Bake form fields and annotations into the page so they can't be edited.", category: "pdf", Icon: FlattenIcon, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: FlattenOptions, engine: flattenEngine, status: "live", tint: "p" },
  { slug: "txt-to-pdf", name: "TXT to PDF", description: "Turn plain-text files into PDFs, one PDF per file.", category: "document", Icon: TxtToPdfIcon, accept: [".txt", ".text", ".log"], multiple: true, defaultOptions: { page_size: "a4", orientation: "portrait", margin_mm: 20, font: "sans", font_size: 11 }, OptionsPanel: TxtToPdfOptions, engine: txtToPdfEngine, status: "live", tint: "q" },
  { slug: "csv-to-pdf", name: "CSV to PDF", description: "Lay a CSV out as a table, with the header repeated on every page.", category: "document", Icon: CsvToPdfIcon, accept: [".csv", ".tsv"], multiple: true, defaultOptions: { page_size: "a4", orientation: "auto", margin_mm: 15 }, OptionsPanel: CsvToPdfOptions, engine: csvToPdfEngine, status: "live", tint: "r" },
  { slug: "html-to-pdf", name: "HTML to PDF", description: "Convert simple HTML pages (headings, lists, tables) into PDFs.", category: "document", Icon: HtmlToPdfIcon, accept: [".html", ".htm"], multiple: true, defaultOptions: { page_size: "a4", orientation: "portrait", margin_mm: 20, font_size: 11 }, OptionsPanel: HtmlToPdfOptions, engine: htmlToPdfEngine, status: "live", tint: "s" },
  { slug: "zip-to-pdf", name: "ZIP to PDF", description: "Join the images, PDFs and text files inside a ZIP into one PDF.", category: "document", Icon: ZipToPdfIcon, accept: [".zip"], multiple: false, defaultOptions: { page_size: "fit", orientation: "auto" }, OptionsPanel: ZipToPdfOptions, engine: zipToPdfEngine, status: "live", tint: "t" },
  { slug: "pdfa", name: "PDF to PDF/A", description: "Convert a PDF to PDF/A-2b for long-term archiving.", category: "pdf", Icon: PdfaIcon, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: PdfaOptions, engine: desktopOnlyEngine, status: "desktop-only", tint: "u", desktopOnlyNote: "PDF/A conversion runs on Ghostscript, which isn't available in a browser — it's desktop-only." },
  { slug: "reader", name: "PDF Reader", description: "Read a PDF right here: scroll, zoom, select text and search. Nothing is uploaded.", category: "pdf", Icon: ReaderIcon, accept: [".pdf"], multiple: false, defaultOptions: {}, OptionsPanel: ReaderOptions, engine: readerEngine, status: "live", tint: "v", Workspace: ReaderWorkspace },
  { slug: "scan", name: "PDF Scanner", description: "Scan with your camera or pick photos of paper, clean them up and join them into one PDF.", category: "image", Icon: ScanIcon, accept: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"], multiple: true, defaultOptions: { outputName: "scan", mode: "enhanced", page_size: "a4", orientation: "auto", margin_mm: 0 }, OptionsPanel: ScanOptions, engine: scanEngine, status: "live", tint: "w" },
];

export function getTool(slug: string): ToolConfig | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
