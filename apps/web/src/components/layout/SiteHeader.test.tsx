import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SiteHeader } from "./SiteHeader";
import { TOOLS } from "@/tools/registry";

// jsdom has no PointerEvent, so fireEvent drops `pointerType`; provide a minimal one.
class TestPointerEvent extends MouseEvent {
  pointerType: string;
  constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "";
  }
}
vi.stubGlobal("PointerEvent", TestPointerEvent);

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderHeader() {
  return render(
    <MemoryRouter>
      <SiteHeader />
      <Where />
    </MemoryRouter>,
  );
}

const toolsLink = () => screen.getByRole("link", { name: /^Tools$/ });

describe("SiteHeader", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the primary nav without a redundant Compress link", () => {
    renderHeader();

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(toolsLink()).toHaveAttribute("href", "/tools");
    expect(screen.getByRole("link", { name: "How it works" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Compress" })).not.toBeInTheDocument();
  });

  it("keeps the tools menu closed until the pointer hovers Tools", () => {
    renderHeader();

    expect(toolsLink()).toHaveAttribute("aria-haspopup", "menu");
    expect(toolsLink()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("lists every tool from the registry when Tools is hovered", () => {
    renderHeader();
    fireEvent.pointerEnter(toolsLink(), { pointerType: "mouse" });

    expect(toolsLink()).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Tools" });
    const items = within(menu).getAllByRole("menuitem");
    for (const tool of TOOLS) {
      const expected = tool.status === "desktop-only" ? "/download" : `/tools/${tool.slug}`;
      const item = items.find((el) => el.textContent?.startsWith(tool.name));
      expect(item, tool.name).toBeDefined();
      expect(item).toHaveAttribute("href", expected);
    }
  });

  it("sends desktop-only tools to the download page and flags them", () => {
    renderHeader();
    fireEvent.pointerEnter(toolsLink(), { pointerType: "mouse" });

    const excel = within(screen.getByRole("menu")).getByRole("menuitem", { name: /PDF to Excel/ });
    expect(excel).toHaveAttribute("href", "/download");
    expect(excel).toHaveTextContent("DESKTOP ONLY");
  });

  it("closes shortly after the pointer leaves, but not while it moves into the panel", () => {
    vi.useFakeTimers();
    renderHeader();
    fireEvent.pointerEnter(toolsLink(), { pointerType: "mouse" });
    const menu = screen.getByRole("menu");

    // Leave the label and enter the panel within the grace period.
    fireEvent.pointerLeave(toolsLink(), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    fireEvent.pointerEnter(menu, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerLeave(menu, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens on ArrowDown, moves through the items, and closes on Escape", () => {
    renderHeader();
    const trigger = toolsLink();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();

    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: "End" });
    expect(items[items.length - 1]).toHaveFocus();

    fireEvent.keyDown(items[items.length - 1], { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape from the Tools label itself", () => {
    renderHeader();
    fireEvent.pointerEnter(toolsLink(), { pointerType: "mouse" });
    fireEvent.keyDown(toolsLink(), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when focus moves out of the menu", () => {
    renderHeader();
    fireEvent.pointerEnter(toolsLink(), { pointerType: "mouse" });
    const other = screen.getByRole("link", { name: "Privacy" });
    other.focus();
    fireEvent.blur(toolsLink(), { relatedTarget: other });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when a tool is chosen and the route changes", () => {
    renderHeader();
    fireEvent.pointerEnter(toolsLink(), { pointerType: "mouse" });
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /Merge PDF/ }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("on touch, the first tap on Tools opens the menu and the second follows the link", () => {
    renderHeader();
    const trigger = toolsLink();

    fireEvent.pointerDown(trigger, { pointerType: "touch" });
    // Touch browsers also emit an emulated pointerenter; it must not count as hover.
    fireEvent.pointerEnter(trigger, { pointerType: "touch" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/");
    expect(screen.getByTestId("where")).not.toHaveTextContent("/tools");

    fireEvent.pointerDown(trigger, { pointerType: "touch" });
    fireEvent.click(trigger);
    expect(screen.getByTestId("where")).toHaveTextContent("/tools");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("a mouse click on Tools navigates straight to /tools even while the menu is open", () => {
    renderHeader();
    fireEvent.pointerEnter(toolsLink(), { pointerType: "mouse" });
    fireEvent.pointerDown(toolsLink(), { pointerType: "mouse" });
    fireEvent.click(toolsLink());
    expect(screen.getByTestId("where")).toHaveTextContent("/tools");
  });

  it("navigates to the chosen tool", () => {
    renderHeader();
    fireEvent.pointerEnter(toolsLink(), { pointerType: "mouse" });
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /Merge PDF/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/tools/merge");
  });
});
