import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { runRecipe } from "./runRecipe";
import { getRecipe } from "./registry";
import { makeTestPdf } from "@/engines/testHelpers";

describe("runRecipe", () => {
  it("chains merge then compress into one final result", async () => {
    const recipe = getRecipe("merge-compress");
    if (!recipe) throw new Error("Expected merge-compress recipe to exist.");

    const a = await makeTestPdf(2);
    const b = await makeTestPdf(3);
    const files = [
      new File([a as BlobPart], "a.pdf", { type: "application/pdf" }),
      new File([b as BlobPart], "b.pdf", { type: "application/pdf" }),
    ];

    const result = await runRecipe(recipe, files);

    expect(result.files).toHaveLength(1);
    const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBytes);
    expect(outDoc.getPageCount()).toBe(5); // 2 + 3 pages merged, then compressed (page count unchanged)
  });
});
