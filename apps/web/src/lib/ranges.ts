/**
 * Parses a 1-based, human page-range spec ("1-3,5,7-9") into deduplicated
 * zero-based page indices, in the order the spec lists them. An empty spec
 * means every page.
 */
export function parseRanges(spec: string, pageCount: number): number[] {
  const trimmed = spec.trim();
  if (trimmed === "") {
    return Array.from({ length: pageCount }, (_, i) => i);
  }

  const seen = new Set<number>();
  const result: number[] = [];

  for (const part of trimmed.split(",")) {
    const piece = part.trim();
    const rangeMatch = /^(\d+)-(\d+)$/.exec(piece);
    const singleMatch = /^(\d+)$/.exec(piece);

    let start: number;
    let end: number;
    if (rangeMatch) {
      start = Number(rangeMatch[1]);
      end = Number(rangeMatch[2]);
    } else if (singleMatch) {
      start = end = Number(singleMatch[1]);
    } else {
      throw new RangeError(`Invalid page range segment: "${piece}"`);
    }

    if (start < 1 || end < 1 || start > pageCount || end > pageCount) {
      throw new RangeError(
        `Page range "${piece}" is outside 1-${pageCount}`,
      );
    }

    const step = start <= end ? 1 : -1;
    for (let p = start; step > 0 ? p <= end : p >= end; p += step) {
      const index = p - 1;
      if (!seen.has(index)) {
        seen.add(index);
        result.push(index);
      }
    }
  }

  return result;
}
