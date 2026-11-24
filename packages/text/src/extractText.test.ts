import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { ExtractTextError, extractText as extract, type OpenPdf, type PdfTextItem } from "./extractText";

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

/** Stands in for an app's pdf.js: each page is a list of text runs. */
function fakePdf(pages: PdfTextItem[][], fail?: Error): OpenPdf & { closed: number } {
  const open = Object.assign(
    async () => {
      if (fail) throw fail;
      return {
        numPages: pages.length,
        pageText: async (n: number) => pages[n - 1],
        close: async () => {
          open.closed++;
        },
      };
    },
    { closed: 0 },
  );
  return open;
}

const noPdf: OpenPdf = async () => {
  throw new Error("not a PDF test");
};
const extractText = (f: File) => extract(f, { openPdf: noPdf });

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

  it("joins PDF text: runs on a line, a line break at each end of line, a blank line between pages", async () => {
    const openPdf = fakePdf([
      [
        { str: "First ", hasEOL: false },
        { str: "line  ", hasEOL: true },
        { str: "Second line", hasEOL: true },
      ],
      [],
      [{ str: "Page two", hasEOL: false }],
    ]);
    expect(await extract(file("doc.pdf", "%PDF"), { openPdf })).toBe("First line\nSecond line\n\nPage two");
    expect(openPdf.closed).toBe(1);
  });

  it("returns an empty string for a PDF with no text", async () => {
    expect(await extract(file("scan.pdf", "%PDF"), { openPdf: fakePdf([[], []]) })).toBe("");
  });

  it("says so when a PDF is password protected, and calls other failures unreadable", async () => {
    const locked = Object.assign(new Error("No password given"), { name: "PasswordException" });
    const err = await extract(file("locked.pdf", "%PDF"), { openPdf: fakePdf([], locked) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractTextError);
    expect(err).toMatchObject({ code: "password", message: expect.stringContaining("password protected") });
    await expect(extract(file("bad.pdf", "%PDF"), { openPdf: fakePdf([], new Error("Invalid PDF")) })).rejects.toMatchObject({ code: "unreadable" });
  });

  it("rejects unsupported file types", async () => {
    const err = await extractText(file("photo.png", "x", "image/png")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractTextError);
    expect(err).toMatchObject({ code: "unsupported", message: expect.stringContaining("isn't supported") });
  });
});
