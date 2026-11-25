/**
 * "Save image as PDF / JPG / PNG" from the right-click menu: turns one image
 * into the chosen format with the website's own engines. Needs a DOM (canvas),
 * so it runs in the converter page (offscreen.html), never in the background
 * worker or a web page.
 */
import { convertImagesEngine } from "@/engines/convertImages";
import { imagesToPdfEngine } from "@/engines/imagesToPdf";

import { renameFor, type SaveFormat } from "./saveFormats";

export { renameFor, SAVE_FORMATS, type SaveFormat } from "./saveFormats";

const MIME: Record<SaveFormat, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };

export async function convertImage(image: File, format: SaveFormat): Promise<File> {
  const name = renameFor(image.name, format);
  // Already in that format: hand it back untouched rather than re-encoding.
  if (image.type === MIME[format]) return new File([image], name, { type: MIME[format] });
  if (format === "pdf") {
    const result = await imagesToPdfEngine({ files: [image], options: { page_size: "fit", outputName: name.replace(/\.pdf$/, "") } });
    return new File([result.files[0].blob], name, { type: MIME.pdf });
  }
  const result = await convertImagesEngine({ files: [image], options: { to: format, quality: 92 } });
  return new File([result.files[0].blob], name, { type: MIME[format] });
}
