import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TransformMenu } from "./TransformMenu";

function setup(text = "hello world. bye", disabled?: boolean) {
  const onChange = vi.fn();
  render(<TransformMenu text={text} onChange={onChange} disabled={disabled} />);
  const button = screen.getByRole("button", { name: "Change text" });
  return { onChange, button };
}

describe("TransformMenu", () => {
  it("opens a menu, applies the picked change and closes", () => {
    const { onChange, button } = setup();
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Change text" });
    expect(menu).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(7);
    expect(screen.getByRole("menuitem", { name: "UPPERCASE" })).toHaveFocus();

    fireEvent.click(screen.getByRole("menuitem", { name: "Sentence case" }));
    expect(onChange).toHaveBeenCalledWith("Hello world. Bye");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("runs the PDF line-break fix", () => {
    const { onChange, button } = setup("one exam-\nple\nhere\n\nnext");
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove line breaks" }));
    expect(onChange).toHaveBeenCalledWith("one example here\n\nnext");
  });

  it("does not call onChange when nothing changes", () => {
    const { onChange, button } = setup("ALREADY LOUD");
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name: "UPPERCASE" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("moves with arrow keys and closes on Escape", () => {
    const { onChange, button } = setup();
    fireEvent.keyDown(button, { key: "ArrowUp" });
    const items = screen.getAllByRole("menuitem");
    expect(items[items.length - 1]).toHaveFocus();

    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes when clicking outside", () => {
    const { button } = setup();
    fireEvent.click(button);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("is disabled when asked to", () => {
    expect(setup("text", true).button).toBeDisabled();
  });

  it("is disabled with no text", () => {
    expect(setup("").button).toBeDisabled();
  });
});
