import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TextCompare } from "./TextCompare";

describe("TextCompare page", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows removed and added words inline, swaps and clears", async () => {
    const { container } = render(<TextCompare />);
    expect(screen.getByRole("heading", { level: 1, name: "Compare texts" })).toBeInTheDocument();
    expect(screen.getByText("Paste or type text in both boxes to see what changed.")).toBeInTheDocument();

    const original = screen.getByLabelText("Original");
    const changed = screen.getByLabelText("Changed");
    fireEvent.change(original, { target: { value: "The quick brown fox jumps." } });
    fireEvent.change(changed, { target: { value: "The slow red fox jumps high." } });

    await waitFor(() => expect(screen.getByTestId("compare-inline")).toBeInTheDocument());
    expect(screen.getByTestId("original-words")).toHaveTextContent("Words: 5");
    expect(screen.getByTestId("changed-words")).toHaveTextContent("Words: 6");

    const dels = [...container.querySelectorAll("del")].map((d) => d.textContent);
    const inss = [...container.querySelectorAll("ins")].map((d) => d.textContent);
    expect(dels).toEqual(["Removed: quick brown"]);
    expect(inss).toEqual(["Added: slow red", "Added:  high"]);

    const summary = screen.getByTestId("compare-summary");
    expect(screen.getByText("Words added").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Words removed").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Changes").nextElementSibling).toHaveTextContent("2");
    expect(summary).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(original).toHaveValue("The slow red fox jumps high.");
    expect(changed).toHaveValue("The quick brown fox jumps.");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(original).toHaveValue("");
    expect(changed).toHaveValue("");
    await waitFor(() => expect(screen.getByText("Paste or type text in both boxes to see what changed.")).toBeInTheDocument());
  });

  it("reports identical texts and honours the ignore options", async () => {
    render(<TextCompare />);
    fireEvent.change(screen.getByLabelText("Original"), { target: { value: "Hello   World" } });
    fireEvent.change(screen.getByLabelText("Changed"), { target: { value: "hello world" } });
    await waitFor(() => expect(screen.getByText("Changes").nextElementSibling).toHaveTextContent("1"));

    fireEvent.click(screen.getByLabelText("Ignore case"));
    fireEvent.click(screen.getByLabelText("Ignore extra spaces"));
    await waitFor(() => expect(screen.getByText("The texts are identical.")).toBeInTheDocument());
  });

  it("can show the two sides next to each other and remembers that choice", async () => {
    const { container } = render(<TextCompare />);
    fireEvent.change(screen.getByLabelText("Original"), { target: { value: "one two" } });
    fireEvent.change(screen.getByLabelText("Changed"), { target: { value: "one three" } });
    fireEvent.click(screen.getByRole("button", { name: "Side by side" }));

    await waitFor(() => expect(screen.getByTestId("compare-original-side")).toHaveTextContent("one Removed: two"));
    expect(screen.getByTestId("compare-changed-side")).toHaveTextContent("one Added: three");
    expect(container.querySelector("[data-testid=compare-original-side] ins")).toBeNull();
    expect(screen.getByRole("button", { name: "Side by side" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("iloathepdf.compare.view")).toBe("split");
    // The texts themselves are never stored.
    expect(Object.values({ ...localStorage }).join("")).not.toContain("one");
  });

  it("keeps spell check and writing-assistant extensions off both boxes", () => {
    render(<TextCompare />);
    for (const label of ["Original", "Changed"]) {
      const box = screen.getByLabelText(label);
      expect(box).toHaveAttribute("spellcheck", "false");
      expect(box).toHaveAttribute("data-gramm", "false");
      expect(box).toHaveAttribute("data-lt-active", "false");
    }
  });
});
