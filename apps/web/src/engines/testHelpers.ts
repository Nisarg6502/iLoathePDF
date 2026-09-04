import { PDFDocument, rgb } from "pdf-lib";

export async function makeTestPdf(
  pageCount: number,
  opts: { pageSize?: [number, number] } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const [w, h] = opts.pageSize ?? [200, 300];
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([w, h]);
    page.drawText(`Page ${i + 1}`, { x: 20, y: h - 40, size: 18, color: rgb(0, 0, 0) });
  }
  return doc.save();
}

// A minimal valid 1x1 PNG, red pixel — enough for engines that only need a
// decodable image, not a realistic photo.
export function makeTestPng(): Uint8Array {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
