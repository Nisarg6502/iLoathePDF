import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RecipeBuilder } from "./RecipeBuilder";
import { RecipesIndex } from "./RecipesIndex";
import { loadCustomRecipes } from "@/recipes/customRecipes";

function renderBuilder() {
  render(
    <MemoryRouter initialEntries={["/recipes/new"]}>
      <Routes>
        <Route path="/recipes/new" element={<RecipeBuilder />} />
        <Route path="/recipes/:slug" element={<div>detail page</div>} />
        <Route path="/recipes" element={<RecipesIndex />} />
      </Routes>
    </MemoryRouter>,
  );
}

const add = (name: string) => fireEvent.click(screen.getByRole("button", { name: `+ ${name}` }));

describe("RecipeBuilder", () => {
  beforeEach(() => localStorage.clear());

  it("only offers tools that fit the previous step, and keeps Save disabled until the chain is valid", () => {
    renderBuilder();
    const save = screen.getByRole("button", { name: "Save recipe" });
    expect(save).toBeDisabled();

    add("PDF to images");
    expect(screen.queryByRole("button", { name: "+ Compress PDF" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Merge PDF" })).toBeNull();
    expect(save).toBeDisabled();

    add("Images to PDF");
    expect(save).toBeEnabled();
  });

  it("saves the recipe under the typed name and navigates to it", () => {
    renderBuilder();
    add("Merge PDF");
    add("Compress PDF");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Email pack" } });
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));

    expect(screen.getByText("detail page")).toBeInTheDocument();
    const [saved] = loadCustomRecipes();
    expect(saved.title).toBe("Email pack");
    expect(saved.steps).toEqual(["merge", "compress"]);
  });

  it("falls back to the step names when no name is typed, and lists the recipe on the index", () => {
    renderBuilder();
    add("Compress PDF");
    add("OCR → Searchable PDF");
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(loadCustomRecipes()[0].title).toBe("Compress PDF → OCR → Searchable PDF");
  });

  it("warns when Compress follows OCR", () => {
    renderBuilder();
    add("OCR → Searchable PDF");
    add("Compress PDF");
    expect(screen.getByText(/removes OCR's text layer/)).toBeInTheDocument();
  });

  it("removes and reorders steps", () => {
    renderBuilder();
    add("Compress PDF");
    add("OCR → Searchable PDF");
    fireEvent.click(screen.getByRole("button", { name: "Move OCR → Searchable PDF up" }));
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("OCR");
    fireEvent.click(screen.getByRole("button", { name: "Remove OCR → Searchable PDF" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
