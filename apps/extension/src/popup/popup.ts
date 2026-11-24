/**
 * The toolbar popup: shows the Fit buttons on the current page (activeTab),
 * the per-site "always show" switch, and the Images to PDF list, which it
 * turns into a PDF here with the website's imagesToPdf engine.
 */
import "../ui/theme.css";
import { t } from "../shared/i18n";
import { h, formatBytes, initEngineStrings } from "../ui/dom";
import { addImage, clearImages, listImages, moveImage, removeImage, type StoredImage } from "../shared/imageStore";
import { CONTENT_SCRIPT, type ContentRequest, type ScanResult } from "../shared/messages";
import { ALL_SITES, disableAlways, enableAlways, isAlwaysOn, siteMatch } from "../shared/sites";
import { PDF_IMAGE_TYPES } from "../shared/sniff";
import { imagesToPdfEngine } from "@/engines/imagesToPdf";
import type { PageSize } from "../shared/fit";

document.body.style.width = "360px";
const app = document.getElementById("app")!;
const fitSection = h("section", { class: "stack", style: "padding:14px", "aria-labelledby": "fit-h" });
const imagesSection = h("section", { class: "stack", style: "padding:14px;border-top:1px solid var(--border)", "aria-labelledby": "img-h" });
app.replaceChildren(
  h("header", { class: "bar" }, h("img", { src: "icons/icon-32.png", alt: "" }), h("h1", {}, "iLoathePDF")),
  fitSection,
  imagesSection,
  h("footer", { class: "privacy" }, t("privacyNote")),
);

let tabId: number | undefined;
let pageSize: PageSize = "a4";
let status: { text: string; tone: "ok" | "error" } | null = null;
const urls: string[] = [];

async function renderFit() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  const match = siteMatch(tab?.url);
  const heading = h("h2", { id: "fit-h" }, t("popupFitHeading"));
  const standalone = h("button", { type: "button", class: "link", onclick: () => window.open(chrome.runtime.getURL("fit.html")) }, t("popupStandalone"));

  let scan: ScanResult | null = null;
  if (tabId !== undefined && match) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
      scan = await chrome.tabs.sendMessage<ScanResult>(tabId, { type: "iloathepdf:scan" } satisfies ContentRequest, { frameId: 0 });
    } catch {
      scan = null;
    }
  }
  if (!scan || !match) {
    fitSection.replaceChildren(heading, h("p", { class: "muted" }, t("popupCantRun")), standalone);
    return;
  }

  const count = scan.count;
  const summary = count === 0 ? t("popupNoFields") : count === 1 ? t("popupFieldsOne") : t("popupFieldsMany", count);
  const fitButton = count > 0 && h("button", {
    type: "button",
    class: "primary",
    onclick: async () => {
      await chrome.tabs.sendMessage(tabId!, { type: "iloathepdf:open" } satisfies ContentRequest, { frameId: 0 });
      window.close();
    },
  }, t("popupFitButton"));

  const siteBox = h("input", { type: "checkbox" });
  siteBox.checked = await isAlwaysOn(match).catch(() => false);
  const allBox = h("input", { type: "checkbox" });
  allBox.checked = await isAlwaysOn(ALL_SITES).catch(() => false);
  const note = h("p", { class: "small muted", role: "status" });
  const toggle = (box: HTMLInputElement, pattern: string) => async () => {
    note.textContent = "";
    try {
      if (box.checked) {
        if (!(await enableAlways(pattern))) {
          box.checked = false;
          note.textContent = t("popupNotGranted");
        }
      } else {
        await disableAlways(pattern);
      }
    } catch (e) {
      box.checked = !box.checked;
      note.textContent = t("errGeneric", e instanceof Error ? e.message : String(e));
    }
  };
  siteBox.addEventListener("change", toggle(siteBox, match));
  allBox.addEventListener("change", toggle(allBox, ALL_SITES));

  fitSection.replaceChildren(
    heading,
    h("p", {}, summary),
    h("div", { class: "row" }, fitButton, standalone),
    h("label", { class: "row small" }, siteBox, t("popupAlwaysSite", scan.host)),
    h("label", { class: "row small" }, allBox, t("popupAlwaysAll")),
    note,
  );
}

function notifyChanged() {
  void chrome.runtime.sendMessage({ type: "iloathepdf:images-changed" }).catch(() => {});
}

