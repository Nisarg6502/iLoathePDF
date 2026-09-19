import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
