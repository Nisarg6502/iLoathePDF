import { beforeEach, describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RecipeDetail } from "./RecipeDetail";
import { RECIPES } from "@/recipes/registry";
import { loadCustomRecipes } from "@/recipes/customRecipes";

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/recipes/:slug" element={<RecipeDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const pdf = (name: string) => new File(["x"], name, { type: "application/pdf" });

describe("RecipeDetail", () => {
  beforeEach(() => localStorage.clear());

  it("renders the desktop-only explanation for a desktop-only recipe", () => {
    const desktopOnlyRecipe = RECIPES.find((r) => r.status === "desktop-only")!;
    renderAt(`/recipes/${desktopOnlyRecipe.slug}`);
    expect(screen.getByText("DESKTOP ONLY")).toBeInTheDocument();
    expect(screen.getByText(/Get the desktop app/i)).toBeInTheDocument();
  });

  it("merge-first recipe needs at least two PDFs to run", async () => {
    renderAt("/recipes/merge-compress");
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [pdf("a.pdf")] } });
    await screen.findByText("a.pdf");
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText(/at least two PDFs/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.change(await screen.findByTestId("file-input"), { target: { files: [pdf("a.pdf"), pdf("b.pdf")] } });
    await screen.findByText("b.pdf");
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
  });

  it("asks for the password before running a lock step, and keeps it out of storage", async () => {
    renderAt("/recipes/merge-and-lock");
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [pdf("a.pdf"), pdf("b.pdf")] } });
    await screen.findByText("b.pdf");
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText(/Step 2: Set a password/)).toBeInTheDocument();

    // The step that needs input is opened for you.
    fireEvent.change(await screen.findByPlaceholderText("At least 4 characters"), { target: { value: "pass1234" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat the password"), { target: { value: "pass1234" } });
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    expect(screen.queryByText(/Save as my recipe/)).not.toBeInTheDocument();
  });

  it("lets you change a step's settings for this run and save them as your own recipe", async () => {
    renderAt("/recipes/merge-compress");
    fireEvent.click(screen.getByRole("button", { name: "Step 2: Compress PDF" }));
    fireEvent.change(await screen.findByLabelText("Image DPI"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as my recipe" }));
    const [mine] = loadCustomRecipes();
    expect(mine.steps[1]).toEqual({ tool: "compress", options: { dpi: 150 } });
  });
});
