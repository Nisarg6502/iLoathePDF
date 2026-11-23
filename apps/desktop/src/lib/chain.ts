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
 * This is the desktop app's copy of the web app's recipes/chain.ts. The
 * structure is the same; the tool specs differ because the engines do: here
 * Compress runs Ghostscript and keeps text (so it never wipes OCR), OCR
 * rebuilds each page from a 300 DPI image, and PDF/A and PDF to Excel exist.
 *
 * Deliberately free of runtime imports so scripts/check-custom-recipes.ts can
 * load it under plain Node: the caller passes tool names in through `label`.
 */

/** What flows between steps. */
export type Kind = "pdf" | "image" | "text" | "csv" | "html" | "zip" | "sheet";

/**
 * Translates one user-facing sentence. The apps pass i18next's `t`, so every
 * message below reads in the user's language; scripts and tests use the
 * default, `english`, which just fills in the {{placeholders}}.
 */
export type Tr = (text: string, vars?: Record<string, string | number>) => string;
export const english: Tr = (text, vars) =>
  vars ? text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? "")) : text;
/** Marks text that is translated where it is shown (see packages/i18n). Returns it unchanged. */
const msg = <T extends string>(text: T): T => text;

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
  const content = o.mode === "stamp" ? o.stampContent : o.watermarkContent;
  return (content ?? "text") === "text";
};

export const RECIPE_TOOLS: Record<string, ToolSpec> = {
  merge: { in: "pdf", out: "pdf", count: () => "one", text: keeps, blurb: msg("Join every PDF into one"), group: "pdf" },
  split: {
    in: "pdf",
    out: "pdf",
    count: (o) => (o.mode === "extract" || o.mode === "delete" ? "same" : "more"),
    text: keeps,
    blurb: msg("Cut into parts, keep or drop pages"),
    group: "pdf",
  },
  compress: { in: "pdf", out: "pdf", count: same, text: keeps, blurb: msg("Shrink file size, text stays text"), group: "pdf" },
  crop: { in: "pdf", out: "pdf", count: same, text: keeps, blurb: msg("Trim page margins"), group: "pdf" },
  watermark: {
    in: "pdf",
    out: "pdf",
    count: same,
    text: (o) => (watermarkAddsText(o) ? "adds" : "keeps"),
    blurb: msg("Watermark, page numbers or stamp"),
    group: "pdf",
  },
  flatten: { in: "pdf", out: "pdf", count: same, text: keeps, blurb: msg("Bake in form fields and notes"), group: "pdf" },
  ocr: { in: "pdf", out: "pdf", count: same, text: () => "adds", rasterizes: true, blurb: msg("Make scans searchable"), group: "pdf" },
  pdfa: { in: "pdf", out: "pdf", count: same, text: keeps, blurb: msg("Archive-safe PDF/A"), group: "pdf" },
  protect: { in: "pdf", out: "pdf", count: same, text: keeps, blurb: msg("Add or remove a password"), group: "security" },
  "pdf-to-image": { in: "pdf", out: "image", count: () => "more", text: keeps, blurb: msg("Every page as a picture"), group: "convert" },
  "pdf-to-excel": { in: "pdf", out: "sheet", count: same, text: keeps, blurb: msg("Tables into a spreadsheet"), group: "convert" },
  "image-to-pdf": { in: "image", out: "pdf", count: () => "one", text: () => "removes", rasterizes: true, blurb: msg("Pictures into one PDF"), group: "convert" },
  scan: { in: "image", out: "pdf", count: () => "one", text: () => "removes", rasterizes: true, blurb: msg("Clean up photos of paper into a PDF"), group: "convert" },
  "convert-image": { in: "image", out: "image", count: same, text: keeps, blurb: msg("Format, quality and size, HEIC too"), group: "image" },
  "txt-to-pdf": { in: "text", out: "pdf", count: same, text: () => "adds", blurb: msg("Text files into PDFs"), group: "convert" },
  "csv-to-pdf": { in: "csv", out: "pdf", count: same, text: () => "adds", blurb: msg("Tables into PDFs"), group: "convert" },
  "html-to-pdf": { in: "html", out: "pdf", count: same, text: () => "adds", blurb: msg("Web pages into PDFs"), group: "convert" },
  "zip-to-pdf": { in: "zip", out: "pdf", count: same, text: () => "unknown", blurb: msg("Everything in a ZIP into one PDF"), group: "convert" },
};

