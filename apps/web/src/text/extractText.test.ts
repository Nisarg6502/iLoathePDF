import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { strToU8, zipSync } from "fflate";
import { ExtractTextError, extractText } from "./extractText";

// pdf.js's decryption path uses Math.sumPrecise, which this Node version lacks.
if (typeof (Math as unknown as { sumPrecise?: unknown }).sumPrecise !== "function") {
  (Math as unknown as { sumPrecise: (xs: Iterable<number>) => number }).sumPrecise = (xs) => {
    let sum = 0;
    for (const x of xs) sum += x;
    return sum;
  };
}

const file = (name: string, content: BlobPart, type = "") => new File([content], name, { type });

function docx(bodyXml: string): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(xml),
    "word/footnotes.xml": strToU8("<w:footnotes>Footnote words</w:footnotes>"),
  });
}

async function pdf(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([300, 300]);
    lines.forEach((line, i) => page.drawText(line, { x: 20, y: 260 - i * 24, size: 14, font }));
  }
  return doc.save();
}

describe("extractText", () => {
  it("reads UTF-8 text and drops the byte-order mark", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8("Héllo world\nline two")]);
    expect(await extractText(file("notes.txt", bytes as BlobPart))).toBe("Héllo world\nline two");
  });

  it("reads .md and .csv as text, and UTF-16 with a BOM", async () => {
    expect(await extractText(file("README.MD", "# Title"))).toBe("# Title");
    expect(await extractText(file("data.csv", "a,b\n1,2"))).toBe("a,b\n1,2");
    const utf16 = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);
    expect(await extractText(file("u16.txt", utf16))).toBe("Hi");
  });

  it("reads a Word document's body: paragraphs as lines, tabs and breaks kept", async () => {
    const bytes = docx(
      `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Name</w:t><w:tab/><w:t>Value</w:t><w:br/><w:t>Next</w:t></w:r></w:p>` +
        `<w:p><w:del><w:r><w:delText>gone</w:delText></w:r></w:del><w:r><w:t>Kept</w:t></w:r></w:p>`,
    );
    expect(await extractText(file("doc.docx", bytes as BlobPart))).toBe("Hello world\nName\tValue\nNext\nKept");
  });

  it("rejects a broken .docx as unreadable", async () => {
    await expect(extractText(file("bad.docx", "not a zip"))).rejects.toMatchObject({ code: "unreadable" });
  });

  it("extracts PDF text: lines within a page, a blank line between pages", async () => {
    const bytes = await pdf([["First line", "Second line"], ["Page two"]]);
    const text = await extractText(file("doc.pdf", bytes as BlobPart, "application/pdf"));
    expect(text).toBe("First line\nSecond line\n\nPage two");
  });

  it("returns an empty string for a PDF with no text", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    expect(await extractText(file("scan.pdf", (await doc.save()) as BlobPart))).toBe("");
  });

  it("says so when a PDF is password protected", async () => {
    const bytes = readFileSync(join(__dirname, "..", "engines", "__fixtures__", "pikepdf-aes256.pdf"));
    const err = await extractText(file("locked.pdf", new Uint8Array(bytes) as BlobPart)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractTextError);
    expect(err).toMatchObject({ code: "password", message: expect.stringContaining("password protected") });
  });

  it("rejects unsupported file types", async () => {
    const err = await extractText(file("photo.png", "x", "image/png")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractTextError);
    expect(err).toMatchObject({ code: "unsupported", message: expect.stringContaining("isn't supported") });
  });
});
