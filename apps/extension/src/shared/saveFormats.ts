/** The formats "Save image as ..." offers. No engines here: the background worker imports this. */
export type SaveFormat = "pdf" | "jpg" | "png";

export const SAVE_FORMATS: readonly SaveFormat[] = ["pdf", "jpg", "png"];

/** "photo.webp" -> "photo.pdf"; adds the extension to a name without one. */
export function renameFor(name: string, format: SaveFormat): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "") || "image";
  return `${base}.${format}`;
}
