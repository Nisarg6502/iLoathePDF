import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RecipeBuilder } from "./RecipeBuilder";
import { loadCustomRecipes, encodeShare } from "@/recipes/customRecipes";

function renderBuilder(entry = "/recipes/new") {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/recipes/new" element={<RecipeBuilder />} />
        <Route path="/recipes/:slug/edit" element={<RecipeBuilder />} />
        <Route path="/recipes/:slug" element={<div>detail page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const add = (name: string) => fireEvent.click(screen.getByRole("button", { name: `Add ${name}` }));
const stepNames = () => screen.queryAllByRole("button", { name: /^Settings for / }).map((b) => b.getAttribute("aria-label")!.replace("Settings for ", ""));

describe("RecipeBuilder", () => {
  beforeEach(() => localStorage.clear());

  it("adds tools from the palette and refuses ones that don't fit, saying why", async () => {
    renderBuilder();
    const save = screen.getByRole("button", { name: "Save recipe" });
    expect(save).toBeDisabled();

    add("PDF to images");
    expect(stepNames()).toEqual(["PDF to images"]);
    expect(save).toBeEnabled();

    // Compress needs a PDF, and only images come out of the last step.
    expect(screen.getByRole("button", { name: "Add Compress PDF" })).toHaveTextContent("Needs a PDF");
    add("Compress PDF");
    expect(stepNames()).toEqual(["PDF to images"]);
    expect(await screen.findByText(/hands over images, but Compress PDF needs a PDF/)).toBeInTheDocument();

    add("Images to PDF");
    expect(stepNames()).toEqual(["PDF to images", "Images to PDF"]);
  });

  it("marks a broken order in red and fixes it in one click", async () => {
    renderBuilder();
    add("Compress PDF");
    add("PDF to images");
    fireEvent.click(screen.getByRole("button", { name: "Move PDF to images up" }));
    expect(stepNames()).toEqual(["PDF to images", "Compress PDF"]);
    expect(screen.getByRole("button", { name: "Save recipe" })).toBeDisabled();
    expect(screen.getByText("1 problem to fix")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Insert Images to PDF between them" }));
    await waitFor(() => expect(stepNames()).toEqual(["PDF to images", "Images to PDF", "Compress PDF"]));
    expect(screen.getByRole("button", { name: "Save recipe" })).toBeEnabled();
  });

  it("explains why OCR can't follow a text-adding step", async () => {
    renderBuilder();
    add("TXT to PDF");
    expect(screen.getByRole("button", { name: "Add OCR → Searchable PDF" })).toHaveAttribute("aria-description", expect.stringMatching(/already has text/));
  });

  it("saves the recipe with each step's settings and navigates to it", async () => {
    renderBuilder();
    add("Merge PDF");
    add("Compress PDF");
    fireEvent.click(screen.getByRole("button", { name: "Settings for Compress PDF" }));
    fireEvent.change(await screen.findByLabelText("Image DPI"), { target: { value: "72" } });
    expect(screen.getByText(/72 DPI · smallest file/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Email pack" } });
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));

    expect(screen.getByText("detail page")).toBeInTheDocument();
    const [saved] = loadCustomRecipes();
    expect(saved.title).toBe("Email pack");
    expect(saved.steps).toEqual([{ tool: "merge" }, { tool: "compress", options: { dpi: 72 } }]);
  });

  it("falls back to the step names when no name is typed", () => {
    renderBuilder();
    add("Compress PDF");
    add("OCR → Searchable PDF");
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(loadCustomRecipes()[0].title).toBe("Compress PDF → OCR → Searchable PDF");
  });

  it("warns when Compress follows OCR, and can move OCR to the end", async () => {
    renderBuilder();
    add("OCR → Searchable PDF");
    add("Compress PDF");
    expect(screen.getByText(/wipes out the text layer OCR added/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move OCR to the end" }));
    await waitFor(() => expect(stepNames()).toEqual(["Compress PDF", "OCR → Searchable PDF"]));
  });

  it("removes steps", async () => {
    renderBuilder();
    add("Compress PDF");
    add("OCR → Searchable PDF");
    fireEvent.click(screen.getByRole("button", { name: "Remove OCR → Searchable PDF" }));
    await waitFor(() => expect(stepNames()).toEqual(["Compress PDF"]));
  });

  it("starts from a ready-made recipe to customize", () => {
    renderBuilder("/recipes/new?from=passport-photo-small");
    expect(screen.getByRole("heading", { name: "Customize recipe" })).toBeInTheDocument();
    expect(stepNames()).toEqual(["Convert images", "Compress images"]);
    expect(screen.getByLabelText("Name")).toHaveValue("Passport photo under 50 KB (my version)");
  });

  it("opens a shared link", () => {
    const code = encodeShare({ title: "Shop stamp", description: "", steps: [{ tool: "merge" }, { tool: "compress" }] });
    renderBuilder(`/recipes/new#r=${code}`);
    expect(screen.getByRole("heading", { name: "Shared recipe" })).toBeInTheDocument();
    expect(stepNames()).toEqual(["Merge PDF", "Compress PDF"]);
  });

  it("offers templates when empty", () => {
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: /Unlock and shrink/ }));
    expect(stepNames()).toEqual(["Protect & Unlock PDF", "Compress PDF"]);
    expect(screen.getByText(/Asks for the PDF's password when you run it/)).toBeInTheDocument();
  });
});
