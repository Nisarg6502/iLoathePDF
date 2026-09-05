/**
 * Turns a tool's picked files and option values into a sidecar job.
 *
 * Every field assembled here maps to a documented parameter in
 * sidecar/PROTOCOL.md. Kept out of the view layer so the workspace component
 * stays about layout and state, and this stays about the contract.
 */
import {
  JobError,
  runJob,
  type OpName,
  type Progress,
} from "./jobs";
import { resolveOutputDir } from "./settings";
import { stripExt } from "./utils";
import type { OptionValues, Tool } from "./tools";
import type { SignElementParams } from "./jobs";
import type { PickedFile } from "@/components/FileDropZone";
import type { PdfPageItem } from "@/components/PageThumbnailGrid";
import type { CompressionSummary } from "@/components/ResultCard";
import type { SignElement } from "./signTypes";
import { isImageSignElement } from "./signTypes";

export interface JobResult {
  outputs: { path: string; bytes: number }[];
  summary?: string;
  /** Present for compress, so the result view can show before -> after. */
  compression?: CompressionSummary;
}

// ---------------------------------------------------------------------------
// Params assembly. Every value here maps to a field in sidecar/PROTOCOL.md.
// ---------------------------------------------------------------------------

/**
 * Where a tool writes its results: the folder the input came from.
 *
 * Guarded deliberately. A relative path here once fell back to "." and the
 * engine resolved that against its own working directory, so converted images
 * landed inside the app folder and looked like they had never been created.
 * Failing loudly beats scattering a user's files somewhere they will not think
 * to look.
 */
export function outputDirFor(inputPath: string): string {
  // A destination chosen in Settings or the status bar wins; otherwise results
  // land beside the input, which is the sane default for a one-off job.
  const dir = resolveOutputDir(inputPath) ?? "";
  const absolute = /^[a-zA-Z]:[\/]/.test(dir) || dir.startsWith("\\\\");
  if (!dir || !absolute) {
    throw new JobError(
      "FILE_NOT_FOUND",
      "That file's location on disk is unknown, so there is nowhere to save the result. Add it again by dragging it in or using Select files.",
    );
  }
  return dir;
}

