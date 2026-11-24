/**
 * Puts files into a page's <input type="file"> the way a user's pick would:
 * a DataTransfer's FileList, then the input and change events that React,
 * Angular, Vue and plain listeners wait for. (React handles "change" on file
 * inputs without its value tracker, so a dispatched event is enough.)
 */
export function setInputFiles(input: HTMLInputElement, files: File[]): boolean {
  if (!input.isConnected || input.type !== "file" || input.disabled) return false;
  if (files.length > 1 && !input.multiple) return false;
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  if ((input.files?.length ?? 0) !== files.length) return false;
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  return true;
}
