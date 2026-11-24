/**
 * How the text tools get files in the desktop app. The window takes file drops
 * natively (the page never sees them) and hands over paths, so the word
 * counter needs the app's own dialog and drop events, and reads the file
 * through the same command the PDF tools use.
 */
import type { TextFileSource } from "@iloathepdf/text";
import { msg } from "@iloathepdf/i18n/msg";
import { tr } from "@iloathepdf/i18n";
import { isTauri, readFileBytes } from "./jobs";
import { pickedFromPaths } from "../components/FileDropZone";

const EXTENSIONS = ["txt", "md", "csv", "pdf", "docx"];
const FILTER_NAME = msg("Text, PDF and Word files");

async function fileFromPath(path: string): Promise<File> {
  const [picked] = pickedFromPaths([path]);
  return new File([await readFileBytes(picked)], picked.name);
}

const tauriTextFiles: TextFileSource = {
  async pick() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: tr(FILTER_NAME), extensions: EXTENSIONS }],
    });
    return typeof path === "string" ? fileFromPath(path) : null;
  },

  onDrop({ over, leave, drop }) {
    let stopped = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
      getCurrentWebview()
        .onDragDropEvent((event) => {
          const p = event.payload as { type: string; paths?: string[] };
          if (p.type === "enter" || p.type === "over") over();
          else if (p.type === "drop" && p.paths?.length) drop(fileFromPath(p.paths[0]));
          else leave();
        })
        .then((un) => {
          if (stopped) un();
          else unlisten = un;
        }),
    );
    return () => {
      stopped = true;
      unlisten?.();
    };
  },
};

/** The app's own file dialog and window drop; undefined in a plain browser, where the page handles both. */
export const textFiles: TextFileSource | undefined = isTauri() ? tauriTextFiles : undefined;
