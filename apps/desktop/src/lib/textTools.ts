/**
 * The text tools: they work on text you paste or type rather than on files,
 * so they live in their own section, not in TOOLS (which run a sidecar job).
 */
import type { LucideIcon } from "lucide-react";
import { FileDiff, WholeWord } from "lucide-react";
import { msg } from "@iloathepdf/i18n/msg";
import type { Tint } from "./tools";

export interface TextTool {
  id: string;
  path: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tint: Tint;
}

export const TEXT_TOOLS: TextTool[] = [
  {
    id: "word-counter",
    path: "/text/word-counter",
    title: msg("Word counter"),
    description: msg("Count words, characters, sentences and reading time. See your most-used words, readability and limits."),
    icon: WholeWord,
    tint: "e",
  },
  {
    id: "compare",
    path: "/text/compare",
    title: msg("Compare texts"),
    description: msg("See exactly what changed between two versions of a text, word by word."),
    icon: FileDiff,
    tint: "c",
  },
];
