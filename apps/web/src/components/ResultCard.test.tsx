import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultCard } from "./ResultCard";

const blobOf = (n: number) => new Blob([new Uint8Array(n)]);

describe("ResultCard sizes", () => {
  it("shows the size of a single output before the download button", () => {
    render(
      <ResultCard
        result={{ files: [{ name: "out.pdf", blob: blobOf(2048) }], summary: "Done", isPreview: false }}
        onReset={() => {}}
      />,
    );
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.queryByTestId("result-total")).not.toBeInTheDocument();
  });

  it("shows each file's size and the total for multi-file results", () => {
    render(
      <ResultCard
        result={{
          files: [
            { name: "a.png", blob: blobOf(1500) },
            { name: "b.png", blob: blobOf(2_500_000) },
          ],
          summary: "2 pages",
          isPreview: false,
        }}
        onReset={() => {}}
      />,
    );
    expect(screen.getByText("1.5 KB")).toBeInTheDocument();
    expect(screen.getByText("2.50 MB")).toBeInTheDocument();
    expect(screen.getByTestId("result-total")).toHaveTextContent("2 files · 2.50 MB total");
  });

  it("prefers a file's own detail line when the engine provides one", () => {
    render(
      <ResultCard
        result={{ files: [{ name: "a.jpg", blob: blobOf(500), detail: "3.1 MB → 500 B · 99% smaller" }], summary: "x", isPreview: false }}
        onReset={() => {}}
      />,
    );
    expect(screen.getByText("3.1 MB → 500 B · 99% smaller")).toBeInTheDocument();
  });
});
