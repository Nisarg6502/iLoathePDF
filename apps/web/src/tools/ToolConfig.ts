import type { ComponentType, SVGProps } from "react";
import type { Engine } from "@/engines/types";
import type { TintKey } from "./tint";

export interface OptionsPanelProps<TOptions = Record<string, unknown>> {
  options: TOptions;
  onChange: (options: TOptions) => void;
  disabled: boolean;
  /** The currently selected input file(s), when available. Optional — most panels can ignore it. */
  files?: File[];
}

export interface ToolConfig {
  slug: string;
  name: string;
  description: string;
  category: "pdf" | "image";
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  accept: string[];
  multiple: boolean;
  defaultOptions: Record<string, unknown>;
  OptionsPanel: ComponentType<OptionsPanelProps>;
  engine: Engine;
  status: "live" | "preview";
  tint: TintKey;
}
