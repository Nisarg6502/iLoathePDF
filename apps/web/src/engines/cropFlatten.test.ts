import { describe, it, expect } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, degrees } from "pdf-lib";
import { cropEngine, trimmedBox } from "./crop";
import { flattenEngine } from "./flatten";
import { makeTestPdf } from "./testHelpers";

const pdfFile = (bytes: Uint8Array, name = "in.pdf") => new File([bytes as BlobPart], name, { type: "application/pdf" });
const load = async (blob: Blob) => PDFDocument.load(await blob.arrayBuffer());
const M = { top: 10, right: 20, bottom: 30, left: 0 };

describe("cropEngine", () => {
  it("trims every page by the visual margins", async () => {
    const file = pdfFile(await makeTestPdf(2, { pageSize: [600, 800] }));
    const result = await cropEngine({ files: [file], options: M });
    expect(result.files[0].name).toBe("in-cropped.pdf");
    const doc = await load(result.files[0].blob);
    for (const page of doc.getPages()) {
      const box = page.getCropBox();
      expect([box.x, box.y, box.width, box.height]).toEqual([0, 240, 480, 480]);
      expect(page.getMediaBox()).toEqual(box);
    }
  });

  it("only crops the selected pages", async () => {
    const file = pdfFile(await makeTestPdf(3, { pageSize: [600, 800] }));
    const result = await cropEngine({ files: [file], options: { ...M, pages: "2" } });
    const pages = (await load(result.files[0].blob)).getPages();
    expect(pages[0].getCropBox().height).toBe(800);
    expect(pages[1].getCropBox().height).toBe(480);
    expect(pages[2].getCropBox().height).toBe(800);
    expect(result.summary).toBe("1 of 3 pages cropped");
  });

  it("follows page rotation", () => {
    // Rotated 90: the visual top is the unrotated left edge.
    const box = trimmedBox({ x: 0, y: 0, width: 600, height: 800 }, 90, { top: 10, right: 0, bottom: 0, left: 0 });
    expect(box).toEqual({ x: 60, y: 0, width: 540, height: 800 });
  });

  it("applies margins to a rotated page end to end", async () => {
    const src = await PDFDocument.create();
    const page = src.addPage([600, 800]);
    page.setRotation(degrees(90));
    const file = pdfFile(await src.save());
    const result = await cropEngine({ files: [file], options: { top: 10, right: 0, bottom: 0, left: 0 } });
    const box = (await load(result.files[0].blob)).getPage(0).getCropBox();
    expect([box.x, box.y, box.width, box.height]).toEqual([60, 0, 540, 800]);
  });

  it("rejects margins that are empty, negative or swallow the page", async () => {
    const file = pdfFile(await makeTestPdf(1));
    const zero = { top: 0, right: 0, bottom: 0, left: 0 };
    await expect(cropEngine({ files: [file], options: zero })).rejects.toThrow(/at least one margin/);
    await expect(cropEngine({ files: [file], options: { ...zero, top: -1 } })).rejects.toThrow(/percentage/);
    await expect(cropEngine({ files: [file], options: { ...zero, top: 60, bottom: 40 } })).rejects.toThrow(/whole page/);
  });

  it("rejects a page outside the document", async () => {
    const file = pdfFile(await makeTestPdf(1));
    await expect(cropEngine({ files: [file], options: { ...M, pages: "5" } })).rejects.toThrow(/outside/);
  });
});

describe("flattenEngine", () => {
  it("bakes form fields into the page and removes the form", async () => {
    const src = await PDFDocument.create();
    const page = src.addPage([300, 300]);
    const field = src.getForm().createTextField("name");
    field.setText("Alice");
    field.addToPage(page, { x: 20, y: 200, width: 150, height: 24 });
    const result = await flattenEngine({ files: [pdfFile(await src.save())], options: {} });

    const out = await load(result.files[0].blob);
    expect(out.getForm().getFields()).toHaveLength(0);
    expect(out.catalog.has(PDFName.of("AcroForm"))).toBe(true); // pdf-lib keeps an empty one
    expect(out.getPage(0).node.lookupMaybe(PDFName.of("Annots"), PDFArray)).toBeUndefined();
    expect(result.summary).toBe("1 form field / annotation flattened");
  });

  it("bakes a stamp annotation's appearance into the page content", async () => {
    const src = await PDFDocument.create();
    const page = src.addPage([300, 300]);
    const ctx = src.context;
    const appearance = ctx.flateStream("1 0 0 rg 0 0 50 20 re f", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 50, 20],
    });
    const annot = ctx.obj({
      Type: "Annot",
      Subtype: "Square",
      Rect: [100, 100, 200, 140],
      AP: { N: ctx.register(appearance) },
    });
    page.node.set(PDFName.of("Annots"), ctx.obj([ctx.register(annot)]));

    const result = await flattenEngine({ files: [pdfFile(await src.save())], options: {} });
    const out = await load(result.files[0].blob);
    const outPage = out.getPage(0);
    expect(outPage.node.lookupMaybe(PDFName.of("Annots"), PDFArray)).toBeUndefined();

    const xobjects = outPage.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    expect(xobjects?.keys().length).toBe(1);
    const contents = outPage.node.Contents();
    expect(contents).toBeDefined();
    expect(result.summary).toContain("1 form field / annotation");
  });

  it("leaves link annotations alone and reports nothing to do", async () => {
    const src = await PDFDocument.create();
    const page = src.addPage([300, 300]);
    const ctx = src.context;
    const link = ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [10, 10, 50, 30] });
    page.node.set(PDFName.of("Annots"), ctx.obj([ctx.register(link)]));
    const result = await flattenEngine({ files: [pdfFile(await src.save())], options: {} });
    const out = await load(result.files[0].blob);
    expect(out.getPage(0).node.lookupMaybe(PDFName.of("Annots"), PDFArray)?.size()).toBe(1);
    expect(result.summary).toMatch(/Nothing to flatten/);
  });
});
