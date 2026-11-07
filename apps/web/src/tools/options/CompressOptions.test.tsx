import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompressOptions } from "./CompressOptions";
import { makeTestPdf } from "@/engines/testHelpers";

function Harness({ files }: { files: File[] }) {
  const [options, setOptions] = useState<Record<string, unknown>>({ dpi: 96 });
  return <CompressOptions options={options} onChange={setOptions} disabled={false} files={files} />;
}

describe("CompressOptions", () => {
  it("prompts for a PDF when none is added", () => {
    render(<Harness files={[]} />);
    expect(screen.getByTestId("size-estimate")).toHaveTextContent(/add a pdf/i);
  });

  it("shows a labelled size estimate that updates when the DPI slider moves", async () => {
    const bytes = await makeTestPdf(2);
    const file = new File([bytes as BlobPart], "in.pdf", { type: "application/pdf" });
    render(<Harness files={[file]} />);

    const box = screen.getByTestId("size-estimate");
    await waitFor(() => expect(box).toHaveTextContent(/≈/), { timeout: 8000 });
    expect(box).toHaveTextContent(/estimate/i);
    expect(box).toHaveTextContent(/96 DPI/);

    fireEvent.change(screen.getByLabelText("Image DPI"), { target: { value: "200" } });
    await waitFor(() => expect(box).toHaveTextContent(/200 DPI/), { timeout: 8000 });
  });
});
