/**
 * The rules for chaining tools into a recipe.
 *
 * Every tool a recipe may use is described here by what it consumes and
 * produces (a "kind" of file, how many files, and what it does to a PDF's
 * selectable text). `analyzeChain()` walks a chain once with that model and
 * returns, per step, the problems that would make it fail (errors), the ones
 * that would make the result worse than the user expects (warnings), and the
 * settings it still needs. Each problem can carry a one-click fix.
 *
 * The builder, the run page and the home page demo all read from this one
 * place, so a rule shown to the user is the rule that is enforced.
 *
 * Deliberately free of runtime imports so it stays a plain, testable module:
 * the caller passes tool names in through `label`.
 */

/** What flows between steps. */
export type Kind = "pdf" | "image" | "text" | "csv" | "html" | "zip";

/** How many files flow between steps: exactly one, one per input file, or several per input file. */
export type Count = "one" | "batch" | "many";

/** Whether the PDF flowing at this point has selectable text. */
type TextState = "yes" | "no" | "unknown";

export type Options = Record<string, unknown>;

export interface RecipeStep {
  tool: string;
  /** Settings for this step, merged over the tool's own defaultOptions. */
  options?: Options;
}

interface ToolSpec {
  in: Kind;
  out: Kind;
  /** one: every file in, a single file out. same: one out per file in. more: several out per file in. */
  count: (o: Options) => "one" | "same" | "more";
  /** What the step does to selectable text in the PDF. */
  text: (o: Options) => "adds" | "removes" | "keeps" | "unknown";
  /** True when the step turns every page into a picture. */
  rasterizes?: boolean;
  /** Short words for the palette: what this step is for in a chain. */
  blurb: string;
  group: "pdf" | "image" | "convert" | "security";
}

const keeps = () => "keeps" as const;
const same = () => "same" as const;

const watermarkAddsText = (o: Options) => {
  if (o.mode === "page_numbers") return true;
  const spec = (o.mode === "stamp" ? o.stamp : o.watermark) as { content?: string } | undefined;
  return (spec?.content ?? "text") === "text";
};

export const RECIPE_TOOLS: Record<string, ToolSpec> = {
  merge: { in: "pdf", out: "pdf", count: () => "one", text: keeps, blurb: "Join every PDF into one", group: "pdf" },
  split: {
    in: "pdf",
    out: "pdf",
    count: (o) => (o.mode === "extract" || o.mode === "delete" ? "same" : "more"),
    text: keeps,
    blurb: "Cut into parts, keep or drop pages",
    group: "pdf",
  },
  compress: { in: "pdf", out: "pdf", count: same, text: () => "removes", rasterizes: true, blurb: "Shrink file size", group: "pdf" },
  crop: { in: "pdf", out: "pdf", count: same, text: keeps, blurb: "Trim page margins", group: "pdf" },
  watermark: {
    in: "pdf",
    out: "pdf",
    count: same,
    text: (o) => (watermarkAddsText(o) ? "adds" : "keeps"),
    blurb: "Watermark, page numbers or stamp",
    group: "pdf",
  },
  flatten: { in: "pdf", out: "pdf", count: same, text: keeps, blurb: "Bake in form fields and notes", group: "pdf" },
  ocr: { in: "pdf", out: "pdf", count: same, text: () => "adds", blurb: "Make scans searchable", group: "pdf" },
  protect: { in: "pdf", out: "pdf", count: same, text: keeps, blurb: "Add or remove a password", group: "security" },
  "pdf-to-images": { in: "pdf", out: "image", count: () => "more", text: keeps, blurb: "Every page as a picture", group: "convert" },
  "images-to-pdf": { in: "image", out: "pdf", count: () => "one", text: () => "removes", rasterizes: true, blurb: "Pictures into one PDF", group: "convert" },
  scan: { in: "image", out: "pdf", count: () => "one", text: () => "removes", rasterizes: true, blurb: "Clean up photos of paper into a PDF", group: "convert" },
  "convert-images": { in: "image", out: "image", count: same, text: keeps, blurb: "PNG, JPG, WebP or HEIC", group: "image" },
  "compress-images": { in: "image", out: "image", count: same, text: keeps, blurb: "Smaller pictures, resize", group: "image" },
  "txt-to-pdf": { in: "text", out: "pdf", count: same, text: () => "adds", blurb: "Text files into PDFs", group: "convert" },
  "csv-to-pdf": { in: "csv", out: "pdf", count: same, text: () => "adds", blurb: "Tables into PDFs", group: "convert" },
  "html-to-pdf": { in: "html", out: "pdf", count: same, text: () => "adds", blurb: "Web pages into PDFs", group: "convert" },
  "zip-to-pdf": { in: "zip", out: "pdf", count: same, text: () => "unknown", blurb: "Everything in a ZIP into one PDF", group: "convert" },
};

