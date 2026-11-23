import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { i18n, languageFromWindowsLcid, matchLanguage, setLanguage, Trans } from "@iloathepdf/i18n";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { FileDropZone } from "@/components/FileDropZone";

describe("language matching", () => {
  it("picks the first candidate we have a catalog for, by base language", () => {
    expect(matchLanguage(["de-DE", "mr-IN", "en"])).toBe("mr");
    expect(matchLanguage([null, "", "es_MX"])).toBe("es");
    expect(matchLanguage(["fr-CA"])).toBe("fr");
    expect(matchLanguage(["de", "ta"])).toBeNull();
  });

  it("maps the installer's Windows language id to one of ours", () => {
    expect(languageFromWindowsLcid(1081)).toBe("hi"); // hi-IN
    expect(languageFromWindowsLcid(1033)).toBe("en"); // en-US
    expect(languageFromWindowsLcid(2057)).toBe("en"); // en-GB
    expect(languageFromWindowsLcid(1036)).toBe("fr"); // fr-FR
    expect(languageFromWindowsLcid(3082)).toBe("es"); // es-ES
    expect(languageFromWindowsLcid(1102)).toBe("mr"); // mr-IN
    expect(languageFromWindowsLcid(1099)).toBe("kn"); // kn-IN
    expect(languageFromWindowsLcid(1031)).toBeNull(); // de-DE: not offered
    expect(languageFromWindowsLcid(null)).toBeNull();
  });
});

describe("switching language", () => {
  afterEach(async () => {
    await setLanguage("en");
    localStorage.clear();
  });

  it("re-renders the header in the chosen language and remembers the choice", async () => {
    render(
      <MemoryRouter>
        <SiteHeader />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "hi" } });

    expect(await screen.findByRole("link", { name: "प्राइवेसी" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "भाषा" })).toHaveValue("hi");
    expect(document.documentElement.lang).toBe("hi");
    expect(localStorage.getItem("iloathepdf.language")).toBe("hi");
  });

  it("uses plural forms with the count filled in", async () => {
    const { container } = render(<FileDropZone accept={[".pdf"]} multiple onFiles={() => {}} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const drop = (names: string[]) =>
      fireEvent.change(input, { target: { files: names.map((n) => new File(["x"], n)) } });

    drop(["a.png"]);
    expect(screen.getByRole("status")).toHaveTextContent("1 file was skipped. Accepted: .pdf");
    drop(["a.png", "b.png"]);
    expect(screen.getByRole("status")).toHaveTextContent("2 files were skipped. Accepted: .pdf");

    await setLanguage("hi");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 फ़ाइलें छोड़ दी गईं। स्वीकार्य: .pdf"));
  });

  it("renders a sentence with markup from its English key when there is no translation", () => {
    const { container } = render(
      <p>
        <Trans i18nKey="Press <b>Run again</b> to update it." components={{ b: <strong /> }} />
      </p>,
    );
    expect(container.querySelector("p")).toHaveTextContent("Press Run again to update it.");
    expect(container.querySelector("strong")).toHaveTextContent("Run again");
  });

  it("falls back to the English text for a string with no translation", async () => {
    await setLanguage("hi");
    expect(i18n.t("A sentence nobody has translated yet.")).toBe("A sentence nobody has translated yet.");
  });
});
