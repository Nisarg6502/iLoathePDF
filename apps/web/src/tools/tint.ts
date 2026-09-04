export type TintKey = "a" | "b" | "c" | "d" | "e" | "f" | "g";

export function tintColor(tint: TintKey): string {
  return `var(--tint-${tint})`;
}

export function tintWash(tint: TintKey, percent: number = 10): string {
  return `color-mix(in oklch, var(--tint-${tint}) ${percent}%, var(--surface))`;
}
