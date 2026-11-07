import type { PDFDocument, PDFImage } from "pdf-lib";

/**
 * Embeds image bytes of any browser-decodable format.
 *
 * pdf-lib only takes PNG and JPEG, and the format is judged by the bytes, not
 * a data-URL prefix or file extension (a signature uploaded as a JPEG used to
 * throw because everything was assumed to be PNG). Anything else -- webp, gif,
 * bmp -- is redrawn through a canvas to PNG first.
 */
export async function embedImageBytes(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (isPng) return doc.embedPng(bytes);
  if (isJpeg) return doc.embedJpg(bytes);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  } catch {
    throw new Error("That image format isn't supported. Use a PNG, JPG, WebP or GIF.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), "image/png");
  });
  return doc.embedPng(new Uint8Array(await png.arrayBuffer()));
}
