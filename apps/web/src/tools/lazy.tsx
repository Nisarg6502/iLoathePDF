/**
 * Code-splitting helpers for the tool registry.
 *
 * The registry is imported by the home page, the tool list and the recipe
 * pages, so statically importing every engine and options panel there put
 * pdf-lib, pdf.js, the image codecs and every panel into the first download.
 * These wrappers keep the registry's shape (`engine: Engine`,
 * `OptionsPanel: ComponentType`) identical for consumers while deferring the
 * actual module load until a tool is opened or run.
 */
import { Suspense, lazy, createElement, type ComponentType } from "react";
import type { Engine, EngineInput } from "@/engines/types";

/** An Engine that loads its implementation on first call (then reuses it). */
export function lazyEngine(load: () => Promise<Engine>): Engine {
  let pending: Promise<Engine> | null = null;
  return async (input: EngineInput) => {
    // A failed dynamic import (offline, stale deploy) must be retryable.
    pending ??= load().catch((err) => {
      pending = null;
      throw err;
    });
    return (await pending)(input);
  };
}

/** A component that loads on first render, behind its own Suspense boundary. */
// The registry hands these to ToolConfig fields typed for specific props (options panels, workspaces), so the props type stays open here rather than being re-declared per tool.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyComponent<P extends object = any>(load: () => Promise<ComponentType<any>>): ComponentType<P> {
  const Lazy = lazy(async () => ({ default: await load() }));
  function LazyComponent(props: P) {
    return createElement(Suspense, { fallback: null }, createElement(Lazy, props as never));
  }
  return LazyComponent;
}