async function makePdf(images: StoredImage[], button: HTMLButtonElement) {
  button.disabled = true;
  status = null;
  button.textContent = t("popupMaking");
  try {
    const files = images.map((img) => new File([img.blob], img.name, { type: img.blob.type }));
    const result = await imagesToPdfEngine({ files, options: { page_size: pageSize, outputName: "images" } });
    const out = result.files[0];
    const url = URL.createObjectURL(out.blob);
    const a = h("a", { href: url, download: out.name });
    document.body.append(a);
    a.click();
    a.remove();
    // The download needs the URL a little while after the click.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status = { text: t("popupSaved", out.name), tone: "ok" };
  } catch (e) {
    status = { text: t("errGeneric", e instanceof Error ? e.message : String(e)), tone: "error" };
  }
  await renderImages();
}

async function renderImages() {
  while (urls.length) URL.revokeObjectURL(urls.pop()!);
  const images = await listImages().catch(() => [] as StoredImage[]);

  const picker = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
  picker.addEventListener("change", async () => {
    for (const file of Array.from(picker.files ?? [])) {
      if (PDF_IMAGE_TYPES.has(file.type)) await addImage({ name: file.name, blob: file, source: "" });
    }
    notifyChanged();
    await renderImages();
  });
  const addButton = h("button", { type: "button", onclick: () => picker.click() }, t("popupAddFromComputer"));

  const rows = images.map((img, i) => {
    const url = URL.createObjectURL(img.blob);
    urls.push(url);
    const act = (fn: () => Promise<void>) => async () => {
      await fn();
      notifyChanged();
      await renderImages();
    };
    return h("li", { class: "row" },
      h("img", { class: "thumb", src: url, alt: "" }),
      h("div", { class: "grow" },
        h("div", { class: "name", title: img.source || img.name }, img.name),
        h("div", { class: "small muted" }, formatBytes(img.blob.size)),
      ),
      h("button", { type: "button", class: "icon", title: t("popupMoveUp"), "aria-label": `${t("popupMoveUp")}: ${img.name}`, disabled: i === 0, onclick: act(() => moveImage(img.id, -1)) }, "↑"),
      h("button", { type: "button", class: "icon", title: t("popupMoveDown"), "aria-label": `${t("popupMoveDown")}: ${img.name}`, disabled: i === images.length - 1, onclick: act(() => moveImage(img.id, 1)) }, "↓"),
      h("button", { type: "button", class: "icon", title: t("popupRemove"), "aria-label": `${t("popupRemove")}: ${img.name}`, onclick: act(() => removeImage(img.id)) }, "✕"),
    );
  });

  const size = h("select", { "aria-label": t("pageSizeLabel") },
    h("option", { value: "a4" }, t("pageA4")),
    h("option", { value: "letter" }, t("pageLetter")),
    h("option", { value: "fit" }, t("pageFit")),
  );
  size.value = pageSize;
  size.addEventListener("change", () => (pageSize = size.value as PageSize));
  const make = h("button", { type: "button", class: "primary" }, t("popupMakePdf"));
  make.addEventListener("click", () => void makePdf(images, make));

  const parts: (HTMLElement | false | null)[] = [
    h("h2", { id: "img-h" }, t("popupImagesHeading")),
    images.length === 0
      ? h("p", { class: "muted small" }, t("popupImagesEmpty"))
      : h("ul", { class: "stack", style: "list-style:none;margin:0;padding:0;max-height:260px;overflow:auto" }, ...rows),
    status && h("p", { class: `notice ${status.tone}`, role: status.tone === "error" ? "alert" : "status" }, status.text),
    images.length > 0 && h("div", { class: "row" }, h("label", { class: "field grow" }, t("pageSizeLabel"), size)),
    h("div", { class: "row", style: "flex-wrap:wrap" },
      images.length > 0 && make,
      addButton,
      images.length > 0 && h("button", { type: "button", class: "link", onclick: async () => { await clearImages(); status = null; notifyChanged(); await renderImages(); } }, t("popupClear")),
      picker,
    ),
  ];
  imagesSection.replaceChildren(...parts.filter((p): p is HTMLElement => Boolean(p)));
}

document.title = "iLoathePDF";
void renderImages();
void renderFit();
void initEngineStrings();