export async function execute(
  tool: Tool,
  files: PickedFile[],
  v: OptionValues,
  pages: PdfPageItem[],
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
  signElements: SignElement[] = [],
): Promise<JobResult> {
  const first = files[0];
  const dir = outputDirFor(first.path);
  const base = stripExt(first.name);
  const join = (name: string) => `${dir}\\${name}`;
  const opts = { onProgress, signal };
  const str = (k: string, fallback = "") => String(v[k] ?? fallback);
  const num = (k: string, fallback = 0) => Number(v[k] ?? fallback);

  const op: OpName = tool.op;

  switch (op) {
    case "pdf.merge": {
      const out = join(`${str("outputName", "merged") || "merged"}.pdf`);
      const r = await runJob(
        "pdf.merge",
        { inputs: files.map((f) => ({ path: f.path })), output: out },
        opts,
      );
      return {
        outputs: [{ path: r.output, bytes: r.bytes }],
        summary: `${files.length} PDFs joined into ${r.pages} pages.`,
      };
    }

    case "pdf.split": {
      const mode = str("mode", "ranges") as "ranges" | "every" | "extract" | "delete";
      const r = await runJob(
        "pdf.split",
        {
          input: first.path,
          mode,
          ranges: mode === "ranges" ? str("ranges") : undefined,
          every: mode === "every" ? num("every", 1) : undefined,
          pages: mode === "extract" || mode === "delete" ? str("pages") : undefined,
          output_dir: dir,
          base_name: base,
        },
        opts,
      );
      return { outputs: r.outputs, summary: `${r.count} files written.` };
    }

    case "pdf.organize": {
      // The canvas is the source of truth. If it never loaded (an unreadable
      // preview, say) fall back to the document's own order so the tool still
      // runs rather than refusing.
      let order: number[];
      let rotations: Record<string, number> = {};
      if (pages.length > 0) {
        order = pages.map((p) => p.pageNumber - 1);
        for (const p of pages) {
          if (p.rotation % 360 !== 0) rotations[String(p.pageNumber - 1)] = p.rotation % 360;
        }
      } else {
        const info = await runJob("pdf.info", { input: first.path });
        order = Array.from({ length: info.pages }, (_, i) => i);
      }
      const r = await runJob(
        "pdf.organize",
        {
          input: first.path,
          output: join(`${str("outputName", `${base}-organized`) || `${base}-organized`}.pdf`),
          order,
          rotations,
        },
        opts,
      );
      return {
        outputs: [{ path: r.output, bytes: r.bytes }],
        summary: `${r.pages} pages saved.`,
      };
    }

    case "pdf.compress": {
      const r = await runJob(
        "pdf.compress",
        {
          input: first.path,
          output: join(`${base}-compressed.pdf`),
          level: str("level", "balanced") as "lossless" | "balanced" | "strong",
        },
        opts,
      );
      return {
        outputs: [{ path: r.output, bytes: r.bytes }],
        compression: {
          originalBytes: r.original_bytes,
          bytes: r.bytes,
          engine: r.engine,
        },
      };
    }

    case "pdf.sign": {
      if (signElements.length === 0) {
        throw new JobError("BAD_PARAMS", "Add at least one signature, text, date or initials before exporting.");
      }
      const elements: SignElementParams[] = signElements.map((el) => ({
        page: el.pageIndex,
        kind: el.kind,
        x_pct: el.xPct,
        y_pct: el.yPct,
        w_pct: el.wPct,
        h_pct: el.hPct,
        ...(isImageSignElement(el)
          ? { image_b64: dataUrlToBase64(el.imageDataUrl) }
          : { text: el.text, font_size: el.fontSize, color: el.color }),
      }));
      const r = await runJob(
        "pdf.sign",
        { input: first.path, output: join(`${base}-signed.pdf`), elements },
        opts,
      );
      return {
        outputs: [{ path: r.output, bytes: r.bytes }],
        summary: `${r.elements} element${r.elements === 1 ? "" : "s"} added across ${r.pages} page${r.pages === 1 ? "" : "s"}.`,
      };
    }

    case "pdf.to_img": {
      const pages = str("pages").trim();
      const r = await runJob(
        "pdf.to_img",
        {
          input: first.path,
          output_dir: dir,
          format: str("format", "png") as "png" | "jpg",
          dpi: num("dpi", 150),
          pages: pages || undefined,
          base_name: base,
        },
        opts,
      );
      return { outputs: r.outputs, summary: `${r.count} images written.` };
    }

    case "img.to_pdf": {
      const out = join(`${str("outputName", "images") || "images"}.pdf`);
      const r = await runJob(
        "img.to_pdf",
        {
          inputs: files.map((f) => f.path),
          output: out,
          page_size: str("page_size", "fit") as "fit" | "a4" | "letter",
          orientation: str("orientation", "auto") as "auto" | "portrait" | "landscape",
          margin_mm: num("margin_mm", 0),
        },
        opts,
      );
      return {
        outputs: [{ path: r.output, bytes: r.bytes }],
        summary: `${r.pages} page PDF created.`,
      };
    }

    case "img.convert": {
      const mode = str("resizeMode", "none") as "none" | "max" | "percent";
      const r = await runJob(
        "img.convert",
        {
          inputs: files.map((f) => f.path),
          output_dir: dir,
          format: str("format", "jpg") as "jpg" | "png" | "webp",
          quality: num("quality", 85),
          resize: {
            mode,
            max_px: mode === "max" ? num("max_px", 2000) : undefined,
            percent: mode === "percent" ? num("percent", 100) : undefined,
          },
          strip_metadata: Boolean(v.strip_metadata),
        },
        opts,
      );
      return { outputs: r.outputs, summary: `${r.count} images converted.` };
    }

    default:
      throw new JobError("BAD_PARAMS", `No runner wired for ${op}`);
  }
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
