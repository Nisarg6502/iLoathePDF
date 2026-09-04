import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToolPage } from "./ToolPage";
import type { ToolConfig } from "@/tools/ToolConfig";

function makeTool(overrides: Partial<ToolConfig> = {}): ToolConfig {
  return {
    slug: "test-tool",
    name: "Test Tool",
    description: "A tool for testing.",
    category: "pdf",
    Icon: () => <svg />,
    accept: [".pdf"],
    multiple: false,
    defaultOptions: {},
    OptionsPanel: () => <div>options</div>,
    engine: async () => ({
      files: [{ name: "out.pdf", blob: new Blob(["x"]) }],
      summary: "Done",
      isPreview: false,
    }),
    status: "live",
    ...overrides,
  };
}

describe("ToolPage", () => {
  it("starts empty, moves to ready after a file is added, and to done after run", async () => {
    const tool = makeTool();
    render(<ToolPage tool={tool} />);

    expect(screen.getByText(/drop a file here/i)).toBeInTheDocument();

    const file = new File(["content"], "input.pdf", { type: "application/pdf" });
    const input = screen.getByTestId("file-input");
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("input.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
    expect(screen.getByText("out.pdf")).toBeInTheDocument();
  });

  it("shows an error state when the engine throws", async () => {
    const tool = makeTool({
      engine: async () => {
        throw new Error("boom");
      },
    });
    render(<ToolPage tool={tool} />);

    const file = new File(["content"], "input.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: /run/i }));

    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
