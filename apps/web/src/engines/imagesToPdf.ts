import { PDFDocument, type PDFImage } from "pdf-lib";
import type { Engine } from "./types";
import { renderRotatedCropped, isNoopEdit, DEFAULT_IMAGE_EDIT, type ImageEdit, type ImageEdits } from "@/tools/imageEdit";
import { outputFileName } from "@/lib/outputName";
import { readJpegOrientation } from "@/lib/jpegOrientation";

// Same page sizes the desktop engine uses, in points.
const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const;

const MM_TO_PT = 72 / 25.4;
// "Fit to image" pages are the image's pixel size at 96 dpi, which is what the
// desktop engine's img2pdf does when an image carries no DPI metadata.
const PX_TO_PT = 0.75;

type PageSize = "fit" | keyof typeof PAGE_SIZES;
type Orientation = "auto" | "portrait" | "landscape";

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))),
      type,
      type === "image/jpeg" ? 0.92 : undefined,
    );
  });
}

async function embedImage(doc: PDFDocument, file: File, edit: ImageEdit | undefined): Promise<PDFImage> {
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
  const isJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);

  // Fast path: embed the original bytes untouched. Only valid for a JPEG/PNG
  // with no edit, and for a JPEG whose EXIF doesn't ask to be rotated.
  if (isNoopEdit(edit)) {
    try {
      if (isPng) return await doc.embedPng(await file.arrayBuffer());
      if (isJpeg) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (readJpegOrientation(bytes) === 1) return await doc.embedJpg(bytes);
      }
    } catch {
      // The extension lied (a WebP saved as .jpg, say) or pdf-lib can't take
      // this particular PNG. The browser's decoder usually can, so fall through.
    }
  }

  // Everything else goes through the browser's decoder: edited images, EXIF-
  // rotated photos, and formats pdf-lib can't embed (webp, gif, bmp). The
  // decoder applies EXIF orientation itself; ask for it explicitly rather
  // than relying on the browser default.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = renderRotatedCropped(bitmap, edit ?? DEFAULT_IMAGE_EDIT);
  bitmap.close();

  // JPEG stays JPEG (no alpha to lose, much smaller); anything else keeps alpha as PNG.
  if (isJpeg) return doc.embedJpg(await (await canvasToBlob(canvas, "image/jpeg")).arrayBuffer());
  return doc.embedPng(await (await canvasToBlob(canvas, "image/png")).arrayBuffer());
}

function pageFor(
  imageW: number,
  imageH: number,
  pageSize: PageSize,
  orientation: Orientation,
): [number, number] {
  if (pageSize === "fit") return [imageW * PX_TO_PT, imageH * PX_TO_PT];

  const [w, h] = PAGE_SIZES[pageSize];
  const landscape = orientation === "auto" ? imageW > imageH : orientation === "landscape";
  return landscape ? [h, w] : [w, h];
}

export const imagesToPdfEngine: Engine = async ({ files, options }) => {
  if (files.length === 0) throw new Error("Add at least one image.");

  const pageSize = oneOf<PageSize>(options.page_size, ["fit", "a4", "letter"], "fit");
  const orientation = oneOf<Orientation>(options.orientation, ["auto", "portrait", "landscape"], "auto");
  const marginMm = Number(options.margin_mm ?? 0);
  if (!Number.isFinite(marginMm)) throw new Error("Margin must be a number.");
  if (marginMm < 0) throw new Error("Margin cannot be negative.");
  // A fit page is the image itself; a margin only means something on a fixed sheet.
  const margin = pageSize === "fit" ? 0 : marginMm * MM_TO_PT;

  const edits = (options.edits as ImageEdits | undefined) ?? {};
  const doc = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    let image: PDFImage;
    try {
      image = await embedImage(doc, files[i], edits[i]);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      throw new Error(`Couldn't read ${files[i].name}: ${reason}`);
    }

    const [pageW, pageH] = pageFor(image.width, image.height, pageSize, orientation);
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    if (maxW <= 0 || maxH <= 0) throw new Error("Margin is too large for this page size.");

    const page = doc.addPage([pageW, pageH]);
    // Fit the image inside the margins, scaling small images up like the
    // desktop engine does so a low-res scan still fills its page.
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;

    page.drawImage(image, {
      x: (pageW - w) / 2,
      y: (pageH - h) / 2,
      width: w,
      height: h,
    });
  }

  const outBytes = await doc.save();
  return {
    files: [
      {
        name: outputFileName(options.outputName, "images"),
        blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }),
      },
    ],
    summary: `${files.length} images → 1 PDF, ${files.length} pages`,
    isPreview: false,
  };
};
