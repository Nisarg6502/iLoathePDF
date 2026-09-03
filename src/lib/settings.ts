/**
 * Persisted preferences. Small enough to live in localStorage; nothing here is
 * secret and nothing leaves the machine.
 *
 * The output directory is the important one. Before it existed, results were
 * silently written beside the input and the only clue was a line of grey text
 * -- which is exactly how a converted file once appeared to vanish. Making the
 * destination explicit, visible and changeable is the fix.
 */
import { useCallback, useEffect, useState } from "react";

import { isTauri } from "./jobs";
import { baseName, dirName } from "./utils";

const OUTPUT_DIR_KEY = "iloathepdf.outputDir";

/** Fires when any hook instance changes the value, so every copy stays in step. */
const OUTPUT_DIR_EVENT = "iloathepdf:outputdir";

function read(): string | null {
  try {
    return localStorage.getItem(OUTPUT_DIR_KEY);
  } catch {
    return null;
  }
}

function write(value: string | null): void {
  try {
    if (value) localStorage.setItem(OUTPUT_DIR_KEY, value);
    else localStorage.removeItem(OUTPUT_DIR_KEY);
  } catch {
    /* preference is per-session then */
  }
  window.dispatchEvent(new CustomEvent(OUTPUT_DIR_EVENT));
}

/**
 * Where a job's results should go.
 *
 * `null` means "beside the input file", which stays the default: for a
 * one-off conversion it is almost always what you want, and it needs no setup.
 */
export function useOutputDir() {
  const [outputDir, setOutputDir] = useState<string | null>(read);

  useEffect(() => {
    const sync = () => setOutputDir(read());
    window.addEventListener(OUTPUT_DIR_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(OUTPUT_DIR_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((value: string | null) => {
    write(value);
    setOutputDir(value);
  }, []);

  const choose = useCallback(async () => {
    if (!isTauri()) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") set(picked);
  }, [set]);

  return {
    outputDir,
    /** Short form for the status bar: the last two path segments. */
    label: outputDir ? shortenPath(outputDir) : "Next to input",
    set,
    choose,
    clear: useCallback(() => set(null), [set]),
  };
}

/** "C:\Users\me\Documents\iLoathePDF" -> "Documents\iLoathePDF" */
export function shortenPath(path: string): string {
  const parent = baseName(dirName(path));
  const leaf = baseName(path);
  return parent ? `${parent}\\${leaf}` : leaf;
}

/**
 * Resolve where a job writes. Read at run time rather than from a hook, so the
 * job layer does not need React.
 */
export function resolveOutputDir(inputPath: string): string | null {
  return read() ?? (dirName(inputPath) || null);
}
