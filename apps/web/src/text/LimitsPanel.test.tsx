import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { textStats } from "@/lib/textStats";
import { LimitsPanel } from "./LimitsPanel";
import { LIMIT_STORAGE_KEY } from "./limits";

const statsOf = (chars: number, words = 0) => ({ ...textStats(""), characters: chars, words });

describe("LimitsPanel", () => {
  beforeEach(() => localStorage.clear());

  it("shows no bar until a limit is picked", () => {
    render(<LimitsPanel stats={statsOf(10)} />);
    expect(screen.getByLabelText("Limit")).toHaveValue("");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("switches presets and shows left, near and over", () => {
    const { rerender } = render(<LimitsPanel stats={statsOf(142)} />);
    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "x" } });

    const bar = screen.getByRole("progressbar", { name: "X (Twitter) post" });
    expect(bar).toHaveAttribute("aria-valuemax", "280");
    expect(bar).toHaveAttribute("aria-valuenow", "142");
    expect(bar).toHaveAttribute("data-state", "ok");
    expect(screen.getByTestId("limit-amount")).toHaveTextContent("142 / 280 characters");
    expect(screen.getByTestId("limit-status")).toHaveTextContent("138 left");
    expect(screen.getByText(/X counts every link as 23 characters/)).toBeInTheDocument();
    expect(localStorage.getItem(LIMIT_STORAGE_KEY)).toBe('{"preset":"x"}');

    rerender(<LimitsPanel stats={statsOf(260)} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("data-state", "near");

    rerender(<LimitsPanel stats={statsOf(292)} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("data-state", "over");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "280");
    expect(screen.getByTestId("limit-status")).toHaveTextContent("12 over");

    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "sms" } });
    expect(screen.getByRole("progressbar", { name: "SMS message" })).toHaveAttribute("aria-valuemax", "160");
    expect(screen.getByTestId("limit-status")).toHaveTextContent("132 over");

    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "" } });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(localStorage.getItem(LIMIT_STORAGE_KEY)).toBeNull();
  });

  it("takes a custom number of words or characters", () => {
    render(<LimitsPanel stats={statsOf(900, 120)} />);
    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "custom" } });

    const input = screen.getByLabelText("Custom limit");
    expect(input).toHaveValue("500");
    expect(screen.getByLabelText("Count")).toHaveValue("words");
    expect(screen.getByTestId("limit-amount")).toHaveTextContent("120 / 500 words");
    expect(screen.getByTestId("limit-status")).toHaveTextContent("380 left");

    fireEvent.change(input, { target: { value: "100" } });
    expect(screen.getByTestId("limit-status")).toHaveTextContent("20 over");

    fireEvent.change(screen.getByLabelText("Count"), { target: { value: "characters" } });
    expect(screen.getByTestId("limit-amount")).toHaveTextContent("900 / 100 characters");
    expect(JSON.parse(localStorage.getItem(LIMIT_STORAGE_KEY)!)).toEqual({ custom: { max: 100, unit: "characters" } });

    fireEvent.change(input, { target: { value: "0" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a whole number, 1 or more.")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    // The last usable limit stays remembered.
    expect(JSON.parse(localStorage.getItem(LIMIT_STORAGE_KEY)!)).toEqual({ custom: { max: 100, unit: "characters" } });
  });

  it("remembers the chosen target, and survives a corrupt or blocked store", () => {
    localStorage.setItem(LIMIT_STORAGE_KEY, '{"custom":{"max":1000,"unit":"characters"}}');
    const { unmount } = render(<LimitsPanel stats={statsOf(250)} />);
    expect(screen.getByLabelText("Custom limit")).toHaveValue("1000");
    expect(screen.getByTestId("limit-status")).toHaveTextContent("750 left");
    unmount();

    localStorage.setItem(LIMIT_STORAGE_KEY, "not json");
    render(<LimitsPanel stats={statsOf(250)} />);
    expect(screen.getByLabelText("Limit")).toHaveValue("");
  });
});
