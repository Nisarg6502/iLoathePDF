import { describe, it, expect } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { inflateSync } from "node:zlib";
import { redactEngine, boxRectPt } from "./redact";
import { makeTestPdf } from "./testHelpers";
import type { RedactBox } from "@/tools/redact/types";

async function toFile(bytes: Uint8Array, name = "in.pdf") {
  return new File([bytes as BlobPart], name, { type: "application/pdf" });
}

function box(pageIndex: number, overrides: Partial<RedactBox> = {}): RedactBox {
  return { id: "b1", pageIndex, xPct: 0.05, yPct: 0.05, wPct: 0.9, hPct: 0.9, ...overrides };
}

async function pageText(bytes: ArrayBuffer, pageNumber: number): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    return content.items.map((item) => ("str" in item ? item.str : "")).join("");
  } finally {
    await loadingTask.destroy();
  }
}

// --- Byte/stream-level marker scan -----------------------------------
//
// pdf.js's getTextContent() (used by pageText above) only walks the LIVE
// page tree, so it's blind to an orphaned-but-still-serialized PDFPageLeaf
// -- exactly the bug this regression test guards against (pdf-lib has no
// object garbage collection: `removePage` only unlinks a page, it doesn't
// stop `doc.save()` from writing the orphaned object out). This scanner
// instead inspects the raw saved bytes directly: it walks every
// `stream ... endstream` block, zlib-inflates it, and searches the
// decompressed content for the marker text -- as either a literal PDF
// string or a hex string (`<...>`), since pdf-lib encodes drawn text as hex
// strings, not literal ones.
function textContainsMarker(text: string, marker: string): boolean {
  if (text.includes(marker)) return true;
  const hexStringRe = /<([0-9A-Fa-f\s]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = hexStringRe.exec(text))) {
    const hex = m[1].replace(/\s+/g, "");
    if (hex.length % 2 !== 0) continue;
    let decoded = "";
    for (let i = 0; i < hex.length; i += 2) {
      decoded += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    if (decoded.includes(marker)) return true;
  }
  return false;
}

function bytesContainMarkerAtStreamLevel(bytes: ArrayBuffer, marker: string): boolean {
  const buf = Buffer.from(bytes);
  const raw = buf.toString("latin1");
  if (textContainsMarker(raw, marker)) return true;

  const streamRe = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end === -1) continue;
    let streamEnd = end;
    if (raw[streamEnd - 1] === "\n") streamEnd--;
    if (raw[streamEnd - 1] === "\r") streamEnd--;
    const chunk = buf.subarray(start, streamEnd);
    try {
      const inflated = inflateSync(chunk);
      if (textContainsMarker(inflated.toString("latin1"), marker)) return true;
    } catch {
      // Not flate-compressed (or not valid deflate) -- skip.
    }
    streamRe.lastIndex = end + "endstream".length;
  }
  return false;
}

async function makeRotatedTestPdf(rotationDegrees: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 300]);
  page.drawText("Page 1", { x: 20, y: 260, size: 18 });
  page.setRotation(degrees(rotationDegrees));
  return doc.save();
}

describe("redactEngine", () => {
  it("visual: preserves page count and leaves the original text extractable underneath the box", async () => {
    const file = await toFile(await makeTestPdf(1));
    const result = await redactEngine({ files: [file], options: { mode: "visual", boxes: [box(0)] } });

    expect(result.files).toHaveLength(1);
    expect(result.isPreview).toBe(false);
    const outBytes = await result.files[0].blob.arrayBuffer();
    const out = await PDFDocument.load(outBytes);
    expect(out.getPageCount()).toBe(1);
    expect(await pageText(outBytes, 1)).toContain("Page 1");
  });

  it("true: removes the original text from a page that received a box", async () => {
    const file = await toFile(await makeTestPdf(1));
    const result = await redactEngine({ files: [file], options: { mode: "true", boxes: [box(0)] } });
    const outBytes = await result.files[0].blob.arrayBuffer();
    expect(await pageText(outBytes, 1)).not.toContain("Page 1");
  });

  it("true: leaves a page with no box exactly as searchable as before", async () => {
    const file = await toFile(await makeTestPdf(3));
    const result = await redactEngine({ files: [file], options: { mode: "true", boxes: [box(0)] } });
    const outBytes = await result.files[0].blob.arrayBuffer();
    const out = await PDFDocument.load(outBytes);
    expect(out.getPageCount()).toBe(3);
    expect(await pageText(outBytes, 3)).toContain("Page 3");
  });

  it("rejects when no boxes are given", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      redactEngine({ files: [file], options: { mode: "visual", boxes: [] } }),
    ).rejects.toThrow(/at least one box/);
  });

  it("rejects a box targeting a page that doesn't exist", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      redactEngine({ files: [file], options: { mode: "visual", boxes: [box(5)] } }),
    ).rejects.toThrow(/only has 1 pages/);
  });

  it("summary reports box and page counts for both modes", async () => {
    const file = await toFile(await makeTestPdf(2));
    const result = await redactEngine({
      files: [file],
      options: { mode: "true", boxes: [box(0), box(0, { id: "b2", yPct: 0.02 })] },
    });
    expect(result.summary).toMatch(/2 boxes redacted across 1 page/);
    expect(result.summary).toMatch(/true redact/);
  });

  // --- Critical Finding 1 regression: byte-level content leak ---------
  //
  // The old implementation did `doc.removePage(pageIndex)` followed by
  // `doc.insertPage(pageIndex, ...)` on the SAME PDFDocument. pdf-lib has no
  // object garbage collection, so the orphaned PDFPageLeaf -- and its
  // original, un-redacted content stream -- stayed resident in the
  // PDFContext and got written out by `doc.save()` anyway. The existing
  // "true: removes the original text..." test above does NOT catch this
  // because pdf.js's getTextContent() only walks the live page tree; it's
  // blind to an orphaned-but-still-serialized object. This test inspects
  // the raw saved bytes directly (inflating each content stream) instead.
  it("true: the original page's content is completely absent from the saved bytes, not just from the live page tree", async () => {
    const file = await toFile(await makeTestPdf(1));
    const result = await redactEngine({ files: [file], options: { mode: "true", boxes: [box(0)] } });
    const outBytes = await result.files[0].blob.arrayBuffer();

    expect(bytesContainMarkerAtStreamLevel(outBytes, "Page 1")).toBe(false);
  });

  it("true: an untouched page's content IS still present in the saved bytes (sanity check for the scanner above)", async () => {
    const file = await toFile(await makeTestPdf(2));
    const result = await redactEngine({ files: [file], options: { mode: "true", boxes: [box(0)] } });
    const outBytes = await result.files[0].blob.arrayBuffer();

    // Page 2 received no box, so it must be copied forward untouched --
    // proves the scanner isn't just failing to find anything at all.
    expect(bytesContainMarkerAtStreamLevel(outBytes, "Page 2")).toBe(true);
  });
});

