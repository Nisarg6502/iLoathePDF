/** "1.2 MB", "340 KB", "812 B" — decimal units, matching how OS file managers show sizes. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 2 : 1)} MB`;
}

/** Percent smaller as a whole number; no savings gives 0. */
export function percentSmaller(before: number, after: number): number {
  if (before <= 0 || after >= before) return 0;
  return Math.round((1 - after / before) * 100);
}
