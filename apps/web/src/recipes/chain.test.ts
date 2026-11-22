import { describe, expect, it } from "vitest";
import { analyzeChain, allowedNext, applyFix, canInsert, stepNeeds, sanitizeOptions, type RecipeStep } from "./chain";
import { RECIPES } from "./registry";
import { getTool } from "@/tools/registry";

const label = (slug: string) => getTool(slug)?.name ?? slug;
const defaultsOf = (slug: string) => getTool(slug)?.defaultOptions ?? {};
const steps = (...tools: string[]): RecipeStep[] => tools.map((tool) => ({ tool }));
const analyze = (s: RecipeStep[]) => analyzeChain(s, label, defaultsOf);
const errorsAt = (s: RecipeStep[], i: number) => analyze(s).steps[i].issues.filter((x) => x.level === "error").map((x) => x.message);

describe("built-in recipes", () => {
  it("are all valid chains of tools that exist", () => {
    for (const r of RECIPES.filter((x) => x.status === "live")) {
      for (const s of r.steps) expect(getTool(s.tool), `${r.slug}: ${s.tool}`).toBeDefined();
      const a = analyze(r.steps);
      expect(a.errors, `${r.slug}: ${a.steps.flatMap((x) => x.issues.map((i) => i.message)).join("; ")}`).toBe(0);
      expect(a.warnings, r.slug).toBe(0);
    }
  });

  it("never use a tool that needs hand placement", () => {
    for (const r of RECIPES) {
      for (const s of r.steps) expect(["sign", "redact", "organize", "reader"]).not.toContain(s.tool);
    }
  });

  it("have unique slugs and a category", () => {
    expect(new Set(RECIPES.map((r) => r.slug)).size).toBe(RECIPES.length);
    for (const r of RECIPES) expect(r.category, r.slug).toBeDefined();
  });
});

describe("analyzeChain", () => {
  it("flags a kind mismatch and offers the bridging tool as a fix", () => {
    const chain = steps("pdf-to-images", "compress");
    const issue = analyze(chain).steps[1].issues[0];
    expect(issue.level).toBe("error");
    expect(issue.message).toMatch(/hands over images, but Compress PDF needs a PDF/);
    expect(issue.fix).toMatchObject({ type: "insert", tool: "images-to-pdf" });
    expect(analyze(applyFix(chain, issue.fix!)).errors).toBe(0);
  });

  it("allows Merge mid-chain only when more than one PDF can reach it", () => {
    expect(errorsAt(steps("images-to-pdf", "merge"), 1)[0]).toMatch(/Only one PDF reaches Merge/);
    expect(errorsAt(steps("txt-to-pdf", "merge"), 1)).toEqual([]);
    expect(errorsAt(steps("compress", "merge"), 1)).toEqual([]);
  });

  it("requires locking last and unlocking first", () => {
    const lock: RecipeStep = { tool: "protect", options: { mode: "protect" } };
    const unlock: RecipeStep = { tool: "protect", options: { mode: "unlock" } };
    expect(errorsAt([lock, { tool: "compress" }], 0)[0]).toMatch(/Locking has to be the last step/);
    expect(errorsAt([{ tool: "compress" }, unlock], 1)[0]).toMatch(/Unlock has to be the first step/);
    expect(analyze([unlock, { tool: "compress" }, lock]).errors).toBe(0);
  });

  it("refuses OCR once the PDF has text, and suggests moving it earlier", () => {
    const chain: RecipeStep[] = [
      { tool: "watermark", options: { mode: "page_numbers" } },
      { tool: "ocr" },
    ];
    const issue = analyze(chain).steps[1].issues[0];
    expect(issue.message).toMatch(/already has text/);
    expect(issue.fix).toMatchObject({ type: "move", from: 1, to: 0 });
    expect(analyze(applyFix(chain, issue.fix!)).errors).toBe(0);
    // Compress turns the pages back into pictures, so OCR works again after it.
    expect(analyze([...chain.slice(0, 1), { tool: "compress" }, { tool: "ocr" }]).errors).toBe(0);
    expect(errorsAt(steps("ocr", "ocr"), 1)[0]).toMatch(/already has text/);
  });

  it("warns when a later step wipes OCR's text layer", () => {
    const a = analyze(steps("images-to-pdf", "ocr", "compress"));
    const w = a.steps[2].issues.find((x) => x.level === "warning");
    expect(w?.message).toMatch(/wipes out the text layer OCR added/);
    expect(w?.fix).toMatchObject({ type: "move", from: 1, to: 2 });
  });

  it("warns about repeats and pointless flattening", () => {
    expect(analyze(steps("compress", "compress")).steps[1].issues[0].message).toMatch(/Compressing twice/);
    expect(analyze(steps("compress", "flatten")).steps[1].issues[0].message).toMatch(/Nothing is left to flatten/);
  });

  it("tracks how many files flow out", () => {
    expect(analyze(steps("merge", "compress")).output).toEqual({ kind: "pdf", count: "one" });
    expect(analyze(steps("compress")).output).toEqual({ kind: "pdf", count: "batch" });
    expect(analyze(steps("pdf-to-images")).output).toEqual({ kind: "image", count: "many" });
    expect(analyze([{ tool: "split", options: { mode: "extract", ranges: "1" } }]).output?.count).toBe("batch");
  });
});

describe("canInsert / allowedNext", () => {
  it("only offers tools that fit after the last step", () => {
    const next = allowedNext(["pdf-to-images"]);
    expect(next).toContain("images-to-pdf");
    expect(next).toContain("compress-images");
    expect(next).not.toContain("compress");
    expect(next).not.toContain("merge");
  });

  it("refuses to add anything after a lock step", () => {
    const chain: RecipeStep[] = [{ tool: "merge" }, { tool: "protect", options: { mode: "protect" } }];
    const r = canInsert(chain, 2, "compress", label, defaultsOf);
    expect(r.ok).toBe(false);
    expect(canInsert(chain, 1, "compress", label, defaultsOf).ok).toBe(true);
  });

  it("refuses tools that can't be recipe steps, with the reason", () => {
    const r = canInsert([], 0, "sign", label, defaultsOf);
    expect(r).toMatchObject({ ok: false });
  });
});

describe("step settings", () => {
  it("asks for a password at run time and never stores it", () => {
    const lock: RecipeStep = { tool: "protect", options: { mode: "protect", password: "secret", confirmPassword: "secret" } };
    expect(stepNeeds(lock, defaultsOf("protect"), true)).toBeNull();
    expect(stepNeeds({ tool: "protect" }, defaultsOf("protect"), true)).toMatch(/Set a password/);
    expect(sanitizeOptions("protect", lock.options)).toEqual({ mode: "protect" });
  });

  it("needs watermark text and split ranges", () => {
    expect(stepNeeds({ tool: "watermark" }, defaultsOf("watermark"), false)).toMatch(/watermark text/);
    expect(stepNeeds({ tool: "split" }, defaultsOf("split"), false)).toMatch(/page ranges/);
    expect(stepNeeds({ tool: "split", options: { mode: "everyN", n: 1 } }, defaultsOf("split"), false)).toBeNull();
  });
});
