import { beforeEach, describe, it, expect } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecipesIndex } from "./RecipesIndex";
import { RECIPES, recipeHasPreviewStep } from "@/recipes/registry";
import { saveCustomRecipe } from "@/recipes/customRecipes";

const renderIndex = () =>
  render(
    <MemoryRouter>
      <RecipesIndex />
    </MemoryRouter>,
  );

describe("RecipesIndex", () => {
  beforeEach(() => localStorage.clear());

  it("links a desktop-only recipe's card to /download and shows DesktopOnlyBadge", () => {
    const desktopOnlyRecipe = RECIPES.find((r) => r.status === "desktop-only")!;
    renderIndex();
    const card = screen.getByText(desktopOnlyRecipe.title).closest("a");
    expect(card).toHaveAttribute("href", "/download");
    expect(within(card as HTMLElement).getByText("DESKTOP ONLY")).toBeInTheDocument();
  });

  it("links a live recipe's card to its own page, with a preview badge when a step is preview-quality", () => {
    const previewRecipe = RECIPES.find((r) => r.status === "live" && recipeHasPreviewStep(r))!;
    renderIndex();
    const card = screen.getByText(previewRecipe.title).closest("a");
    expect(card).toHaveAttribute("href", `/recipes/${previewRecipe.slug}`);
    expect(within(card as HTMLElement).getByText("PREVIEW")).toBeInTheDocument();
  });

  it("filters by category and by search", async () => {
    renderIndex();
    fireEvent.click(screen.getByRole("tab", { name: /Privacy & passwords/ }));
    expect(screen.getByText("Merge and lock")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Passport photo under 50 KB")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
    fireEvent.change(screen.getByLabelText("Search recipes"), { target: { value: "aadhaar" } });
    expect(screen.getByText("Unlock and shrink")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Merge and lock")).not.toBeInTheDocument());
  });

  it("shows the user's own recipes first", () => {
    saveCustomRecipe({ title: "Counter photo", description: "my usual", steps: [{ tool: "compress-images" }] });
    renderIndex();
    expect(screen.getByRole("tab", { name: /Your recipes/ })).toBeInTheDocument();
    expect(screen.getByText("Counter photo").closest("a")?.getAttribute("href")).toMatch(/^\/recipes\/custom-/);
  });
});
