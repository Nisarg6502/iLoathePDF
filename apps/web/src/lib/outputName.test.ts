import { describe, it, expect } from "vitest";
import { outputFileName, sanitizeFileStem } from "./outputName";

const BACKSLASH = String.fromCharCode(92);

describe("sanitizeFileStem", () => {
  it("keeps an ordinary name, spaces included", () => {
    expect(sanitizeFileStem("Trip photos 2026", "images")).toBe("Trip photos 2026");
  });

  it("falls back for blank, whitespace-only and non-string input", () => {
    expect(sanitizeFileStem("", "images")).toBe("images");
    expect(sanitizeFileStem("   ", "images")).toBe("images");
    expect(sanitizeFileStem(undefined, "images")).toBe("images");
    expect(sanitizeFileStem(null, "images")).toBe("images");
  });

  it("strips a typed .pdf, case-insensitively, but only once", () => {
    expect(sanitizeFileStem("report.pdf", "x")).toBe("report");
    expect(sanitizeFileStem("report.PDF", "x")).toBe("report");
    expect(sanitizeFileStem("report.pdf.pdf", "x")).toBe("report.pdf");
  });

  it("removes characters Windows rejects, including path separators", () => {
    expect(sanitizeFileStem(`a<b>c:d"e/f|g?h*i${BACKSLASH}j`, "x")).toBe("abcdefghij");
  });

  it("drops control characters", () => {
    expect(sanitizeFileStem("tab\there\nnow", "x")).toBe("tabherenow");
  });

  it("drops trailing dots and spaces that Windows would silently eat", () => {
    expect(sanitizeFileStem("name. . ", "x")).toBe("name");
    expect(sanitizeFileStem("...", "x")).toBe("x");
  });

  it("refuses Windows reserved device names", () => {
    expect(sanitizeFileStem("CON", "images")).toBe("images");
    expect(sanitizeFileStem("lpt1", "images")).toBe("images");
    expect(sanitizeFileStem("console", "images")).toBe("console");
    expect(sanitizeFileStem("con.backup", "images")).toBe("images");
  });

  it("caps very long names", () => {
    expect(sanitizeFileStem("a".repeat(500), "x")).toHaveLength(120);
  });
});

describe("outputFileName", () => {
  it("appends the extension", () => {
    expect(outputFileName("scan", "images")).toBe("scan.pdf");
    expect(outputFileName("", "images")).toBe("images.pdf");
    expect(outputFileName("pic", "images", "png")).toBe("pic.png");
  });
});
