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
    tint: "a",
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

  it("offers camera scan and an image edit list for image-category tools", async () => {
    const tool = makeTool({ category: "image", accept: [".png"], multiple: true });
    render(<ToolPage tool={tool} />);

    expect(screen.getByRole("button", { name: /scan with camera/i })).toBeInTheDocument();

    const file = new File(["content"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("lets image tools reorder and remove files, and returns to the drop zone when the last is removed", async () => {
    const tool = makeTool({ category: "image", accept: [".png"], multiple: true });
    render(<ToolPage tool={tool} />);

    const png = (name: string) => new File([new Uint8Array([1])], name, { type: "image/png" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [png("a.png"), png("b.png")] } });

    await screen.findByText("a.png");
    const order = () => screen.getAllByRole("button", { name: /^Move .* up$/ }).map((b) => b.getAttribute("aria-label"));
    expect(order()).toEqual(["Move a.png up", "Move b.png up"]);

    fireEvent.click(screen.getByRole("button", { name: "Move b.png up" }));
    await waitFor(() => expect(order()).toEqual(["Move b.png up", "Move a.png up"]));

    fireEvent.click(screen.getByRole("button", { name: "Remove b.png" }));
    await waitFor(() => expect(screen.queryByText("b.png")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Remove a.png" }));

    expect(await screen.findByText(/drop a file here/i)).toBeInTheDocument();
  });

  it("merge: reorders and removes PDFs, and needs at least two to run", async () => {
    const tool = makeTool({ slug: "merge", accept: [".pdf"], multiple: true });
    render(<ToolPage tool={tool} />);

    const pdf = (name: string) => new File(["x"], name, { type: "application/pdf" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [pdf("a.pdf"), pdf("b.pdf")] } });
    await screen.findByText("a.pdf");

    fireEvent.click(screen.getByRole("button", { name: "Move b.pdf up" }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /^Move .* up$/ }).map((b) => b.getAttribute("aria-label"))).toEqual([
        "Move b.pdf up",
        "Move a.pdf up",
      ]),
    );
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove a.pdf" }));
    await waitFor(() => expect(screen.queryByText("a.pdf")).toBeNull());
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText(/at least two PDFs/)).toBeInTheDocument();
  });

  it("ignores dropped files of the wrong type and says so", async () => {
    render(<ToolPage tool={makeTool({ accept: [".pdf"] })} />);
    const zone = screen.getByText(/drop a file here/i).closest("div[class*='cursor-pointer']")!;

    const png = new File(["x"], "pic.png", { type: "image/png" });
    fireEvent.drop(zone, { dataTransfer: { files: [png] } });

    expect(await screen.findByText(/1 file was skipped/)).toBeInTheDocument();
    expect(screen.getByText(/drop a file here/i)).toBeInTheDocument(); // still on the empty step
  });

  it("does not offer camera scan for pdf-category tools", () => {
    const tool = makeTool({ category: "pdf" });
    render(<ToolPage tool={tool} />);
    expect(screen.queryByRole("button", { name: /scan with camera/i })).not.toBeInTheDocument();
  });
});
