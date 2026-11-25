import { describe, it, expect } from "vitest";
import { initialPages, moveSelected, moveSelectedTo, rangeBetween, rotateSelected, toEngineOptions, toggleRemoved } from "./model";

const order = (pages: { index: number }[]) => pages.map((p) => p.index + 1);
const pages = initialPages(6); // pages 1..6

describe("moveSelected (drag and drop)", () => {
  it("moves one page forward or back to the slot it was dropped on", () => {
    expect(order(moveSelected(pages, new Set([0]), 3))).toEqual([2, 3, 1, 4, 5, 6]);
    expect(order(moveSelected(pages, new Set([4]), 1))).toEqual([1, 5, 2, 3, 4, 6]);
    expect(order(moveSelected(pages, new Set([2]), 6))).toEqual([1, 2, 4, 5, 6, 3]);
    expect(order(moveSelected(pages, new Set([2]), 0))).toEqual([3, 1, 2, 4, 5, 6]);
  });

  it("moves several pages together, in their order, even if they weren't next to each other", () => {
    expect(order(moveSelected(pages, new Set([0, 3]), 5))).toEqual([2, 3, 5, 1, 4, 6]);
    expect(order(moveSelected(pages, new Set([5, 1]), 0))).toEqual([2, 6, 1, 3, 4, 5]);
  });

  it("is a no-op when dropped where it already is", () => {
    expect(order(moveSelected(pages, new Set([2]), 2))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(order(moveSelected(pages, new Set([2]), 3))).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("moveSelectedTo (move to position)", () => {
  it("puts the selection at that position", () => {
    expect(order(moveSelectedTo(pages, new Set([5]), 1))).toEqual([6, 1, 2, 3, 4, 5]);
    expect(order(moveSelectedTo(pages, new Set([0, 1]), 3))).toEqual([3, 4, 1, 2, 5, 6]);
    expect(order(moveSelectedTo(pages, new Set([0]), 99))).toEqual([2, 3, 4, 5, 6, 1]);
  });
});

describe("rotate, remove, select", () => {
  it("rotates both ways and wraps", () => {
    const left = rotateSelected(pages, new Set([1]), -90);
    expect(left[1].rotate).toBe(270);
    expect(rotateSelected(left, new Set([1]), 90)[1].rotate).toBe(0);
  });

  it("removes a selection, and restores it when it is all removed already", () => {
    const removed = toggleRemoved(pages, new Set([1, 2]));
    expect(removed.filter((p) => p.removed).map((p) => p.index)).toEqual([1, 2]);
    expect(toggleRemoved(removed, new Set([1, 2])).some((p) => p.removed)).toBe(false);
    // Mixed selection: remove all of it.
    expect(toggleRemoved(removed, new Set([2, 3])).filter((p) => p.removed).map((p) => p.index)).toEqual([1, 2, 3]);
  });

  it("selects a range in the current order", () => {
    const moved = moveSelectedTo(pages, new Set([5]), 1); // 6,1,2,3,4,5
    expect([...rangeBetween(moved, 5, 1)].sort()).toEqual([0, 1, 5]);
  });

  it("builds the engine's options", () => {
    let p = moveSelectedTo(pages, new Set([2]), 1);
    p = rotateSelected(p, new Set([0]), 90);
    p = toggleRemoved(p, new Set([4]));
    expect(toEngineOptions(p)).toEqual({ order: [2, 0, 1, 3, 4, 5], rotate: { 0: 90 }, remove: [4] });
  });
});