/** Tools that exist but can't be a recipe step, and why. Shown greyed out in the palette. */
export const UNAVAILABLE_TOOLS: Record<string, string> = {
  sign: "Needs you to place a signature on the page by hand.",
  redact: "Needs you to draw boxes over what to hide, page by page.",
  organize: "Needs you to drag pages around by hand.",
  reader: "Only shows a PDF; it doesn't make a new file.",
  "pdf-to-excel": "Desktop app only for now.",
  pdfa: "Desktop app only for now.",
};

export const MAX_STEPS = 10;
export const MIN_STEPS = 1;

export const GROUP_LABEL: Record<ToolSpec["group"], string> = {
  pdf: "Edit PDFs",
  convert: "Convert",
  image: "Images",
  security: "Security",
};

const KIND_LABEL: Record<Kind, string> = {
  pdf: "PDF",
  image: "image",
  text: "text file",
  csv: "CSV",
  html: "HTML page",
  zip: "ZIP",
};

export function kindLabel(kind: Kind, plural = false): string {
  const base = KIND_LABEL[kind];
  return plural ? `${base}s` : base;
}

/** A short label for what flows over a connector, e.g. "PDF", "PDF per file", "images". */
export function flowLabel(kind: Kind, count: Count): string {
  if (count === "one") return `1 ${kindLabel(kind)}`;
  if (count === "batch") return `${kindLabel(kind, true)}`;
  return `${kindLabel(kind, true)} ×N`;
}

export function isRecipeTool(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(RECIPE_TOOLS, slug);
}

export function isLockStep(step: RecipeStep): boolean {
  return step.tool === "protect" && (step.options?.mode ?? "protect") === "protect";
}

export function isUnlockStep(step: RecipeStep): boolean {
  return step.tool === "protect" && step.options?.mode === "unlock";
}

/** Steps that turn one kind into another, used to suggest a fix for a kind mismatch. */
const BRIDGES: Partial<Record<Kind, Partial<Record<Kind, string>>>> = {
  pdf: { image: "pdf-to-images" },
  image: { pdf: "images-to-pdf" },
  text: { pdf: "txt-to-pdf" },
  csv: { pdf: "csv-to-pdf" },
  html: { pdf: "html-to-pdf" },
  zip: { pdf: "zip-to-pdf" },
};

// ---------------------------------------------------------------------------
// Fixes: pure functions over the step list, so the UI can apply them as-is.

export type Fix =
  | { type: "insert"; at: number; tool: string; label: string }
  | { type: "remove"; at: number; label: string }
  | { type: "move"; from: number; to: number; label: string };

