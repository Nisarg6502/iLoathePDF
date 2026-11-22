import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { RecipeDemo, STAGES } from "./RecipeDemo";

describe("RecipeDemo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const text = () => document.body.textContent ?? "";
  let stage = 0;
  // Each stage's timer is scheduled by an effect after the previous one fires, so advance one stage per act().
  const toStage = (n: number) => {
    while (stage < n) act(() => vi.advanceTimersByTime(STAGES[stage++].ms));
  };
  beforeEach(() => {
    stage = 0;
  });

  it("describes the animation for assistive tech", () => {
    render(<RecipeDemo />);
    expect(screen.getByRole("img", { name: /building a recipe/ })).toBeInTheDocument();
  });

  it("drags tools into the chain, greying out tools that no longer fit", () => {
    render(<RecipeDemo />);
    expect(text()).toContain("No steps yet");
    expect(text()).toContain("Drag a tool here");

    toStage(2);
    expect(text()).toContain("Drop to add Images to PDF");
    toStage(3);
    expect(text()).toContain("Ready · 1 step");
    expect(text()).toContain("Greyed tools can't follow the last step.");
  });

  it("trips the OCR-then-Compress rule, fixes it, then runs", () => {
    render(<RecipeDemo />);
    toStage(9);
    expect(text()).toContain("1 thing to check");
    expect(text()).toContain("Move OCR to the end");

    toStage(11);
    expect(text()).toContain("Ready · 3 steps");

    toStage(15);
    expect(text()).toContain("working…");

    toStage(18);
    expect(text()).toContain("DONE · ON THIS DEVICE");
    expect(text()).toContain("1.1 MB");

    act(() => vi.advanceTimersByTime(STAGES[18].ms)); // loops back
    expect(text()).toContain("No steps yet");
  });
});
