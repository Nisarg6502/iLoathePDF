import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WordCounter as Page } from "./WordCounter";

const WordCounter = () => (
  <MemoryRouter>
    <Page />
  </MemoryRouter>
);

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

  it("counts the selected part of the text", async () => {
    render(<WordCounter />);
    const box = screen.getByLabelText<HTMLTextAreaElement>("Your text");
    fireEvent.change(box, { target: { value: "alpha beta gamma delta" } });
    expect(screen.queryByTestId("selection-count")).toBeNull();

    box.setSelectionRange(6, 16);
    fireEvent.select(box);
    expect(await screen.findByTestId("selection-count")).toHaveTextContent("2 words · 10 characters");

    box.setSelectionRange(3, 3);
    fireEvent.select(box);
    await waitFor(() => expect(screen.queryByTestId("selection-count")).toBeNull());
  });

  it("can undo Clear, and typing drops the undo", async () => {
    render(<WordCounter />);
    const box = screen.getByLabelText("Your text");
    fireEvent.change(box, { target: { value: "keep me" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(box).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(box).toHaveValue("keep me");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.change(box, { target: { value: "new" } });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  describe("Save text", () => {
    const KEY = "iloathepdf.wordCounter.savedText";
    const stored = () => {
      const raw = localStorage.getItem(KEY);
      return raw === null ? null : (JSON.parse(raw) as { text: string }).text;
    };
    beforeEach(() => localStorage.clear());

    it("is off by default and stores nothing", async () => {
      render(<WordCounter />);
      fireEvent.change(screen.getByLabelText("Your text"), { target: { value: "private draft" } });
      await new Promise((r) => setTimeout(r, 500));
      expect(stored()).toBeNull();
      expect(screen.getByRole("button", { name: "Save text" })).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByTestId("privacy-note")).toHaveTextContent("never uploaded or saved");
    });

    it("keeps the text across a reload until it is turned off", async () => {
      const first = render(<WordCounter />);
      fireEvent.change(screen.getByLabelText("Your text"), { target: { value: "one two" } });
      fireEvent.click(screen.getByRole("button", { name: "Save text" }));
      expect(stored()).toBe("one two");
      expect(screen.getByTestId("privacy-note")).toHaveTextContent("Saved in this browser only");

      fireEvent.change(screen.getByLabelText("Your text"), { target: { value: "one two three" } });
      await waitFor(() => expect(stored()).toBe("one two three"));
      first.unmount();

      render(<WordCounter />);
      expect(screen.getByLabelText("Your text")).toHaveValue("one two three");
      const saved = screen.getByRole("button", { name: "Saved" });
      expect(saved).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(saved);
      expect(stored()).toBeNull();
      expect(screen.getByRole("button", { name: "Save text" })).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByLabelText("Your text")).toHaveValue("one two three");
    });

    it("writes straight away when the page is being left", () => {
      render(<WordCounter />);
      fireEvent.click(screen.getByRole("button", { name: "Save text" }));
      fireEvent.change(screen.getByLabelText("Your text"), { target: { value: "last words" } });
      window.dispatchEvent(new Event("pagehide"));
      expect(stored()).toBe("last words");
    });

    it("Clear empties the saved copy but keeps saving on", async () => {
      render(<WordCounter />);
      fireEvent.change(screen.getByLabelText("Your text"), { target: { value: "gone soon" } });
      fireEvent.click(screen.getByRole("button", { name: "Save text" }));
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
      await waitFor(() => expect(stored()).toBe(""));
      expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
    });
  });

  it("keeps spell check and writing-assistant extensions off the text", () => {
    render(<WordCounter />);
    const box = screen.getByLabelText("Your text");
    expect(box).toHaveAttribute("spellcheck", "false");
    expect(box).toHaveAttribute("data-gramm", "false");
    expect(box).toHaveAttribute("data-lt-active", "false");
  });
});
