import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RecipeDetail } from "./RecipeDetail";
import { RECIPES } from "@/recipes/registry";

describe("RecipeDetail", () => {
  it("renders the desktop-only explanation for a desktop-only recipe", () => {
    const desktopOnlyRecipe = RECIPES.find((r) => r.status === "desktop-only");
    if (!desktopOnlyRecipe) throw new Error("Expected at least one desktop-only recipe for this test.");

    render(
      <MemoryRouter initialEntries={[`/recipes/${desktopOnlyRecipe.slug}`]}>
        <Routes>
          <Route path="/recipes/:slug" element={<RecipeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("DESKTOP ONLY")).toBeInTheDocument();
    expect(screen.getByText(/Get the desktop app/i)).toBeInTheDocument();
    expect(screen.queryByText(/drop a file/i)).not.toBeInTheDocument();
  });

  it("merge-first recipe needs at least two PDFs to run, like standalone Merge and the desktop app", async () => {
    render(
      <MemoryRouter initialEntries={["/recipes/merge-compress"]}>
        <Routes>
          <Route path="/recipes/:slug" element={<RecipeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const pdf = (name: string) => new File(["x"], name, { type: "application/pdf" });
    const input = screen.getByTestId("file-input");

    fireEvent.change(input, { target: { files: [pdf("a.pdf")] } });
    await screen.findByText("a.pdf");
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText(/at least two PDFs/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.change(await screen.findByTestId("file-input"), { target: { files: [pdf("a.pdf"), pdf("b.pdf")] } });
    await screen.findByText("b.pdf");
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    expect(screen.queryByText(/at least two PDFs/)).not.toBeInTheDocument();
  });
});
