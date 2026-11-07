import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompressImagesOptions } from "./CompressImagesOptions";
import { makeTestImageFile } from "@/engines/testHelpers";

function Harness({ files }: { files: File[] }) {
  const [options, setOptions] = useState<Record<string, unknown>>({ quality: 75, format: "keep", maxDimension: null });
  return <CompressImagesOptions options={options} onChange={setOptions} disabled={false} files={files} />;
}

async function noisyJpeg(name: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 90;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(120, 90);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    img.data[i] = seed & 255;
    img.data[i + 1] = (seed >> 8) & 255;
    img.data[i + 2] = (seed >> 16) & 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("x"))), "image/jpeg", 0.95));
  return new File([blob], name, { type: "image/jpeg" });
}

describe("CompressImagesOptions", () => {
  it("prompts for images when none are added", () => {
    render(<Harness files={[]} />);
    expect(screen.getByTestId("size-estimate")).toHaveTextContent(/add images/i);
  });

  it("shows a labelled size estimate that updates when the slider moves", async () => {
    const file = await noisyJpeg("photo.jpg");
    render(<Harness files={[file]} />);

    const estimate = screen.getByTestId("size-estimate");
    await waitFor(() => expect(estimate).toHaveTextContent(/≈/), { timeout: 3000 });
    expect(estimate).toHaveTextContent(/estimate/i);
    const first = estimate.textContent;

    fireEvent.change(screen.getByLabelText("Quality"), { target: { value: "10" } });
    await waitFor(() => expect(estimate).toHaveTextContent(/smaller than/), { timeout: 3000 });
    expect(estimate.textContent).not.toBe(first);
  });

  it("explains that PNG output ignores quality", async () => {
    const png = await makeTestImageFile(20, 20, "a.png");
    render(<Harness files={[png]} />);
    expect(screen.getByText(/PNG is lossless/i)).toBeInTheDocument();
  });
});
