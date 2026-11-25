/**
 * The fitter: an extension page shown in an iframe over a web page (or on its
 * own in a tab, "standalone", with downloads instead of "Put in the form").
 *
 * The content script sends the field's constraints once over a private
 * MessagePort; the user picks files here; the engines run here, in the
 * extension's own origin; the finished files go back over the same port.
 */
import "../ui/theme.css";
import { t } from "../shared/i18n";
import { h, formatBytes, initEngineStrings } from "../ui/dom";
import { allowedOutputs, parseAccept, planOutput, type OutputFormat, type Plan, type PlanError } from "../shared/accept";
import { FitError, fitToPlan, type Fitted, type PageSize, type Target } from "../shared/fit";
import type { FieldConstraints } from "../content/context";
import type { FitterInit, FitterMessage, FitterReply } from "../shared/messages";

const FORMAT_NAMES: Record<OutputFormat, string> = { jpeg: "JPG", png: "PNG", webp: "WebP", pdf: "PDF" };

interface State {
  constraints: FieldConstraints | null;
  host: string;
  maxValue: string;
  maxUnit: "KB" | "MB";
  minValue: string;
  choice: OutputFormat | "auto";
  pageSize: PageSize;
  files: File[];
  results: Fitted[] | null;
  plan: Plan | null;
  busy: boolean;
  error: string | null;
  applied: "ok" | "failed" | "gone" | null;
}

const state: State = {
  constraints: null,
  host: "",
  maxValue: "",
  maxUnit: "KB",
  minValue: "",
  choice: "auto",
  pageSize: "a4",
  files: [],
  results: null,
  plan: null,
  busy: false,
  error: null,
  applied: null,
};

let port: MessagePort | null = null;
let runId = 0;
const app = document.getElementById("app")!;
const urls: string[] = [];

function trimNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function applyConstraints(c: FieldConstraints) {
  state.constraints = c;
  if (c.maxBytes !== undefined) {
    if (c.maxBytes >= 1_000_000) {
      state.maxValue = trimNumber(c.maxBytes / 1_000_000);
      state.maxUnit = "MB";
    } else {
      state.maxValue = trimNumber(c.maxBytes / 1000);
      state.maxUnit = "KB";
    }
  }
  if (c.minBytes !== undefined) state.minValue = trimNumber(c.minBytes / 1024);
}

function target(): Target {
  const max = Number(state.maxValue);
  const min = Number(state.minValue);
  return {
    maxBytes: state.maxValue && max > 0 ? Math.round(max * (state.maxUnit === "MB" ? 1_000_000 : 1000)) : undefined,
    minBytes: state.minValue && min > 0 ? Math.round(min * 1024) : undefined,
  };
}

function allowed(): OutputFormat[] {
  const c = state.constraints;
  return allowedOutputs(parseAccept(c?.accept ?? ""), c?.formats ?? []);
}

function planError(reason: PlanError): string {
  switch (reason) {
    case "nothing-allowed":
      return t("errNothingAllowed", state.constraints?.accept || "?");
    case "unsupported-input":
      return t("errUnsupported");
    case "mixed-input":
      return t("errMixed");
    case "one-file-only":
      return t("errOneFile");
    case "several-pdfs":
      return t("errSeveralPdfs");
  }
}

async function run() {
  const id = ++runId;
  state.results = null;
  state.error = null;
  state.applied = null;
  if (state.files.length === 0) return render();
  const tgt = target();
  const plan = planOutput(state.files, allowed(), state.constraints?.multiple ?? true, {
    choice: state.choice === "auto" ? undefined : state.choice,
    sizeLimited: tgt.maxBytes !== undefined,
  });
  state.plan = plan;
  if (plan.kind === "error") {
    state.error = planError(plan.reason);
    return render();
  }
  state.busy = true;
  render();
  try {
    const results = await fitToPlan(state.files, plan, tgt, { pageSize: state.pageSize });
    if (id !== runId) return;
    state.results = results;
  } catch (e) {
    if (id !== runId) return;
    if (e instanceof FitError) state.error = t(e.code === "password" ? "errPassword" : "errUnreadable", e.fileName);
    else state.error = t("errGeneric", e instanceof Error ? e.message : String(e));
  } finally {
    if (id === runId) {
      state.busy = false;
      render();
    }
  }
}

function setFiles(list: FileList | File[] | null) {
  const files = Array.from(list ?? []);
  if (files.length === 0) return;
  state.files = files;
  void run();
}

function objectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  urls.push(url);
  return url;
}

