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

  it("threads every output file from a multi-output step into the next step (flatten-pdf)", async () => {
    const recipe = getRecipe("flatten-pdf");
    if (!recipe) throw new Error("Expected flatten-pdf recipe to exist.");

    const source = await makeTestPdf(4);
    const file = new File([source as BlobPart], "source.pdf", { type: "application/pdf" });

    const result = await runRecipe(recipe, [file]);

    expect(result.files).toHaveLength(1);
    const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBytes);
    // If runRecipe only forwarded the first output of PDF to Images (one
    // page's worth of images) instead of all of them, this would be 1, not 4.
    expect(outDoc.getPageCount()).toBe(4);
  });

  it("reports which step failed, with that step's own error message", async () => {
    const recipe = getRecipe("merge-compress");
    if (!recipe) throw new Error("Expected merge-compress recipe to exist.");

    // A single valid PDF still merges fine (merge accepts 1+ files), so the
    // failure needs to come from step 2. Simplest reliable way: pass a file
    // that Compress's real engine will reject once it receives merge's
    // output -- but merge's output is always a valid PDF, so instead force
    // the failure by using a corrupt "PDF" that merge itself rejects at
    // step 1, proving step-attribution works for the FIRST step at least.
    // (A step-2-specific failure is harder to construct with real inputs
    // alone; step-1 attribution exercises the same code path in
    // runRecipe.ts that would attribute a step-2 failure, since the
    // try/catch wraps every iteration identically.)
    const corrupt = new File([new Uint8Array([1, 2, 3, 4])], "corrupt.pdf", { type: "application/pdf" });

    await expect(runRecipe(recipe, [corrupt])).rejects.toThrow(/Step 1 of 2 \(Merge PDF\) failed:/);
  });
});
