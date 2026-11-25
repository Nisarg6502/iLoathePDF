/**
 * The "Images to PDF" list. Kept in the extension's own IndexedDB, which the
 * background worker and the popup share (same extension origin). IndexedDB
 * rather than chrome.storage: storage.session and storage.local are capped
 * near 10 MB, which a few phone photos would fill, and IndexedDB stores
 * Blobs as they are instead of as base64 text. Nothing here leaves the
 * computer; the popup's "Clear" empties it.
 */
export interface StoredImage {
  id: string;
  order: number;
  name: string;
  blob: Blob;
  /** Where it was found, shown as a hint. Empty for images added from disk. */
  source: string;
  addedAt: number;
}

const DB = "iloathepdf-extension";
const STORE = "images";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = body(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function listImages(): Promise<StoredImage[]> {
  const all = (await run<StoredImage[]>("readonly", (s) => s.getAll())) ?? [];
  return all.sort((a, b) => a.order - b.order);
}

export async function addImage(image: Omit<StoredImage, "id" | "order" | "addedAt">): Promise<number> {
  const all = await listImages();
  const order = all.length > 0 ? all[all.length - 1].order + 1 : 0;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await run("readwrite", (s) => s.put({ ...image, id, order, addedAt: Date.now() } satisfies StoredImage));
  return all.length + 1;
}

export async function removeImage(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

/** Moves an image one place up (-1) or down (+1). */
export async function moveImage(id: string, delta: -1 | 1): Promise<void> {
  const all = await listImages();
  const next = reorder(all, id, delta);
  await run("readwrite", (s) => {
    next.forEach((img, order) => s.put({ ...img, order }));
  });
}

export async function clearImages(): Promise<void> {
  await run("readwrite", (s) => s.clear());
}

export async function countImages(): Promise<number> {
  return (await run<number>("readonly", (s) => s.count())) ?? 0;
}

/** The list with `id` moved by `delta`, clamped at the ends. */
export function reorder<T extends { id: string }>(items: readonly T[], id: string, delta: number): T[] {
  const out = [...items];
  const from = out.findIndex((i) => i.id === id);
  if (from < 0) return out;
  const to = Math.min(out.length - 1, Math.max(0, from + delta));
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

/** A file name for an image from its URL and type: "https://x/a/cat.png?w=2" -> "cat.png". */
export function imageNameFromUrl(url: string, type: string, fallbackIndex: number): string {
  const ext = type === "image/jpeg" ? "jpg" : type.startsWith("image/") ? type.slice(6).replace("+xml", "") : "img";
  let base = "";
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") base = decodeURIComponent(u.pathname.split("/").pop() ?? "");
  } catch {
    /* data: or malformed */
  }
  base = base.replace(/[\\/:*?"<>|]+/g, "").trim();
  if (!base) return `image-${fallbackIndex}.${ext}`;
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${ext}`;
}
