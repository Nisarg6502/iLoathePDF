import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { signEngine } from "./sign";
import { makeTestPdf, makeTestPng } from "./testHelpers";
import type { SignElement } from "@/tools/sign/types";

function toDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(binary)}`;
}

const RED_DOT_PNG = toDataUrl(makeTestPng());

async function toFile(bytes: Uint8Array) {
  return new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });
}

describe("signEngine", () => {
  it("rejects when there are no elements", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(signEngine({ files: [file], options: { elements: [] } })).rejects.toThrow(/at least one/i);
  });

  it("rejects an element that targets a page past the end of the document", async () => {
    const file = await toFile(await makeTestPdf(1));
    const elements: SignElement[] = [
      { id: "1", kind: "text", pageIndex: 5, xPct: 0.1, yPct: 0.1, wPct: 0.2, hPct: 0.05, text: "hi", fontSize: 12, color: "#000000" },
    ];
    await expect(signEngine({ files: [file], options: { elements } })).rejects.toThrow(/page 6/);
  });

  it("embeds a signature image and a text element into the output", async () => {
    const file = await toFile(await makeTestPdf(2));
    const elements: SignElement[] = [
      { id: "1", kind: "signature", pageIndex: 0, xPct: 0.1, yPct: 0.8, wPct: 0.3, hPct: 0.1, imageDataUrl: RED_DOT_PNG },
      { id: "2", kind: "date", pageIndex: 1, xPct: 0.5, yPct: 0.05, wPct: 0.2, hPct: 0.04, text: "09/05/2026", fontSize: 14, color: "#1d4ed8" },
    ];
    const result = await signEngine({ files: [file], options: { elements } });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("in-signed.pdf");
    expect(result.summary).toMatch(/2 elements/);

    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(2);
  });
});
