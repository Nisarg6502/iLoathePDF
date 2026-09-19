import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecipesIndex } from "./RecipesIndex";
import { RECIPES, recipeHasPreviewStep } from "@/recipes/registry";

describe("RecipesIndex", () => {
  it("links a desktop-only recipe's card to /download and shows DesktopOnlyBadge", () => {
    const desktopOnlyRecipe = RECIPES.find((r) => r.status === "desktop-only");
    if (!desktopOnlyRecipe) throw new Error("Expected at least one desktop-only recipe in RECIPES for this test.");

    render(
      <MemoryRouter>
        <RecipesIndex />
      </MemoryRouter>,
    );

    const card = screen.getByText(desktopOnlyRecipe.title).closest("a");
    expect(card).toHaveAttribute("href", "/download");

    const cardScope = within(card as HTMLElement);
    expect(cardScope.getByText("DESKTOP ONLY")).toBeInTheDocument();
    expect(cardScope.getByText("Desktop only →")).toBeInTheDocument();
  });

  it("still links a live recipe's card to its own /recipes/:slug route", () => {
    const liveRecipe = RECIPES.find((r) => r.status === "live");
    if (!liveRecipe) throw new Error("Expected at least one live recipe in RECIPES for this test.");

    render(
      <MemoryRouter>
        <RecipesIndex />
      </MemoryRouter>,
    );

    const card = screen.getByText(liveRecipe.title).closest("a");
    expect(card).toHaveAttribute("href", `/recipes/${liveRecipe.slug}`);
  });

  it("shows PreviewBadge on a live recipe card whose steps include a preview-quality tool", () => {
    const previewRecipe = RECIPES.find((r) => r.status === "live" && recipeHasPreviewStep(r));
    if (!previewRecipe) throw new Error("Expected at least one live recipe with a preview step in RECIPES for this test.");

    render(
      <MemoryRouter>
        <RecipesIndex />
      </MemoryRouter>,
    );

    const card = screen.getByText(previewRecipe.title).closest("a");
    expect(within(card as HTMLElement).getByText("PREVIEW")).toBeInTheDocument();
  });
});
