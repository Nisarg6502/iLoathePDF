import type { ReactElement, SVGProps } from "react";
import { msg } from "@iloathepdf/i18n";

/**
 * Tools that work on pasted or typed text rather than on files. They live
 * under /text and, like everything else on the site, never send the text
 * anywhere.
 */
export interface TextTool {
  path: string;
  name: string;
  description: string;
  Icon: (props: SVGProps<SVGSVGElement>) => ReactElement;
}

export function WordCounterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--accent-deep)" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M2.5 4h13M2.5 7.5h13M2.5 11h7" />
      <path d="M12.5 10.5v5M15.5 10.5v5M11.5 12.2h5M11.5 13.8h5" />
    </svg>
  );
}

export function CompareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--accent-deep)" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" {...props}>
      <rect x="1.5" y="2.5" width="6.5" height="13" rx="1.2" />
      <rect x="10" y="2.5" width="6.5" height="13" rx="1.2" />
      <path d="M3.5 6h2.5M3.5 9h2.5M12 6h2.5M12 9h2.5M12 12h2.5" />
    </svg>
  );
}

export const TEXT_TOOLS: TextTool[] = [
  {
    path: "/text/word-counter",
    name: msg("Word counter"),
    description: msg("Count words, characters, sentences and reading time. See your most-used words, readability and limits."),
    Icon: WordCounterIcon,
  },
  {
    path: "/text/compare",
    name: msg("Compare texts"),
    description: msg("See exactly what changed between two versions of a text, word by word."),
    Icon: CompareIcon,
  },
];