/** Tools that exist but can't be a recipe step, and why. Shown greyed out in the palette. */
export const UNAVAILABLE_TOOLS: Record<string, string> = {
  sign: msg("Needs you to place a signature on the page by hand."),
  redact: msg("Needs you to draw boxes over what to hide, page by page."),
  organize: msg("Needs you to drag pages around by hand."),
  reader: msg("Only shows a PDF; it doesn't make a new file."),
};

export const MAX_STEPS = 10;
export const MIN_STEPS = 1;

export const GROUP_LABEL: Record<ToolSpec["group"], string> = {
  pdf: msg("Edit PDFs"),
  convert: msg("Convert"),
  image: msg("Images"),
  security: msg("Security"),
};

/** One of each kind, as a noun. */
const KIND_ONE: Record<Kind, string> = {
  pdf: msg("PDF"),
  image: msg("image"),
  text: msg("text file"),
  csv: msg("CSV"),
  html: msg("HTML page"),
  zip: msg("ZIP"),
  sheet: msg("spreadsheet"),
};

/** Several of each kind. Whole phrases, so each language can inflect them its own way. */
const KIND_MANY: Record<Kind, string> = {
  pdf: msg("PDFs"),
  image: msg("images"),
  text: msg("text files"),
  csv: msg("CSVs"),
  html: msg("HTML pages"),
  zip: msg("ZIPs"),
  sheet: msg("spreadsheets"),
};

/** What a chain hands back: a single file. */
const OUTPUT_ONE: Record<Kind, string> = {
  pdf: msg("One PDF"),
  image: msg("One image"),
  text: msg("One text file"),
  csv: msg("One CSV"),
  html: msg("One HTML page"),
  zip: msg("One ZIP"),
  sheet: msg("One spreadsheet"),
};

/** What a chain hands back: one result per input file. */
const OUTPUT_BATCH: Record<Kind, string> = {
  pdf: msg("A PDF for each file you add"),
  image: msg("One image for each file you add"),
  text: msg("One text file for each file you add"),
  csv: msg("One CSV for each file you add"),
  html: msg("One HTML page for each file you add"),
  zip: msg("One ZIP for each file you add"),
  sheet: msg("One spreadsheet for each file you add"),
};

/** What a chain hands back: several files from one input. */
const OUTPUT_SEVERAL: Record<Kind, string> = {
  pdf: msg("Several PDFs"),
  image: msg("Several images"),
  text: msg("Several text files"),
  csv: msg("Several CSVs"),
  html: msg("Several HTML pages"),
  zip: msg("Several ZIPs"),
  sheet: msg("Several spreadsheets"),
};

export function kindLabel(kind: Kind, plural = false, tr: Tr = english): string {
  return tr((plural ? KIND_MANY : KIND_ONE)[kind]);
}

