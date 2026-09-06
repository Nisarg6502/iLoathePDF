import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageEditModal } from "./ImageEditModal";
import { DEFAULT_IMAGE_EDIT } from "@/tools/imageEdit";
import { makeTestPng } from "@/engines/testHelpers";

function makeFile() {
  return new File([makeTestPng() as BlobPart], "a.png", { type: "image/png" });
}

describe("ImageEditModal", () => {
  it("applies a 90 degree rotation when Rotate right then Apply is clicked", async () => {
    const onApply = vi.fn();
    render(<ImageEditModal file={makeFile()} edit={DEFAULT_IMAGE_EDIT} onApply={onApply} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByText("Rotate right"));
    fireEvent.click(screen.getByText("Apply"));

    expect(onApply).toHaveBeenCalledWith({ rotate: 90, crop: null });
  });

  it("wraps rotation from 270 back to 0", async () => {
    const onApply = vi.fn();
    render(
      <ImageEditModal file={makeFile()} edit={{ rotate: 270, crop: null }} onApply={onApply} onClose={vi.fn()} />,
    );

    fireEvent.click(await screen.findByText("Rotate right"));
    fireEvent.click(screen.getByText("Apply"));

    expect(onApply).toHaveBeenCalledWith({ rotate: 0, crop: null });
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    render(<ImageEditModal file={makeFile()} edit={DEFAULT_IMAGE_EDIT} onApply={vi.fn()} onClose={onClose} />);

    fireEvent.click(await screen.findByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("Reset clears rotation back to 0 before Apply", async () => {
    const onApply = vi.fn();
    render(
      <ImageEditModal file={makeFile()} edit={{ rotate: 180, crop: null }} onApply={onApply} onClose={vi.fn()} />,
    );

    fireEvent.click(await screen.findByText("Reset"));
    fireEvent.click(screen.getByText("Apply"));

    expect(onApply).toHaveBeenCalledWith({ rotate: 0, crop: null });
  });

  it("shows an error and allows Cancel when createImageBitmap fails to decode the image", async () => {
    const original = globalThis.createImageBitmap;
    globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error("decode failed"));
    const onClose = vi.fn();

    try {
      render(<ImageEditModal file={makeFile()} edit={DEFAULT_IMAGE_EDIT} onApply={vi.fn()} onClose={onClose} />);

      expect(
        await screen.findByText("Couldn't open this image. It may be corrupted or in an unsupported format."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Rotate right")).not.toBeInTheDocument();
      expect(screen.queryByText("Apply")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("Cancel"));
      expect(onClose).toHaveBeenCalled();
    } finally {
      globalThis.createImageBitmap = original;
    }
  });
});