export function applyFix(steps: RecipeStep[], fix: Fix): RecipeStep[] {
  const next = [...steps];
  if (fix.type === "insert") next.splice(fix.at, 0, { tool: fix.tool });
  else if (fix.type === "remove") next.splice(fix.at, 1);
  else {
    const [moved] = next.splice(fix.from, 1);
    next.splice(fix.to, 0, moved);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Settings a step needs before it can run.

const MIN_PASSWORD = 4;

/**
 * What this step still needs from the user, or null when it can run as set.
 * `forRun` is false in the builder, where a missing password is expected (it
 * is asked for each time, never saved).
 */
export function stepNeeds(step: RecipeStep, defaults: Options, forRun: boolean): string | null {
  const o = { ...defaults, ...step.options };
  switch (step.tool) {
    case "protect": {
      const pw = String(o.password ?? "");
      if (!forRun) return o.mode === "unlock" ? "Asks for the PDF's password when you run it" : "Asks for a new password when you run it";
      if (pw.length < MIN_PASSWORD) return o.mode === "unlock" ? "Enter the PDF's current password" : `Set a password (at least ${MIN_PASSWORD} characters)`;
      if (o.mode !== "unlock" && pw !== String(o.confirmPassword ?? "")) return "The two passwords don't match";
      return null;
    }
    case "split": {
      if (o.mode === "everyN") return Number(o.n) >= 1 ? null : "Set how many pages go in each file";
      const ranges = String(o.ranges ?? "").trim();
      if (ranges) return null;
      return o.mode === "extract" ? "Enter the pages to keep" : o.mode === "delete" ? "Enter the pages to remove" : "Enter page ranges, like 1-3,4-6";
    }
    case "watermark": {
      if (o.mode === "page_numbers") return null;
      const spec = (o.mode === "stamp" ? o.stamp : o.watermark) as { content?: string; text?: string; imageDataUrl?: string } | undefined;
      if (spec?.content === "image") return spec.imageDataUrl ? null : "Choose an image";
      return String(spec?.text ?? "").trim() ? null : o.mode === "stamp" ? "Type the stamp text" : "Type the watermark text";
    }
    case "crop": {
      const any = ["top", "right", "bottom", "left"].some((s) => Number(o[s] ?? 0) > 0);
      return any ? null : "Set at least one margin above 0%";
    }
    default:
      return null;
  }
}

/** Removes anything that must never be stored, such as passwords. */
export function sanitizeOptions(tool: string, options: Options | undefined): Options | undefined {
  if (!options) return options;
  if (tool !== "protect") return options;
  const { password: _p, confirmPassword: _c, ...rest } = options;
  return rest;
}

// ---------------------------------------------------------------------------
// Analysis

export type Level = "error" | "warning";

export interface Issue {
  level: Level;
  message: string;
  fix?: Fix;
}

export interface StepAnalysis {
  /** What arrives at this step (undefined for the first step: whatever the user drops). */
  inKind?: Kind;
  inCount: Count;
  outKind: Kind;
  outCount: Count;
  issues: Issue[];
  /** A setting this step still needs, or null. */
  needs: string | null;
}

export interface ChainAnalysis {
  steps: StepAnalysis[];
  errors: number;
  warnings: number;
  /** What the chain hands back at the end. */
  output?: { kind: Kind; count: Count };
  /** First step's input kind. */
  input?: Kind;
  /** True when the first step is Merge, which needs at least two files. */
  needsTwoFiles: boolean;
}

function nextCount(prev: Count, rule: "one" | "same" | "more"): Count {
  if (rule === "one") return "one";
  if (rule === "more") return "many";
  return prev;
}

export function analyzeChain(
  steps: RecipeStep[],
  label: (slug: string) => string,
  defaultsOf: (slug: string) => Options = () => ({}),
  forRun = false,
): ChainAnalysis {
  const out: StepAnalysis[] = [];
  let kind: Kind | undefined;
  let count: Count = "batch";
  let text: TextState = "unknown";
  let textSource = -1; // step index that last added text
  let rasterAt = -1; // step index that last turned pages into pictures

  steps.forEach((step, i) => {
    const spec = RECIPE_TOOLS[step.tool];
    const name = label(step.tool);
    const issues: Issue[] = [];
    const o = { ...defaultsOf(step.tool), ...step.options };

    if (!spec) {
      issues.push({
        level: "error",
        message: UNAVAILABLE_TOOLS[step.tool] ? `${name} can't be part of a recipe. ${UNAVAILABLE_TOOLS[step.tool]}` : `${name} can't be part of a recipe.`,
        fix: { type: "remove", at: i, label: "Remove it" },
      });
      out.push({ inKind: kind, inCount: count, outKind: kind ?? "pdf", outCount: count, issues, needs: null });
      return;
    }

    const prevName = i > 0 ? label(steps[i - 1].tool) : "";

    // 1. What arrives must be what this step reads.
    if (kind && kind !== spec.in) {
      const bridge = BRIDGES[kind]?.[spec.in];
      issues.push({
        level: "error",
        message: `${prevName} hands over ${kindLabel(kind, true)}, but ${name} needs ${spec.in === "pdf" ? "a PDF" : kindLabel(spec.in, true)}.`,
        fix: bridge ? { type: "insert", at: i, tool: bridge, label: `Insert ${label(bridge)} between them` } : { type: "remove", at: i, label: "Remove this step" },
      });
    }

    // 2. Merge needs more than one file to reach it.
    if (step.tool === "merge" && i > 0 && count === "one") {
      issues.push({
        level: "error",
        message: `Only one PDF reaches Merge here: ${prevName} always makes a single file, so there's nothing to combine.`,
        fix: { type: "remove", at: i, label: "Remove Merge" },
      });
    }

    // 3. Locking must be last; unlocking must be first.
    if (isLockStep({ tool: step.tool, options: o }) && i < steps.length - 1) {
      issues.push({
        level: "error",
        message: "Once the PDF is locked, the steps after it can't open it. Locking has to be the last step.",
        fix: { type: "move", from: i, to: steps.length - 1, label: "Move it to the end" },
      });
    }
    if (isUnlockStep({ tool: step.tool, options: o }) && i > 0) {
      issues.push({
        level: "error",
        message: "Unlock has to be the first step: the steps before it can't open a locked PDF.",
        fix: { type: "move", from: i, to: 0, label: "Move it to the start" },
      });
    }

    // 4. OCR reads image-only pages and refuses a PDF that already has text.
    if (step.tool === "ocr" && text === "yes") {
      const src = textSource >= 0 ? label(steps[textSource].tool) : "an earlier step";
      const canMoveBefore = textSource >= 0 && RECIPE_TOOLS[steps[textSource].tool]?.in === "pdf";
      issues.push({
        level: "error",
        message: `OCR only works on scanned, image-only pages, and after ${src} the PDF already has text.`,
        fix: canMoveBefore
          ? { type: "move", from: i, to: textSource, label: `Move OCR before ${src}` }
          : { type: "remove", at: i, label: "Remove OCR" },
      });
    }

    // Warnings: it runs, but probably not how the user wants.
    // (Baking a watermark or page numbers into the picture is often the point, so that's not warned about.)
    if (spec.rasterizes && spec.in === "pdf" && text === "yes" && textSource >= 0 && steps[textSource].tool !== "watermark") {
      const src = steps[textSource].tool;
      const ocrToEnd: Fix | undefined =
        src === "ocr" ? { type: "move", from: textSource, to: steps.length - 1, label: "Move OCR to the end" } : undefined;
      issues.push({
        level: "warning",
        message:
          src === "ocr"
            ? `${name} turns pages into pictures, which wipes out the text layer OCR added in step ${textSource + 1}. Put OCR last to keep the result searchable.`
            : `${name} turns pages into pictures, so the text from step ${textSource + 1} won't be selectable or searchable any more.`,
        fix: ocrToEnd,
      });
    }
    if (step.tool === "pdf-to-images" && text === "yes" && textSource >= 0 && steps[textSource].tool === "ocr") {
      issues.push({
        level: "warning",
        message: `Pictures can't hold OCR's text layer from step ${textSource + 1}, so that work is lost.`,
        fix: { type: "remove", at: textSource, label: "Remove the OCR step" },
      });
    }
    if (step.tool === "flatten" && rasterAt >= 0) {
      issues.push({
        level: "warning",
        message: `Nothing is left to flatten: ${label(steps[rasterAt].tool)} in step ${rasterAt + 1} already turned every page into a picture.`,
        fix: { type: "remove", at: i, label: "Remove Flatten" },
      });
    }
    if (i > 0 && steps[i - 1].tool === step.tool && step.tool !== "watermark" && step.tool !== "split" && !issues.some((x) => x.level === "error")) {
      issues.push({
        level: "warning",
        message:
          step.tool === "compress"
            ? "Compressing twice lowers the quality again and rarely saves much more space. Lower the DPI on one step instead."
            : `${name} runs twice in a row; the second pass won't change much.`,
        fix: { type: "remove", at: i, label: "Remove the repeat" },
      });
    }
    if (step.tool === "merge" && i > 0 && steps[i - 1].tool === "split" && RECIPE_TOOLS.split.count({ ...defaultsOf("split"), ...steps[i - 1].options }) === "more") {
      issues.push({ level: "warning", message: "Merge right after Split puts the pieces straight back together." });
    }

    // Advance the model.
    const outCount = nextCount(count, spec.count(o));
    const effect = spec.text(o);
    if (effect === "adds") {
      text = "yes";
      textSource = i;
    } else if (effect === "removes") {
      text = "no";
      textSource = -1;
    } else if (effect === "unknown") {
      text = "unknown";
      textSource = -1;
    }
    if (spec.out !== "pdf") {
      text = "unknown";
      textSource = -1;
    }
    if (spec.rasterizes) rasterAt = i;
    if (spec.out !== "pdf") rasterAt = -1;

    out.push({
      inKind: i === 0 ? undefined : kind,
      inCount: count,
      outKind: spec.out,
      outCount,
      issues,
      needs: stepNeeds(step, defaultsOf(step.tool), forRun),
    });
    kind = spec.out;
    count = outCount;
  });

  const errors = out.reduce((n, s) => n + s.issues.filter((x) => x.level === "error").length, 0);
  const warnings = out.reduce((n, s) => n + s.issues.filter((x) => x.level === "warning").length, 0);
  const firstSpec = steps[0] ? RECIPE_TOOLS[steps[0].tool] : undefined;

  return {
    steps: out,
    errors,
    warnings,
    output: kind ? { kind, count } : undefined,
    input: firstSpec?.in,
    needsTwoFiles: steps[0]?.tool === "merge",
  };
}

/** Whether `tool` can go at position `at` without adding an error. Returns the reason when it can't. */
export function canInsert(
  steps: RecipeStep[],
  at: number,
  tool: string,
  label: (slug: string) => string,
  defaultsOf?: (slug: string) => Options,
): { ok: true } | { ok: false; reason: string } {
  if (!isRecipeTool(tool)) return { ok: false, reason: UNAVAILABLE_TOOLS[tool] ?? "Can't be part of a recipe." };
  if (steps.length >= MAX_STEPS) return { ok: false, reason: `A recipe can have up to ${MAX_STEPS} steps.` };
  const before = analyzeChain(steps, label, defaultsOf);
  const next = [...steps];
  next.splice(at, 0, { tool });
  const after = analyzeChain(next, label, defaultsOf);
  const own = after.steps[at].issues.find((x) => x.level === "error");
  if (own) return { ok: false, reason: own.message };
  if (after.errors > before.errors) {
    const had = new Set(before.steps.flatMap((s) => s.issues.map((x) => x.message)));
    const fresh = after.steps.flatMap((s) => s.issues).find((x) => x.level === "error" && !had.has(x.message));
    return { ok: false, reason: fresh?.message ?? "That would break the chain." };
  }
  return { ok: true };
}

/** Tools that can be appended to `steps` with no new error (used by the palette and the home page demo). */
export function allowedNext(steps: string[]): string[] {
  const chain = steps.map((tool) => ({ tool }));
  return Object.keys(RECIPE_TOOLS).filter((tool) => canInsert(chain, chain.length, tool, (s) => s).ok);
}

/** Step names joined by arrows, used as a default title. */
export function defaultTitle(steps: RecipeStep[], label: (slug: string) => string): string {
  return steps.map((s) => label(s.tool)).join(" → ");
}

/** Plain-words summary of what the chain hands back. */
export function describeOutput(output: { kind: Kind; count: Count } | undefined): string {
  if (!output) return "";
  const k = output.kind;
  if (output.count === "one") return k === "pdf" ? "One PDF" : `One ${kindLabel(k)}`;
  if (output.count === "batch") return k === "pdf" ? "A PDF for each file you add" : `One ${kindLabel(k)} for each file you add`;
  return `Several ${kindLabel(k, true)}`;
}

/** Only the settings that differ from the tool's defaults, so a saved recipe follows future default changes. */
export function diffOptions(full: Options, defaults: Options): Options | undefined {
  const out: Options = {};
  for (const [k, v] of Object.entries(full)) {
    if (JSON.stringify(v) !== JSON.stringify(defaults[k])) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