/** A short label for what flows over a connector, e.g. "PDF", "PDF per file", "images". */
export function flowLabel(kind: Kind, count: Count, tr: Tr = english): string {
  if (count === "one") return `1 ${kindLabel(kind, false, tr)}`;
  if (count === "batch") return kindLabel(kind, true, tr);
  return `${kindLabel(kind, true, tr)} ×N`;
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
  pdf: { image: "pdf-to-image" },
  image: { pdf: "image-to-pdf" },
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
export function stepNeeds(step: RecipeStep, defaults: Options, forRun: boolean, tr: Tr = english): string | null {
  const o = { ...defaults, ...step.options };
  switch (step.tool) {
    case "protect": {
      const pw = String(o.password ?? "");
      if (!forRun) return o.mode === "unlock" ? tr("Asks for the PDF's password when you run it") : tr("Asks for a new password when you run it");
      if (pw.length < MIN_PASSWORD) return o.mode === "unlock" ? tr("Enter the PDF's current password") : tr("Set a password (at least {{min}} characters)", { min: MIN_PASSWORD });
      if (o.mode !== "unlock" && pw !== String(o.confirmPassword ?? "")) return tr("The two passwords don't match");
      return null;
    }
    case "split": {
      if (o.mode === "every") return Number(o.every) >= 1 ? null : tr("Set how many pages go in each file");
      if (o.mode === "extract" || o.mode === "delete") {
        return String(o.pages ?? "").trim() ? null : o.mode === "extract" ? tr("Enter the pages to keep") : tr("Enter the pages to remove");
      }
      return String(o.ranges ?? "").trim() ? null : tr("Enter page ranges, like 1-3,4-6");
    }
    case "watermark": {
      if (o.mode === "page_numbers") return null;
      const stamp = o.mode === "stamp";
      const content = stamp ? o.stampContent : o.watermarkContent;
      if (content === "image") return (stamp ? o.stampImageDataUrl : o.watermarkImageDataUrl) ? null : tr("Choose an image");
      return String((stamp ? o.stampText : o.watermarkText) ?? "").trim() ? null : stamp ? tr("Type the stamp text") : tr("Type the watermark text");
    }
    case "crop": {
      const any = ["top", "right", "bottom", "left"].some((s) => Number(o[s] ?? 0) > 0);
      return any ? null : tr("Set at least one margin above 0%");
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
  tr: Tr = english,
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
        message: UNAVAILABLE_TOOLS[step.tool]
          ? `${tr("{{name}} can't be part of a recipe.", { name })} ${tr(UNAVAILABLE_TOOLS[step.tool])}`
          : tr("{{name}} can't be part of a recipe.", { name }),
        fix: { type: "remove", at: i, label: tr("Remove it") },
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
        message: tr("{{prev}} hands over {{kind}}, but {{name}} needs {{need}}.", {
          prev: prevName,
          kind: kindLabel(kind, true, tr),
          name,
          need: spec.in === "pdf" ? tr("a PDF") : kindLabel(spec.in, true, tr),
        }),
        fix: bridge ? { type: "insert", at: i, tool: bridge, label: tr("Insert {{tool}} between them", { tool: label(bridge) }) } : { type: "remove", at: i, label: tr("Remove this step") },
      });
    }

    // 2. Merge needs more than one file to reach it.
    if (step.tool === "merge" && i > 0 && count === "one") {
      issues.push({
        level: "error",
        message: tr("Only one PDF reaches Merge here: {{prev}} always makes a single file, so there's nothing to combine.", { prev: prevName }),
        fix: { type: "remove", at: i, label: tr("Remove Merge") },
      });
    }

    // 3. Locking must be last; unlocking must be first.
    if (isLockStep({ tool: step.tool, options: o }) && i < steps.length - 1) {
      issues.push({
        level: "error",
        message: tr("Once the PDF is locked, the steps after it can't open it. Locking has to be the last step."),
        fix: { type: "move", from: i, to: steps.length - 1, label: tr("Move it to the end") },
      });
    }
    if (isUnlockStep({ tool: step.tool, options: o }) && i > 0) {
      issues.push({
        level: "error",
        message: tr("Unlock has to be the first step: the steps before it can't open a locked PDF."),
        fix: { type: "move", from: i, to: 0, label: tr("Move it to the start") },
      });
    }

    // 4. OCR reads image-only pages and refuses a PDF that already has text.
    if (step.tool === "ocr" && text === "yes") {
      const src = textSource >= 0 ? label(steps[textSource].tool) : tr("an earlier step");
      const canMoveBefore = textSource >= 0 && RECIPE_TOOLS[steps[textSource].tool]?.in === "pdf";
      issues.push({
        level: "error",
        message: tr("OCR only works on scanned, image-only pages, and after {{src}} the PDF already has text.", { src }),
        fix: canMoveBefore
          ? { type: "move", from: i, to: textSource, label: tr("Move OCR before {{src}}", { src }) }
          : { type: "remove", at: i, label: tr("Remove OCR") },
      });
    }

    // Warnings: it runs, but probably not how the user wants.
    // (Baking a watermark or page numbers into the picture is often the point, so that's not warned about.)
    if (spec.rasterizes && spec.in === "pdf" && text === "yes" && textSource >= 0 && steps[textSource].tool !== "watermark") {
      const src = steps[textSource].tool;
      const ocrToEnd: Fix | undefined =
        src === "ocr" ? { type: "move", from: textSource, to: steps.length - 1, label: tr("Move OCR to the end") } : undefined;
      issues.push({
        level: "warning",
        message:
          src === "ocr"
            ? tr("{{name}} turns pages into pictures, which wipes out the text layer OCR added in step {{step}}. Put OCR last to keep the result searchable.", { name, step: textSource + 1 })
            : tr("{{name}} turns pages into pictures, so the text from step {{step}} won't be selectable or searchable any more.", { name, step: textSource + 1 }),
        fix: ocrToEnd,
      });
    }
    if (step.tool === "pdf-to-image" && text === "yes" && textSource >= 0 && steps[textSource].tool === "ocr") {
      issues.push({
        level: "warning",
        message: tr("Pictures can't hold OCR's text layer from step {{step}}, so that work is lost.", { step: textSource + 1 }),
        fix: { type: "remove", at: textSource, label: tr("Remove the OCR step") },
      });
    }
    if (step.tool === "flatten" && rasterAt >= 0) {
      issues.push({
        level: "warning",
        message: tr("Nothing is left to flatten: {{tool}} in step {{step}} already turned every page into a picture.", { tool: label(steps[rasterAt].tool), step: rasterAt + 1 }),
        fix: { type: "remove", at: i, label: tr("Remove Flatten") },
      });
    }
    if (i > 0 && steps[i - 1].tool === step.tool && step.tool !== "watermark" && step.tool !== "split" && !issues.some((x) => x.level === "error")) {
      issues.push({
        level: "warning",
        message:
          step.tool === "compress"
            ? tr("Compressing twice lowers the quality again and rarely saves much more space. Lower the DPI on one step instead.")
            : tr("{{name}} runs twice in a row; the second pass won't change much.", { name }),
        fix: { type: "remove", at: i, label: tr("Remove the repeat") },
      });
    }
    if (step.tool === "merge" && i > 0 && steps[i - 1].tool === "split" && RECIPE_TOOLS.split.count({ ...defaultsOf("split"), ...steps[i - 1].options }) === "more") {
      issues.push({ level: "warning", message: tr("Merge right after Split puts the pieces straight back together.") });
    }

    // PDF/A is a promise about the finished file; later edits can break it.
    if (step.tool !== "pdfa" && i > 0 && steps.slice(0, i).some((s) => s.tool === "pdfa") && spec.out === "pdf") {
      const at = steps.findIndex((s) => s.tool === "pdfa");
      issues.push({
        level: "warning",
        message: isLockStep({ tool: step.tool, options: o })
          ? tr("PDF/A files can't be password-protected, so locking undoes the PDF/A conversion.")
          : tr("{{name}} changes the file after PDF/A (step {{step}}), so it may no longer be a valid PDF/A.", { name, step: at + 1 }),
        fix: isLockStep({ tool: step.tool, options: o }) ? undefined : { type: "move", from: at, to: i, label: tr("Move PDF/A after it") },
      });
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
      needs: stepNeeds(step, defaultsOf(step.tool), forRun, tr),
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
  tr: Tr = english,
): { ok: true } | { ok: false; reason: string } {
  if (!isRecipeTool(tool)) return { ok: false, reason: tr(UNAVAILABLE_TOOLS[tool] ?? "Can't be part of a recipe.") };
  if (steps.length >= MAX_STEPS) return { ok: false, reason: tr("A recipe can have up to {{max}} steps.", { max: MAX_STEPS }) };
  const before = analyzeChain(steps, label, defaultsOf, false, tr);
  const next = [...steps];
  next.splice(at, 0, { tool });
  const after = analyzeChain(next, label, defaultsOf, false, tr);
  const own = after.steps[at].issues.find((x) => x.level === "error");
  if (own) return { ok: false, reason: own.message };
  if (after.errors > before.errors) {
    const had = new Set(before.steps.flatMap((s) => s.issues.map((x) => x.message)));
    const fresh = after.steps.flatMap((s) => s.issues).find((x) => x.level === "error" && !had.has(x.message));
    return { ok: false, reason: fresh?.message ?? tr("That would break the chain.") };
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
export function describeOutput(output: { kind: Kind; count: Count } | undefined, tr: Tr = english): string {
  if (!output) return "";
  const table = output.count === "one" ? OUTPUT_ONE : output.count === "batch" ? OUTPUT_BATCH : OUTPUT_SEVERAL;
  return tr(table[output.kind]);
}

/** Only the settings that differ from the tool's defaults, so a saved recipe follows future default changes. */
export function diffOptions(full: Options, defaults: Options): Options | undefined {
  const out: Options = {};
  for (const [k, v] of Object.entries(full)) {
    if (JSON.stringify(v) !== JSON.stringify(defaults[k])) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
