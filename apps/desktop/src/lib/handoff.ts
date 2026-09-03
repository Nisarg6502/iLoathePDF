/**
 * Carries files from the home screen's drop into the tool workspace.
 *
 * Router state cannot do this: under Tauri a picked file is a path, but in the
 * browser it is a live `File` object, and `history.state` must be structured-
 * cloneable and survives reloads — a stale File handle silently pointing at
 * nothing is worse than no handoff at all. A module-level slot that is emptied
 * on read keeps the lifetime obvious.
 */
import type { PickedFile } from "@/components/FileDropZone";

let pending: PickedFile[] | null = null;

export function setPendingFiles(files: PickedFile[]): void {
  pending = files.length ? files : null;
}

/** Returns the pending files exactly once; subsequent calls return []. */
export function takePendingFiles(): PickedFile[] {
  const files = pending ?? [];
  pending = null;
  return files;
}
