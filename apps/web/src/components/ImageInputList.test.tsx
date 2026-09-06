import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageInputList } from "./ImageInputList";
import { makeTestPng } from "@/engines/testHelpers";

function makeFile(name: string) {
  return new File([makeTestPng() as BlobPart], name, { type: "image/png" });
}

describe("ImageInputList", () => {
  it("lists every file with an Edit button", () => {
    render(
      <ImageInputList files={[makeFile("a.png"), makeFile("b.png")]} options={{}} onChange={vi.fn()} disabled={false} />,
    );

    expect(screen.getByText("a.png")).toBeInTheDocument();
    expect(screen.getByText("b.png")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
  });

  it("shows an edit summary badge once an edit exists for that index", () => {
    render(
      <ImageInputList
        files={[makeFile("a.png")]}
        options={{ edits: { 0: { rotate: 90, crop: null } } }}
        onChange={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getByText(/rotated 90/)).toBeInTheDocument();
  });

  it("opens the editor and writes the applied edit back through onChange", async () => {
    const onChange = vi.fn();
    render(<ImageInputList files={[makeFile("a.png")]} options={{}} onChange={onChange} disabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByText("Rotate right"));
    fireEvent.click(screen.getByText("Apply"));

    expect(onChange).toHaveBeenCalledWith({ edits: { 0: { rotate: 90, crop: null } } });
  });

  it("disables the Edit button when disabled is true", () => {
    render(<ImageInputList files={[makeFile("a.png")]} options={{}} onChange={vi.fn()} disabled={true} />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  });

  it("preserves sibling option keys when applying an edit", async () => {
    const onChange = vi.fn();
    render(
      <ImageInputList
        files={[makeFile("a.png")]}
        options={{ margin: 10 }}
        onChange={onChange}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByText("Rotate right"));
    fireEvent.click(screen.getByText("Apply"));

    expect(onChange).toHaveBeenCalledWith({ margin: 10, edits: { 0: { rotate: 90, crop: null } } });
  });
});
