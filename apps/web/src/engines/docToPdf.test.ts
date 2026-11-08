import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { zipSync, strToU8 } from "fflate";
import { csvToPdfEngine, htmlToPdfEngine, txtToPdfEngine, uniqueName } from "./docToPdf";
import { zipToPdfEngine } from "./zipToPdf";
import { makeTestPdf, makeTestPng } from "./testHelpers";
import { detectDelimiter, parseCsv } from "@/lib/docParse";

const textFile = (name: string, content: string | Uint8Array) => new File([content as BlobPart], name);

async function pages(blob: Blob): Promise<string[]> {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const out: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      out.push(content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
    }
    return out;
  } finally {
    await task.destroy();
  }
}

const allText = async (blob: Blob) => (await pages(blob)).join("\n");

describe("txtToPdfEngine", () => {
  it("makes one PDF per file, named after it, with the text", async () => {
    const result = await txtToPdfEngine({
      files: [textFile("a.txt", "Hello world\n\nSecond paragraph"), textFile("b.txt", "beta")],
      options: {},
    });
    expect(result.files.map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);
    const text = await allText(result.files[0].blob);
    expect(text).toContain("Hello world");
    expect(text).toContain("Second paragraph");
    expect(await allText(result.files[1].blob)).toContain("beta");
    expect(result.summary).toBe("2 PDFs, 2 pages");
  });

  it("flows long input onto more pages", async () => {
    const body = Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n");
    const result = await txtToPdfEngine({ files: [textFile("long.txt", body)], options: {} });
    const p = await pages(result.files[0].blob);
    expect(p.length).toBeGreaterThan(1);
    expect(p.join(" ")).toContain("line 299");
  });

  it("wraps a very long word instead of running off the page", async () => {
    const result = await txtToPdfEngine({ files: [textFile("w.txt", "x".repeat(500))], options: {} });
    const doc = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(doc.getPageCount()).toBe(1);
    expect((await allText(result.files[0].blob)).replace(/\s/g, "")).toBe("x".repeat(500));
  });

  it("decodes Windows-1252 files and counts characters it cannot draw", async () => {
    const cp1252 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in Windows-1252
    const ok = await txtToPdfEngine({ files: [textFile("c.txt", cp1252)], options: {} });
    expect(await allText(ok.files[0].blob)).toContain("café");
    expect(ok.summary).not.toContain("?");

    const hindi = await txtToPdfEngine({ files: [textFile("h.txt", "ok नमस्ते")], options: {} });
    expect(hindi.summary).toContain("6 characters the PDF fonts can't draw"); // six Devanagari code points
  });

  it("an empty file still makes a one-page PDF", async () => {
    const result = await txtToPdfEngine({ files: [textFile("e.txt", "")], options: {} });
    expect((await PDFDocument.load(await result.files[0].blob.arrayBuffer())).getPageCount()).toBe(1);
  });

  it("de-duplicates output names and rejects bad options", async () => {
    const result = await txtToPdfEngine({ files: [textFile("a.txt", "1"), textFile("a.txt", "2")], options: {} });
    expect(result.files.map((f) => f.name)).toEqual(["a.pdf", "a (2).pdf"]);
    expect(uniqueName("x.pdf", new Set(["x.pdf", "x (2).pdf"]))).toBe("x (3).pdf");
    await expect(txtToPdfEngine({ files: [textFile("a.txt", "1")], options: { font_size: 2 } })).rejects.toThrow(/text size/);
    await expect(txtToPdfEngine({ files: [], options: {} })).rejects.toThrow(/Add a file/);
  });
});

