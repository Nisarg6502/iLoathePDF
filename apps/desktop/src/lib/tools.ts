/**
 * The single source of truth for every tool the app offers.
 *
 * The Home grid, the router, the whole-window drop routing and the tool
 * workspace all read from this array. Adding a tool is a one-entry change
 * here plus (optionally) an options form in OptionsPanel.tsx.
 */

import type { LucideIcon } from "lucide-react";
import {
  Combine,
  FileImage,
  FileOutput,
  Images,
  Minimize2,
  Replace,
  Scissors,
  Signature,
} from "lucide-react";
import type { OpName } from "./jobs";

export type ToolGroup = "pdf" | "image";

export type Tint = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";

export type OptionValue = string | number | boolean;
export type OptionValues = Record<string, OptionValue>;

export interface Tool {
  /** Stable id, also the URL segment. */
  id: string;
  /** Route path, always "/t/{id}". */
  path: string;
  title: string;
  /** One line. Shown on the Home card and under the tool heading. */
  description: string;
  icon: LucideIcon;
  group: ToolGroup;
  tint: Tint;
  /** Sidecar operation this tool runs. */
  op: OpName;
  /** Lower-case extensions, no dot. Used to filter drops and browse dialogs. */
  accepts: string[];
  /** Human label for the accepted set, e.g. "PDF files". */
  acceptsLabel: string;
  /** Does the tool take more than one input file? */
  multiple: boolean;
  /** Does the order of the inputs change the result? */
  ordered: boolean;
  /** Verb on the run button. */
  action: string;
  /** Initial values for the tool's options form. */
  defaults: OptionValues;
}

export const IMAGE_EXTS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
  "bmp",
  "tif",
  "tiff",
  "gif",
];

export const TOOLS: Tool[] = [
  {
    id: "merge",
    path: "/t/merge",
    title: "Merge PDF",
    description: "Combine several PDFs into one, in the order you choose.",
    icon: Combine,
    group: "pdf",
    tint: "a",
    op: "pdf.merge",
    accepts: ["pdf"],
    acceptsLabel: "PDF files",
    multiple: true,
    ordered: true,
    action: "Merge PDFs",
    defaults: { outputName: "merged" },
  },
  {
    id: "split",
    path: "/t/split",
    title: "Split PDF",
    description: "Cut a PDF into ranges, or pull out just the pages you need.",
    icon: Scissors,
    group: "pdf",
    tint: "b",
    op: "pdf.split",
    accepts: ["pdf"],
    acceptsLabel: "a PDF file",
    multiple: false,
    ordered: false,
    action: "Split PDF",
    defaults: { mode: "ranges", ranges: "1-3", every: 2, pages: "1" },
  },
  {
    id: "organize",
    path: "/t/organize",
    title: "Organize pages",
    description: "Reorder, rotate and drop pages on a page-by-page canvas.",
    icon: Replace,
    group: "pdf",
    tint: "c",
    op: "pdf.organize",
    accepts: ["pdf"],
    acceptsLabel: "a PDF file",
    multiple: false,
    ordered: false,
    action: "Save PDF",
    defaults: { outputName: "organized" },
  },
  {
    id: "sign",
    path: "/t/sign",
    title: "Sign & Fill",
    description: "Draw or upload a signature, then add text, dates and initials on the page.",
    icon: Signature,
    group: "pdf",
    tint: "h",
    op: "pdf.sign",
    accepts: ["pdf"],
    acceptsLabel: "a PDF file",
    multiple: false,
    ordered: false,
    action: "Export signed PDF",
    defaults: { outputName: "signed" },
  },
  {
    id: "compress",
    path: "/t/compress",
    title: "Compress PDF",
    description: "Shrink a PDF for email, with the quality trade-off in view.",
    icon: Minimize2,
    group: "pdf",
    tint: "d",
    op: "pdf.compress",
    accepts: ["pdf"],
    acceptsLabel: "a PDF file",
    multiple: false,
    ordered: false,
    action: "Compress PDF",
    defaults: { level: "balanced" },
  },
  {
    id: "pdf-to-image",
    path: "/t/pdf-to-image",
    title: "PDF to images",
    description: "Render every page as a PNG or JPG at the DPI you pick.",
    icon: FileOutput,
    group: "pdf",
    tint: "e",
    op: "pdf.to_img",
    accepts: ["pdf"],
    acceptsLabel: "a PDF file",
    multiple: false,
    ordered: false,
    action: "Export images",
    defaults: { format: "png", dpi: 150, pages: "" },
  },
  {
    id: "image-to-pdf",
    path: "/t/image-to-pdf",
    title: "Images to PDF",
    description: "Turn scans and photos into one PDF, one image per page.",
    icon: FileImage,
    group: "image",
    tint: "f",
    op: "img.to_pdf",
    accepts: IMAGE_EXTS,
    acceptsLabel: "images",
    multiple: true,
    ordered: true,
    action: "Create PDF",
    defaults: { outputName: "images", page_size: "fit", orientation: "auto", margin_mm: 0 },
  },
  {
    id: "convert-image",
    path: "/t/convert-image",
    title: "Convert images",
    description: "HEIC, PNG, JPG and WebP both ways, with resize and strip.",
    icon: Images,
    group: "image",
    tint: "g",
    op: "img.convert",
    accepts: IMAGE_EXTS,
    acceptsLabel: "images",
    multiple: true,
    ordered: false,
    action: "Convert images",
    defaults: {
      format: "jpg",
      quality: 85,
      resizeMode: "none",
      max_px: 2000,
      percent: 50,
      strip_metadata: true,
    },
  },
];

export const GROUP_LABEL: Record<ToolGroup, string> = {
  pdf: "PDF tools",
  image: "Image tools",
};

export const GROUP_BLURB: Record<ToolGroup, string> = {
  pdf: "Everything that reads or writes a PDF.",
  image: "Photos and scans, in and out of PDF.",
};

export function toolById(id: string | undefined): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function toolsInGroup(group: ToolGroup): Tool[] {
  return TOOLS.filter((t) => t.group === group);
}

/** "photo.HEIC" -> "heic". Returns "" when there is no extension. */
export function extOf(nameOrPath: string): string {
  const base = nameOrPath.split(/[\\/]/).pop() ?? nameOrPath;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function toolAccepts(tool: Tool, nameOrPath: string): boolean {
  return tool.accepts.includes(extOf(nameOrPath));
}

/**
 * Given a dropped set of names, which tools could plausibly handle them?
 * Used by the whole-window drop target on Home.
 */
export function suggestTools(names: string[]): Tool[] {
  if (names.length === 0) return [];
  const exts = new Set(names.map(extOf));
  const usable = TOOLS.filter((t) => [...exts].every((e) => t.accepts.includes(e)));
  return usable
    .filter((t) => (names.length > 1 ? t.multiple : true))
    .sort((a, b) => {
      // Multi-file drops most likely mean a combining tool.
      if (names.length > 1) return Number(b.ordered) - Number(a.ordered);
      return 0;
    });
}
