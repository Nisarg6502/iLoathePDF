import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WordCounter } from "./WordCounter";

describe("WordCounter page", () => {
  it("counts what you type and clears", async () => {
    render(<WordCounter />);
    const box = screen.getByLabelText("Your text");
    expect(screen.getByTestId("word-count")).toHaveTextContent("0");

    fireEvent.change(box, { target: { value: "One two three. Four five!\n\nSix." } });
    await waitFor(() => expect(screen.getByTestId("word-count")).toHaveTextContent("6"));
    expect(screen.getByTestId("char-count")).toHaveTextContent("31");
    expect(screen.getByText("Sentences").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Paragraphs").nextElementSibling).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(screen.getByTestId("word-count")).toHaveTextContent("0"));
    expect(box).toHaveValue("");
  });

  it("keeps spell check and writing-assistant extensions off the text", () => {
    render(<WordCounter />);
    const box = screen.getByLabelText("Your text");
    expect(box).toHaveAttribute("spellcheck", "false");
    expect(box).toHaveAttribute("data-gramm", "false");
    expect(box).toHaveAttribute("data-lt-active", "false");
  });
});
