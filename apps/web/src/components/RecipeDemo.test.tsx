import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { RecipeDemo } from "./RecipeDemo";

// Stage lengths in RecipeDemo.tsx. Each stage's timer is scheduled by an
// effect after the previous one fires, so the test must advance one stage per act().
const STAGE_MS = [1100, 1000, 1000, 1000, 1200, 1000, 1300, 1300, 3600];
const TAP_DELAY_MS = 380;

describe("RecipeDemo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const text = () => document.body.textContent ?? "";
  /** Move to the start of stage `n` from the start of stage `n - 1`. */
  let stage = 0;
  const toStage = (n: number) => {
    while (stage < n) advance(STAGE_MS[stage++]);
  };

  beforeEach(() => {
    stage = 0;
  });

  it("describes the animation for assistive tech", () => {
    render(<RecipeDemo />);
    expect(screen.getByRole("img", { name: /building a recipe/ })).toBeInTheDocument();
  });

  it("starts in an empty builder, then chains tools one by one", () => {
    render(<RecipeDemo />);
    expect(text()).toContain("New recipe");
    expect(text()).toContain("No steps yet");
    expect(text()).toContain("START WITH");

    toStage(1);
    advance(TAP_DELAY_MS);
    expect(text()).toContain("1 STEP");
    expect(text()).toContain("THEN");

    toStage(2);
    advance(TAP_DELAY_MS);
    expect(text()).toContain("2 STEPS");

    toStage(3);
    advance(TAP_DELAY_MS);
    expect(text()).toContain("3 STEPS");
    expect(text()).toContain("OCR");
  });

  it("saves the recipe, runs the chain, shrinks the file, then loops", () => {
    render(<RecipeDemo />);
    toStage(4);
    expect(text()).toContain("SAVED");
    expect(text()).toContain("Scan to Searchable PDF");

    toStage(5);
    expect(text()).toContain("Your recipes");
    expect(text()).toContain("working…");

    toStage(7);
    expect(text()).toContain("1.1 MB");

    toStage(8);
    expect(text()).toContain("DONE · ON THIS MACHINE");
    expect(text()).toContain("searchable");

    advance(STAGE_MS[8]); // loops back to the empty builder
    expect(text()).toContain("No steps yet");
  });
});
