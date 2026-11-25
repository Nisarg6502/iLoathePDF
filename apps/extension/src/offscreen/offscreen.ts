/**
 * The converter page behind "Save image as PDF / JPG / PNG". The background
 * worker sends it the image as a data: URL (extension messages carry text
 * only); it converts the image here, where there is a canvas, and answers
 * with a blob: URL the worker hands to the downloads API. Nothing leaves the
 * computer.
 */
import { initEngineStrings } from "../ui/dom";
import { convertImage, SAVE_FORMATS, type SaveFormat } from "../shared/saveImage";
import type { ConverterReply, ConverterRequest } from "../shared/messages";

/** Long enough for the download to read it; then the memory is released. */
const KEEP_URL_MS = 5 * 60_000;

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const message = raw as ConverterRequest;
  if (message?.type !== "iloathepdf:convert") return;
  void (async () => {
    try {
      if (!SAVE_FORMATS.includes(message.format as SaveFormat)) throw new Error(`Unknown format ${message.format}`);
      const blob = await (await fetch(message.dataUrl)).blob();
      const out = await convertImage(new File([blob], message.name, { type: blob.type }), message.format);
      const url = URL.createObjectURL(out);
      setTimeout(() => URL.revokeObjectURL(url), KEEP_URL_MS);
      sendResponse({ ok: true, url, name: out.name } satisfies ConverterReply);
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies ConverterReply);
    }
  })();
  return true;
});

void initEngineStrings();
// Firefox hosts this page in a frame and waits for this before using it.
void chrome.runtime.sendMessage({ type: "iloathepdf:converter-ready" }).catch(() => {});
