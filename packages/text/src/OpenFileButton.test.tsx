import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OpenFileButton } from "./OpenFileButton";
import type { OpenPdf } from "./extractText";

/** A PDF with no text layer, like a scan. */
const emptyPdf: OpenPdf = async () => ({ numPages: 1, pageText: async () => [], close: async () => {} });

function setup(pickFile?: () => Promise<File | null>) {
  const onText = vi.fn();
  render(
    <MemoryRouter>
      <OpenFileButton onText={onText} openPdf={emptyPdf} ocrPath="/somewhere/ocr" pick={pickFile} />
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
    pick(new File(["%PDF"], "scan.pdf", { type: "application/pdf" }));
    const link = await screen.findByRole("link", { name: "run OCR first" });
    expect(link).toHaveAttribute("href", "/somewhere/ocr");
    expect(screen.getByRole("status")).toHaveTextContent("No text found in this PDF. If it's a scan, run OCR first.");
    expect(onText).not.toHaveBeenCalled();
  });

  it("uses the app's own picker when it has one, and does nothing when it's cancelled", async () => {
    const picked: (File | null)[] = [null, new File(["from the dialog"], "a.txt", { type: "text/plain" })];
    const { onText, input } = setup(async () => picked.shift() ?? null);
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Open file" }));
    await waitFor(() => expect(picked).toHaveLength(1));
    expect(onText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open file" }));
    await waitFor(() => expect(onText).toHaveBeenCalledWith("from the dialog", "a.txt"));
    expect(click).not.toHaveBeenCalled();
  });
});
