export type TintKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";

export function tintColor(tint: TintKey): string {
  return `var(--tint-${tint})`;
}

export function tintWash(tint: TintKey, percent: number = 10, base: string = "var(--surface)"): string {
  return `color-mix(in oklch, var(--tint-${tint}) ${percent}%, ${base})`;
}

export function tintButtonBg(tint: TintKey): string {
  return `var(--tint-${tint}-btn)`;
}
