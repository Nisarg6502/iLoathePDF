import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { RecipeDemo } from "./RecipeDemo";

describe("RecipeDemo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const text = () => document.body.textContent ?? "";

  it("describes the animation for assistive tech", () => {
    render(<RecipeDemo />);
    expect(screen.getByRole("img", { name: /Scan to Searchable PDF recipe/ })).toBeInTheDocument();
  });

  it("walks through the three steps, shrinks the file, then loops", () => {
    render(<RecipeDemo />);
    expect(text()).toContain("3 photos");
    expect(text()).toContain("8.4 MB");

    advance(1000); // stage 1: first step running
    expect(text()).toContain("working…");

    advance(1300); // stage 2: first step done, compress running
    advance(1300); // stage 3: compress finished
    expect(text()).toContain("scan.pdf");
    expect(text()).toContain("1.1 MB");

    advance(1300); // stage 4: everything done
    expect(text()).toContain("DONE · ON THIS MACHINE");
    expect(text()).toContain("searchable");

    advance(3400); // loops back to the start
    expect(text()).toContain("3 photos");
    expect(text()).toContain("READY");
  });
});
