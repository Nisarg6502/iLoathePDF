import type { FieldConstraints } from "../content/context";

/** Messages the popup and background send to the content script (chrome.tabs.sendMessage). */
export type ContentRequest =
  | { type: "iloathepdf:scan" }
  | { type: "iloathepdf:open"; index?: number }
  | { type: "iloathepdf:toast"; text: string; tone?: "info" | "error" };

export interface ScanResult {
  count: number;
  host: string;
}

/** Content script -> fitter iframe, once, with a MessagePort for the replies. */
export interface FitterInit {
  type: "iloathepdf:init";
  constraints: FieldConstraints;
  host: string;
}

/** Fitter -> content script, over the MessagePort. */
export type FitterMessage = { type: "apply"; files: File[] } | { type: "close" };

/** Content script -> fitter, over the MessagePort. */
export type FitterReply = { type: "applied"; ok: boolean; gone?: boolean };

export const CONTENT_SCRIPT = "content.js";

/** Background -> converter page (offscreen.html), for "Save image as ...". */
export interface ConverterRequest {
  type: "iloathepdf:convert";
  /** The image, as a data: URL: extension messages carry JSON only. */
  dataUrl: string;
  name: string;
  format: import("./saveFormats").SaveFormat;
}

/** Converter page -> background. The blob: URL lives in the converter page. */
export type ConverterReply = { ok: true; url: string; name: string } | { ok: false; error: string };