function download(files: File[]) {
  for (const file of files) {
    const a = h("a", { href: objectUrl(file), download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
  }
}

function close() {
  if (port) port.postMessage({ type: "close" } satisfies FitterMessage);
  else window.close();
}

function putInForm() {
  if (!port || !state.results) return;
  port.postMessage({ type: "apply", files: state.results.map((r) => r.file) } satisfies FitterMessage);
}

function onReply(reply: FitterReply) {
  if (reply.type !== "applied") return;
  state.applied = reply.ok ? "ok" : reply.gone ? "gone" : "failed";
  render();
  if (reply.ok) setTimeout(close, 1400);
}

function limitsCard(): HTMLElement {
  const c = state.constraints;
  const outs = allowed();
  const accepts = c && c.accept.trim()
    ? t("acceptsLabel", c.accept.split(",").map((s) => s.trim()).filter(Boolean).join(", "))
    : c ? t("acceptsAnything") : "";

  const maxInput = h("input", { type: "number", min: "0", step: "any", value: state.maxValue, inputmode: "decimal", "aria-label": t("maxLabel") });
  maxInput.addEventListener("change", () => {
    state.maxValue = maxInput.value;
    void run();
  });
  const unit = h("select", { "aria-label": t("maxLabel") }, h("option", { value: "KB" }, "KB"), h("option", { value: "MB" }, "MB"));
  unit.value = state.maxUnit;
  unit.addEventListener("change", () => {
    state.maxUnit = unit.value as "KB" | "MB";
    void run();
  });
  const minInput = h("input", { type: "number", min: "0", step: "any", value: state.minValue, placeholder: t("optional"), "aria-label": t("minLabel") });
  minInput.addEventListener("change", () => {
    state.minValue = minInput.value;
    void run();
  });

  const format = h("select", { id: "format" }, h("option", { value: "auto" }, t("formatAuto")), ...outs.map((f) => h("option", { value: f }, FORMAT_NAMES[f])));
  format.value = state.choice;
  format.addEventListener("change", () => {
    state.choice = format.value as State["choice"];
    void run();
  });

  const pageSize = h("select", { id: "page-size" },
    h("option", { value: "a4" }, t("pageA4")),
    h("option", { value: "letter" }, t("pageLetter")),
    h("option", { value: "fit" }, t("pageFit")),
  );
  pageSize.value = state.pageSize;
  pageSize.addEventListener("change", () => {
    state.pageSize = pageSize.value as PageSize;
    void run();
  });
  const showPageSize = state.plan?.kind === "images-to-pdf";

  let source: string;
  if (c?.source === "text" && c.evidence) source = t("limitFound", c.evidence);
  else if (c?.source === "attribute") source = t("limitFromCode");
  else source = t("noLimitFound");

  return h("section", { class: "card soft stack", "aria-labelledby": "wants" },
    h("h2", { id: "wants" }, t("wantsHeading")),
    h("div", { class: "row" },
      h("label", { class: "field grow" }, t("maxLabel"), h("span", { class: "row" }, maxInput, unit)),
      h("label", { class: "field", style: "width: 110px" }, `${t("minLabel")} (KB)`, minInput),
    ),
    h("p", { class: "small muted" }, source),
    h("div", { class: "row" },
      h("label", { class: "field grow", for: "format" }, t("formatLabel"), format),
      showPageSize && h("label", { class: "field grow", for: "page-size" }, t("pageSizeLabel"), pageSize),
    ),
    accepts && h("p", { class: "small muted" }, accepts),
  );
}

function dropZone(): HTMLElement {
  const many = state.constraints?.multiple ?? true;
  const picker = h("input", { type: "file", accept: "image/*,application/pdf,.pdf", multiple: true, hidden: true });
  picker.addEventListener("change", () => setFiles(picker.files));
  const zone = h("div", { class: "drop" },
    h("p", {}, t(many ? "dropHereMany" : "dropHere")),
    h("button", { type: "button", class: "primary", onclick: () => picker.click() }, t(many ? "chooseFiles" : "chooseFile")),
    picker,
  );
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    setFiles(e.dataTransfer?.files ?? null);
  });
  return zone;
}

