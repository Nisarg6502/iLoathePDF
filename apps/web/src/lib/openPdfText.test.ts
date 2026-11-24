import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ExtractTextError, extractText } from "@iloathepdf/text";
import { openPdfText } from "./openPdfText";

// pdf.js's decryption path uses Math.sumPrecise, which this Node version lacks.
if (typeof (Math as unknown as { sumPrecise?: unknown }).sumPrecise !== "function") {
  (Math as unknown as { sumPrecise: (xs: Iterable<number>) => number }).sumPrecise = (xs) => {
    let sum = 0;
    for (const x of xs) sum += x;
    return sum;
  };
}

const file = (name: string, content: BlobPart) => new File([content], name, { type: "application/pdf" });

async function pdf(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([300, 300]);
    lines.forEach((line, i) => page.drawText(line, { x: 20, y: 260 - i * 24, size: 14, font }));
  }
  return doc.save();
}

describe("reading PDF text with the web app's pdf.js", () => {
  it("keeps lines within a page and puts a blank line between pages", async () => {
    const bytes = await pdf([["First line", "Second line"], ["Page two"]]);
    expect(await extractText(file("doc.pdf", bytes as BlobPart), { openPdf: openPdfText })).toBe("First line\nSecond line\n\nPage two");
  });

  it("returns an empty string for a PDF with no text", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    expect(await extractText(file("scan.pdf", (await doc.save()) as BlobPart), { openPdf: openPdfText })).toBe("");
  });

  it("says so when a PDF is password protected", async () => {
    const bytes = readFileSync(join(__dirname, "..", "engines", "__fixtures__", "pikepdf-aes256.pdf"));
    const err = await extractText(file("locked.pdf", new Uint8Array(bytes) as BlobPart), { openPdf: openPdfText }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractTextError);
    expect(err).toMatchObject({ code: "password" });
  });
});
