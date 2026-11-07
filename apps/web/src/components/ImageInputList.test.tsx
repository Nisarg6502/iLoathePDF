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

  describe("when it can change the file list", () => {
    function setup(opts: { edits?: Record<number, unknown> } = {}) {
      const files = [makeFile("a.png"), makeFile("b.png"), makeFile("c.png")];
      const onChange = vi.fn();
      const onFilesChange = vi.fn();
      render(
        <ImageInputList
          files={files}
          options={{ margin_mm: 5, ...(opts.edits ? { edits: opts.edits } : {}) }}
          onChange={onChange}
          onFilesChange={onFilesChange}
          accept={[".png"]}
          disabled={false}
        />,
      );
      return { files, onChange, onFilesChange };
    }

    it("moves an image down and carries its edit with it", () => {
      const { files, onChange, onFilesChange } = setup({ edits: { 0: { rotate: 90, crop: null } } });

      fireEvent.click(screen.getByRole("button", { name: "Move a.png down" }));

      expect(onFilesChange).toHaveBeenCalledWith([files[1], files[0], files[2]]);
      expect(onChange).toHaveBeenCalledWith({ margin_mm: 5, edits: { 1: { rotate: 90, crop: null } } });
    });

    it("cannot move the first image up or the last image down", () => {
      setup();
      expect(screen.getByRole("button", { name: "Move a.png up" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Move c.png down" })).toBeDisabled();
    });

    it("removes one image and re-keys the edits after it", () => {
      const { files, onChange, onFilesChange } = setup({
        edits: { 0: { rotate: 90, crop: null }, 2: { rotate: 180, crop: null } },
      });

      fireEvent.click(screen.getByRole("button", { name: "Remove b.png" }));

      expect(onFilesChange).toHaveBeenCalledWith([files[0], files[2]]);
      expect(onChange).toHaveBeenCalledWith({
        margin_mm: 5,
        edits: { 0: { rotate: 90, crop: null }, 1: { rotate: 180, crop: null } },
      });
    });

    it("appends newly picked images and skips duplicates and unsupported types", () => {
      const { files, onFilesChange } = setup();
      const input = screen.getByTestId("add-images-input");
      const fresh = makeFile("d.png");
      const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" });

      fireEvent.change(input, { target: { files: [fresh, pdf, files[0]] } });

      expect(onFilesChange).toHaveBeenCalledTimes(1);
      expect(onFilesChange).toHaveBeenCalledWith([...files, fresh]);
    });
  });

  it("shows no list controls when the page does not manage the file list", () => {
    render(<ImageInputList files={[makeFile("a.png")]} options={{}} onChange={vi.fn()} disabled={false} />);
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByText(/Add more images/)).toBeNull();
  });
});
