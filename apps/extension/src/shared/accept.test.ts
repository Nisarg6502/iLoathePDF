import { describe, it, expect } from "vitest";
import { allowedOutputs, inputKind, parseAccept, planOutput } from "./accept";

const jpg = { name: "photo.jpg", type: "image/jpeg" };
const png = { name: "scan.png", type: "image/png" };
const webp = { name: "pic.webp", type: "image/webp" };
const pdf = { name: "doc.pdf", type: "application/pdf" };
const docx = { name: "cv.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const heic = { name: "IMG_0001.HEIC", type: "image/heic" };

describe("parseAccept + allowedOutputs", () => {
  it.each([
    ["", [], ["jpeg", "png", "webp", "pdf"]],
    [null, [], ["jpeg", "png", "webp", "pdf"]],
    ["*/*", [], ["jpeg", "png", "webp", "pdf"]],
    ["image/*", [], ["jpeg", "png", "webp"]],
    ["image/jpeg", [], ["jpeg"]],
    ["image/jpg", [], ["jpeg"]],
    [".jpg,.jpeg", [], ["jpeg"]],
    [" .JPG , .PNG ", [], ["jpeg", "png"]],
    ["image/png", [], ["png"]],
    ["application/pdf", [], ["pdf"]],
    [".pdf,image/*", [], ["jpeg", "png", "webp", "pdf"]],
    [".docx", [], []],
    [".gif", [], []],
    // Words near the field narrow a broad accept...
    ["image/*", ["jpeg"], ["jpeg"]],
    ["", ["jpeg"], ["jpeg"]],
    ["", ["pdf"], ["pdf"]],
    ["", ["jpeg", "png"], ["jpeg", "png"]],
    // ...but never widen a strict one, and are ignored when they don't overlap.
    ["image/jpeg", ["png"], ["jpeg"]],
    ["image/jpeg,image/png", ["png"], ["png"]],
    ["", ["doc"], ["jpeg", "png", "webp", "pdf"]],
  ] as const)("accept=%j text=%j", (accept, text, expected) => {
    expect(allowedOutputs(parseAccept(accept), text)).toEqual(expected);
  });

  it("keeps tokens it can't produce for display", () => {
    expect(parseAccept(".docx,.pdf").others).toEqual([".docx"]);
  });
});

describe("inputKind", () => {
  it("classifies by type and by extension", () => {
    expect(inputKind(jpg)).toBe("image");
    expect(inputKind({ name: "x.JPEG", type: "" })).toBe("image");
    expect(inputKind(pdf)).toBe("pdf");
    expect(inputKind({ name: "x.PDF", type: "" })).toBe("pdf");
    expect(inputKind(docx)).toBe("other");
    expect(inputKind(heic)).toBe("other");
    expect(inputKind({ name: "logo.svg", type: "image/svg+xml" })).toBe("other");
  });
});

describe("planOutput", () => {
  const ALL = ["jpeg", "png", "webp", "pdf"] as const;

  it("turns an image into the field's image format", () => {
    expect(planOutput([png], ["jpeg"], false)).toMatchObject({ kind: "images", format: "jpeg" });
    expect(planOutput([jpg], ["png"], false)).toMatchObject({ kind: "images", format: "png" });
  });

  it("keeps an image's own format when allowed, except a PNG that has to shrink", () => {
    expect(planOutput([webp], ALL, false)).toMatchObject({ kind: "images", format: "webp" });
    expect(planOutput([png], ALL, false)).toMatchObject({ kind: "images", format: "png" });
    expect(planOutput([png], ALL, false, { sizeLimited: true })).toMatchObject({ kind: "images", format: "jpeg" });
    expect(planOutput([png], ["png"], false, { sizeLimited: true })).toMatchObject({ kind: "images", format: "png" });
  });

  it("makes a PDF from images when the field only takes PDF", () => {
    expect(planOutput([jpg], ["pdf"], false)).toMatchObject({ kind: "images-to-pdf", format: "pdf" });
    expect(planOutput([jpg, png], ["pdf"], true)).toMatchObject({ kind: "images-to-pdf" });
  });

  it("combines several images into one PDF for a one-file field that takes PDF", () => {
    expect(planOutput([jpg, png], ALL, false)).toMatchObject({ kind: "images-to-pdf", options: ["pdf"] });
    expect(planOutput([jpg, png], ["jpeg"], false)).toEqual({ kind: "error", reason: "one-file-only" });
  });

  it("keeps several images as images for a multiple field", () => {
    expect(planOutput([jpg, png], ["jpeg", "pdf"], true)).toMatchObject({ kind: "images", format: "jpeg", options: ["jpeg", "pdf"] });
  });

  it("shrinks a PDF for a PDF field, or renders it for an image-only field", () => {
    expect(planOutput([pdf], ["pdf"], false)).toMatchObject({ kind: "pdf", format: "pdf" });
    expect(planOutput([pdf], ["jpeg"], false)).toMatchObject({ kind: "pdf-to-images", format: "jpeg", firstPageOnly: true });
    expect(planOutput([pdf], ["jpeg"], true)).toMatchObject({ kind: "pdf-to-images", firstPageOnly: false });
    expect(planOutput([pdf, pdf], ["pdf"], false)).toEqual({ kind: "error", reason: "several-pdfs" });
  });

  it("follows the user's choice when it is one of the options", () => {
    expect(planOutput([jpg], ALL, false, { choice: "pdf" })).toMatchObject({ kind: "images-to-pdf" });
    expect(planOutput([jpg], ["jpeg"], false, { choice: "png" })).toMatchObject({ kind: "images", format: "jpeg" });
    expect(planOutput([pdf], ALL, false, { choice: "png" })).toMatchObject({ kind: "pdf-to-images", format: "png" });
  });

  it("says why it can't help", () => {
    expect(planOutput([jpg], [], false)).toEqual({ kind: "error", reason: "nothing-allowed" });
    expect(planOutput([docx], ALL, false)).toEqual({ kind: "error", reason: "unsupported-input" });
    expect(planOutput([heic], ALL, false)).toEqual({ kind: "error", reason: "unsupported-input" });
    expect(planOutput([jpg, pdf], ALL, true)).toEqual({ kind: "error", reason: "mixed-input" });
  });
});