function resultCard(results: Fitted[]): HTMLElement {
  const tgt = target();
  const allMet = results.every((r) => r.met);
  const items = results.map((r) => {
    const preview = r.file.type.startsWith("image/")
      ? h("img", { class: "thumb", src: objectUrl(r.file), alt: "" })
      : h("div", { class: "thumb", style: "display:grid;place-items:center;font-weight:600;font-size:11px" }, "PDF");
    let status: string;
    let tone: "ok" | "warn";
    if (r.met && r.untouched) [status, tone] = [t("keptAsIs", formatBytes(r.file.size)), "ok"];
    else if (r.met && tgt.maxBytes !== undefined) [status, tone] = [t("fitsUnder", formatBytes(r.file.size), formatBytes(tgt.maxBytes)), "ok"];
    else if (r.met) [status, tone] = [t("ready", formatBytes(r.file.size)), "ok"];
    else if (r.miss === "too-small") [status, tone] = [t("tooSmall", formatBytes(tgt.minBytes ?? 0)), "warn"];
    else [status, tone] = [t("tooBig", formatBytes(tgt.maxBytes ?? 0), formatBytes(r.file.size)), "warn"];
    return h("li", { class: "row" }, preview,
      h("div", { class: "grow stack", style: "gap:4px" },
        h("span", { class: "name" }, r.file.name),
        h("span", { class: `notice ${tone}`, style: "padding:4px 8px" }, status),
      ),
    );
  });

  const notes: string[] = [];
  if (state.plan?.kind === "pdf" && results.some((r) => !r.untouched)) notes.push(t("pdfRasterNote"));
  if (state.plan?.kind === "pdf-to-images" && state.plan.firstPageOnly) notes.push(t("firstPageNote"));

  let appliedNote: HTMLElement | null = null;
  if (state.applied === "ok") appliedNote = h("p", { class: "notice ok", role: "status" }, t("applied"));
  else if (state.applied === "failed") appliedNote = h("p", { class: "notice error", role: "alert" }, t("applyFailed"));
  else if (state.applied === "gone") appliedNote = h("p", { class: "notice error", role: "alert" }, t("pageGone"));

  return h("section", { class: "card stack", "aria-live": "polite" },
    h("ul", { class: "stack", style: "list-style:none;margin:0;padding:0" }, ...items),
    ...notes.map((n) => h("p", { class: "small muted" }, n)),
    appliedNote,
    h("div", { class: "row", style: "flex-wrap:wrap" },
      port && h("button", { type: "button", class: allMet ? "primary" : "", onclick: putInForm, disabled: state.applied === "ok" }, t(allMet ? "putInForm" : "useAnyway")),
      h("button", { type: "button", class: port ? "" : "primary", onclick: () => download(results.map((r) => r.file)) }, t("download")),
      h("button", { type: "button", class: "link", onclick: () => { state.files = []; void run(); } }, t("startOver")),
    ),
  );
}

function render() {
  while (urls.length) URL.revokeObjectURL(urls.pop()!);
  const c = state.constraints;
  const subtitle = !port ? null : c?.label ? t("fitFor", c.label, state.host) : t("fitForHost", state.host);
  const closeButton = h("button", { type: "button", class: "icon", "aria-label": t("close"), title: t("close"), onclick: close }, "✕");

  const body: (HTMLElement | null | false)[] = [limitsCard()];
  if (state.busy) {
    body.push(h("div", { class: "row", role: "status" }, h("div", { class: "spinner" }), h("span", {}, t("working"))));
  } else if (state.error) {
    body.push(h("p", { class: "notice error", role: "alert" }, state.error), dropZone());
  } else if (state.results) {
    body.push(resultCard(state.results));
  } else {
    body.push(dropZone());
  }

  app.replaceChildren(
    h("header", { class: "bar" },
      h("img", { src: "icons/icon-32.png", alt: "" }),
      h("div", { class: "grow" },
        h("h1", {}, t(port ? "fitTitle" : "fitStandaloneTitle")),
        subtitle && h("p", { class: "small muted name" }, subtitle),
      ),
      closeButton,
    ),
    h("main", { class: "stack", style: "padding:14px" }, ...body.filter((x): x is HTMLElement => Boolean(x))),
    h("footer", { class: "privacy" }, t("privacyNote")),
  );
}

window.addEventListener("message", (e: MessageEvent<FitterInit>) => {
  if (port || e.source !== window.parent || e.data?.type !== "iloathepdf:init" || !e.ports[0]) return;
  port = e.ports[0];
  port.onmessage = (m: MessageEvent<FitterReply>) => onReply(m.data);
  state.host = e.data.host;
  applyConstraints(e.data.constraints);
  render();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") close();
});

document.title = t("fitTitle");
render();
// Opened over a page: say hello so the content script can connect (it
// replies only to an extension origin, so this carries nothing but its type).
if (window.parent !== window) window.parent.postMessage({ type: "iloathepdf:hello" }, "*");
void initEngineStrings();
