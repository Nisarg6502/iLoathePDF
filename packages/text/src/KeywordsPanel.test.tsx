import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { KeywordsPanel } from "./KeywordsPanel";

const rowTexts = () =>
  within(screen.getByTestId("keyword-rows"))
    .getAllByRole("listitem")
    .map((li) => li.querySelector("[title]")?.textContent);

describe("KeywordsPanel", () => {
  beforeEach(() => localStorage.clear());

  it("shows an empty state with no text", () => {
    render(<KeywordsPanel text="" />);
    expect(screen.getByText("Your most-used words will show up here.")).toBeInTheDocument();
  });

  it("lists the most-used words with count and density", () => {
    render(<KeywordsPanel text="The cat sat. The cat ran. A dog sat." />);
    expect(rowTexts()).toEqual(["cat", "sat", "ran", "dog"]);
    const first = screen.getAllByRole("listitem")[0];
    expect(first).toHaveTextContent("2");
    expect(first).toHaveTextContent("22.2%");
  });

  it("switches phrase length and toggles common words", () => {
    render(<KeywordsPanel text="Word counter is handy. A word counter is fast." />);
    fireEvent.click(screen.getByRole("tab", { name: "2 words" }));
    expect(screen.getByRole("tab", { name: "2 words" })).toHaveAttribute("aria-selected", "true");
    expect(rowTexts()?.[0]).toBe("word counter");
    expect(rowTexts()).not.toContain("counter is");

    fireEvent.click(screen.getByLabelText("Hide common words"));
    expect(rowTexts()).toContain("counter is");
    // Only the on/off choice is stored, never the text.
    expect(localStorage.getItem("iloathepdf.wordCounter.hideCommon")).toBe("false");
    expect(JSON.stringify({ ...localStorage })).not.toContain("counter");
  });

  it("shows 10 rows, then up to 25 with Show more", () => {
    const text = Array.from({ length: 30 }, (_, i) => `term${i} term${i}`).join(" ");
    render(<KeywordsPanel text={text} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("says when only common words were found", () => {
    render(<KeywordsPanel text="the and of" />);
    expect(screen.getByText("Only common words so far.")).toBeInTheDocument();
  });
});
