import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToolsIndex } from "./ToolsIndex";
import { TOOLS } from "@/tools/registry";

describe("ToolsIndex", () => {
  it("links a desktop-only tool's card to /download and shows DesktopOnlyBadge, not PreviewBadge", () => {
    const desktopOnlyTool = TOOLS.find((t) => t.status === "desktop-only");
    if (!desktopOnlyTool) throw new Error("Expected at least one desktop-only tool in TOOLS for this test.");

    render(
      <MemoryRouter>
        <ToolsIndex />
      </MemoryRouter>,
    );

    const card = screen.getByText(desktopOnlyTool.name).closest("a");
    expect(card).toHaveAttribute("href", "/download");

    const cardScope = within(card as HTMLElement);
    expect(cardScope.getByText("DESKTOP ONLY")).toBeInTheDocument();
    expect(cardScope.getByText("Desktop only →")).toBeInTheDocument();
    expect(cardScope.queryByText("PREVIEW")).not.toBeInTheDocument();
  });

  it("still links a live tool's card to its own /tools/:slug route", () => {
    const liveTool = TOOLS.find((t) => t.status === "live");
    if (!liveTool) throw new Error("Expected at least one live tool in TOOLS for this test.");

    render(
      <MemoryRouter>
        <ToolsIndex />
      </MemoryRouter>,
    );

    const card = screen.getByText(liveTool.name).closest("a");
    expect(card).toHaveAttribute("href", `/tools/${liveTool.slug}`);
  });
});