describe("csv parsing", () => {
  it("handles quotes, embedded commas, escaped quotes and ragged rows", () => {
    expect(parseCsv('a,b,c\n"x, y","say ""hi""",3\n1\n')).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "3"],
      ["1", "", ""],
    ]);
  });
  it("detects the delimiter", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter("a|b\n1|2")).toBe("|");
    expect(detectDelimiter("just one column")).toBe(",");
  });
  it("skips blank rows and a BOM", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("csvToPdfEngine", () => {
  it("lays every cell out as a table", async () => {
    const result = await csvToPdfEngine({ files: [textFile("t.csv", "name,qty\napple,3\npear,10\n")], options: {} });
    const text = await allText(result.files[0].blob);
    for (const word of ["name", "qty", "apple", "pear", "10"]) expect(text).toContain(word);
  });

  it("goes landscape on auto when the table is wide", async () => {
    const header = Array.from({ length: 10 }, (_, i) => `c${i}`).join(",");
    const result = await csvToPdfEngine({ files: [textFile("w.csv", `${header}\n${header}`)], options: {} });
    const page = (await PDFDocument.load(await result.files[0].blob.arrayBuffer())).getPage(0);
    expect(page.getWidth()).toBeGreaterThan(page.getHeight());
  });

  it("repeats the header on every page", async () => {
    const rows = Array.from({ length: 200 }, (_, i) => `row${i},x`).join("\n");
    const result = await csvToPdfEngine({ files: [textFile("r.csv", `HEADCOL,other\n${rows}`)], options: {} });
    const p = await pages(result.files[0].blob);
    expect(p.length).toBeGreaterThan(1);
    expect(p[1]).toContain("HEADCOL");
    expect(p.join(" ")).toContain("row199");
  });

  it("rejects an empty CSV", async () => {
    await expect(csvToPdfEngine({ files: [textFile("e.csv", "  \n")], options: {} })).rejects.toThrow(/empty/);
  });
});

const HTML = `<html><head><title>ignore me</title><style>p{color:red}</style><script>alert('no')</script></head>
<body><h1>Main Title</h1><p>Some <b>bold</b> and <i>italic</i> text.</p>
<ul><li>first item</li><li>second item</li></ul><ol><li>one</li><li>two</li></ol>
<pre>  indented
code</pre><blockquote>quoted words</blockquote><hr>
<table><tr><th>Name</th><th>Score</th></tr><tr><td>Ann</td><td>9</td></tr></table></body></html>`;

describe("htmlToPdfEngine", () => {
  it("renders the content and skips scripts and styles", async () => {
    const result = await htmlToPdfEngine({ files: [textFile("p.html", HTML)], options: {} });
    const text = await allText(result.files[0].blob);
    for (const expected of ["Main Title", "bold", "italic", "first item", "second item", "indented", "quoted words", "Name", "Ann"]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain("alert");
    expect(text).not.toContain("ignore me");
    expect(text).not.toContain("color:red");
  });

  it("gives lists bullets and numbers", async () => {
    const result = await htmlToPdfEngine({ files: [textFile("p.html", HTML)], options: {} });
    const text = await allText(result.files[0].blob);
    expect(text).toContain("• first item");
    expect(text).toMatch(/1\. one/);
    expect(text).toMatch(/2\. two/);
  });

  it("survives broken markup and entities", async () => {
    const broken = "<p>Unclosed <b>bold <i>both</p></i> &amp; entities &lt;ok&gt;<table><tr><td>cell";
    const result = await htmlToPdfEngine({ files: [textFile("b.html", broken)], options: {} });
    const text = await allText(result.files[0].blob);
    expect(text).toContain("Unclosed");
    expect(text).toContain("& entities <ok>");
    expect(text).toContain("cell");
  });

  it("keeps text with no tags at all", async () => {
    const result = await htmlToPdfEngine({ files: [textFile("t.html", "just words")], options: {} });
    expect(await allText(result.files[0].blob)).toContain("just words");
  });
});

describe("zipToPdfEngine", () => {
  const png = makeTestPng();

  async function zipFile(entries: Record<string, Uint8Array>, name = "in.zip") {
    return new File([zipSync(entries) as BlobPart], name);
  }

  it("joins images, PDFs and text in natural filename order", async () => {
    const pdf = await makeTestPdf(2);
    const file = await zipFile({
      "10-text.txt": strToU8("tenth entry"),
      "2-photo.png": png,
      "1-doc.pdf": pdf,
      "notes/readme.md": strToU8("skipped"),
      "__MACOSX/._junk.png": png,
      ".hidden.png": png,
    });
    const result = await zipToPdfEngine({ files: [file], options: {} });
    expect(result.files[0].name).toBe("in.pdf");
    const doc = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(doc.getPageCount()).toBe(4); // 2 pdf pages + 1 image + 1 text page
    const p = await pages(result.files[0].blob);
    expect(p[0]).toContain("Page 1");
    expect(p[3]).toContain("tenth entry");
    expect(result.summary).toContain("3 files joined into 4 pages");
    expect(result.summary).toContain("3 unsupported skipped");
  });

  it("treats archive paths as labels only", async () => {
    const result = await zipToPdfEngine({ files: [await zipFile({ "../../evil.png": png, "ok.png": png })], options: {} });
    expect((await PDFDocument.load(await result.files[0].blob.arrayBuffer())).getPageCount()).toBe(2);
  });

  it("rejects an archive with nothing usable, or one that is not a zip", async () => {
    await expect(zipToPdfEngine({ files: [await zipFile({ "a.docx": strToU8("x") })], options: {} })).rejects.toThrow(/No images, PDFs or text/);
    await expect(zipToPdfEngine({ files: [textFile("fake.zip", "this is not a zip")], options: {} })).rejects.toThrow(/isn't a readable ZIP/);
  });

  it("names the entry that could not be read", async () => {
    const file = await zipFile({ "bad.pdf": strToU8("not a pdf") });
    await expect(zipToPdfEngine({ files: [file], options: {} })).rejects.toThrow(/bad\.pdf couldn't be read/);
  });
});
