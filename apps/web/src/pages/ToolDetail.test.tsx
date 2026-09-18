import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ToolDetail } from "./ToolDetail";
import { TOOLS } from "@/tools/registry";

describe("ToolDetail", () => {
  it("renders the desktop-only explanation instead of ToolPage for a desktop-only tool", () => {
    const desktopOnlyTool = TOOLS.find((t) => t.status === "desktop-only");
    if (!desktopOnlyTool) throw new Error("Expected at least one desktop-only tool in TOOLS for this test.");

    render(
      <MemoryRouter initialEntries={[`/tools/${desktopOnlyTool.slug}`]}>
        <Routes>
          <Route path="/tools/:slug" element={<ToolDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("DESKTOP ONLY")).toBeInTheDocument();
    expect(screen.getByText(/Get the desktop app/i)).toBeInTheDocument();
    expect(screen.queryByText(/drop a file/i)).not.toBeInTheDocument();
  });
});
