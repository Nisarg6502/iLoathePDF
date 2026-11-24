// Runs after the website's test setup (see vitest.config.ts).
//
// pdf.js uses Math.sumPrecise (ES2026) when it opens an encrypted PDF; the
// Node version running the tests doesn't have it yet. Browsers that run the
// extension do. A plain sum is precise enough for a test.
if (typeof (Math as unknown as { sumPrecise?: unknown }).sumPrecise !== "function") {
  (Math as unknown as { sumPrecise: (values: Iterable<number>) => number }).sumPrecise = (values) => {
    let total = 0;
    for (const v of values) total += v;
    return total;
  };
}
