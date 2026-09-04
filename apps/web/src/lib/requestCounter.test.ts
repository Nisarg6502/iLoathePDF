import { describe, it, expect, vi, afterEach } from "vitest";
import { installRequestCounter } from "./requestCounter";

describe("installRequestCounter", () => {
  const originalFetch = window.fetch;
  afterEach(() => {
    window.fetch = originalFetch;
  });

  it("increments on every fetch call and reports via the callback", async () => {
    window.fetch = vi.fn(async () => new Response("ok"));
    const counts: number[] = [];
    const uninstall = installRequestCounter((n) => counts.push(n));

    await window.fetch("https://example.com");
    await window.fetch("https://example.com");

    expect(counts).toEqual([1, 2]);
    uninstall();
  });

  it("stops counting after uninstall", async () => {
    window.fetch = vi.fn(async () => new Response("ok"));
    const counts: number[] = [];
    const uninstall = installRequestCounter((n) => counts.push(n));
    uninstall();

    await window.fetch("https://example.com");

    expect(counts).toEqual([]);
  });
});
