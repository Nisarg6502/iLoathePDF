import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadabilityPanel } from "./ReadabilityPanel";

const LONG =
  "Notwithstanding the considerable methodological limitations inherent in observational epidemiological investigations, " +
  "the accumulated evidence substantially indicates that prolonged occupational exposure to particulate contamination " +
  "significantly elevates the probability of developing chronic respiratory complications.";

describe("ReadabilityPanel", () => {
  it("asks for more text when there is too little", () => {
    render(<ReadabilityPanel text="Only a few words here." />);
    expect(screen.getByTestId("readability-note")).toHaveTextContent("Add a few more sentences for a readability score.");
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("says the score is for English when the text is in another script", () => {
    render(<ReadabilityPanel text={"यह पहला वाक्य है। ".repeat(20)} />);
    expect(screen.getByTestId("readability-note")).toHaveTextContent("Readability scores are for English text.");
  });

  it("shows the score, band, grade and stats for simple text", () => {
    render(<ReadabilityPanel text={"The cat sat on the mat. ".repeat(6)} />);
    // 116 is clamped to the 0–100 scale.
    expect(screen.getByTestId("reading-ease")).toHaveTextContent("100");
    expect(screen.getByRole("meter", { name: "Reading ease" })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("Very easy")).toBeInTheDocument();
    expect(screen.getByText("Easily understood by 11-year-olds.")).toBeInTheDocument();
    expect(screen.getByText("Grade level").nextElementSibling).toHaveTextContent("0.0");
    expect(screen.getByText("Average sentence").nextElementSibling).toHaveTextContent("6.0 words");
    expect(screen.getByText("Long sentences (over 25 words)").nextElementSibling).toHaveTextContent("0");
    expect(screen.queryByText("LONG SENTENCES")).toBeNull();
    expect(screen.getByText(/Flesch Reading Ease and Flesch–Kincaid/)).toBeInTheDocument();
  });

  it("quotes long sentences so the writer can find them", () => {
    render(<ReadabilityPanel text={`${LONG} Short one here.`} />);
    expect(screen.getByText("Very hard")).toBeInTheDocument();
    expect(screen.getByText("LONG SENTENCES")).toBeInTheDocument();
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent(/^“Notwithstanding the considerable/);
    expect(item).toHaveTextContent("31 words");
  });

  it("says how many long sentences are not shown", () => {
    render(<ReadabilityPanel text={`${LONG} `.repeat(7)} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Showing the first 5 of 7.")).toBeInTheDocument();
  });
});