describe("boxRectPt", () => {
  it("converts a top-left percentage box into bottom-left PDF points", () => {
    // 595x842pt page. y_pct is measured from the TOP; PDF points are
    // measured from the BOTTOM, so the box's y (its bottom edge) is:
    //   boxTop = height - y_pct * height = 842 - 0.2*842 = 673.6
    //   y (bottom edge) = boxTop - h = 673.6 - 84.2 = 589.4
    const result = boxRectPt(
      { id: "b1", pageIndex: 0, xPct: 0.1, yPct: 0.2, wPct: 0.3, hPct: 0.1 },
      595,
      842,
    );
    expect(result.x).toBeCloseTo(59.5);
    expect(result.w).toBeCloseTo(178.5);
    expect(result.h).toBeCloseTo(84.2);
    expect(result.y).toBeCloseTo(589.4);
  });

  it("a box flush with the page top touches the page's top edge", () => {
    const result = boxRectPt({ id: "b1", pageIndex: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 0.25 }, 200, 300);
    expect(result.x).toBe(0);
    expect(result.w).toBe(200);
    expect(result.h).toBe(75);
    expect(result.y + result.h).toBeCloseTo(300);
  });
});

describe("redactEngine validation", () => {
  it("rejects an unrecognized mode instead of silently defaulting to visual", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      redactEngine({ files: [file], options: { mode: "shred", boxes: [box(0)] } }),
    ).rejects.toThrow(/mode/i);
  });

  it.each(["xPct", "yPct", "wPct", "hPct"] as const)(
    "rejects a non-numeric %s",
    async (field) => {
      const file = await toFile(await makeTestPdf(1));
      await expect(
        redactEngine({
          files: [file],
          options: { mode: "visual", boxes: [box(0, { [field]: "0.5" as unknown as number })] },
        }),
      ).rejects.toThrow(new RegExp(field));
    },
  );

  it("rejects a boolean disguised as a number", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      redactEngine({
        files: [file],
        options: { mode: "visual", boxes: [box(0, { xPct: true as unknown as number })] },
      }),
    ).rejects.toThrow(/xPct/);
  });

  it.each([-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an out-of-range or non-finite percentage (%s)",
    async (value) => {
      const file = await toFile(await makeTestPdf(1));
      await expect(
        redactEngine({
          files: [file],
          options: { mode: "visual", boxes: [box(0, { xPct: value })] },
        }),
      ).rejects.toThrow(/xPct/);
    },
  );
});

describe("redactEngine rotation/crop guard (true mode)", () => {
  it("rejects a rotated page in true mode", async () => {
    const file = await toFile(await makeRotatedTestPdf(90));
    await expect(
      redactEngine({ files: [file], options: { mode: "true", boxes: [box(0)] } }),
    ).rejects.toThrow(/rotated\/cropped/i);
  });

  it("still allows visual mode on the same rotated page (no regression)", async () => {
    const file = await toFile(await makeRotatedTestPdf(90));
    const result = await redactEngine({ files: [file], options: { mode: "visual", boxes: [box(0)] } });
    expect(result.files).toHaveLength(1);
  });
});
