import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PDFDocument } from "pdf-lib";
import { OpenFileButton } from "./OpenFileButton";

function setup() {
  const onText = vi.fn();
  render(
    <MemoryRouter>
      <OpenFileButton onText={onText} />
    </MemoryRouter>,
  );
  const input = screen.getByTestId("open-file-input") as HTMLInputElement;
  const pick = (f: File) => fireEvent.change(input, { target: { files: [f] } });
  return { onText, input, pick };
}

describe("OpenFileButton", () => {
  it("opens the file picker for supported types and hands back the text", async () => {
    const { onText, input, pick } = setup();
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Open file" }));
    expect(click).toHaveBeenCalled();
    expect(input.accept).toContain(".docx");

    pick(new File(["one two three"], "notes.txt", { type: "text/plain" }));
    await waitFor(() => expect(onText).toHaveBeenCalledWith("one two three", "notes.txt"));
    expect(screen.getByRole("button", { name: "Open file" })).toBeEnabled();
  });

  it("shows an error for an unsupported file and does not call onText", async () => {
    const { onText, pick } = setup();
    pick(new File(["x"], "photo.png", { type: "image/png" }));
    expect(await screen.findByText(/isn't supported/)).toHaveClass("text-danger");
    expect(onText).not.toHaveBeenCalled();
  });

  it("points to OCR when a PDF has no text", async () => {
    const { onText, pick } = setup();
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    pick(new File([(await doc.save()) as BlobPart], "scan.pdf", { type: "application/pdf" }));
    const link = await screen.findByRole("link", { name: "run OCR first" });
    expect(link).toHaveAttribute("href", "/tools/ocr");
    expect(screen.getByRole("status")).toHaveTextContent("No text found in this PDF. If it's a scan, run OCR first.");
    expect(onText).not.toHaveBeenCalled();
  });
});
