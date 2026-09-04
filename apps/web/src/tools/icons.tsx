import type { SVGProps } from "react";

export function CompressIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-d)" strokeWidth="1.5" {...props}>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.2" />
      <path d="M5.5 5.5L8 8M8 8V5.6M8 8H5.6M12.5 12.5L10 10M10 10v2.4M10 10h2.4" />
    </svg>
  );
}

export function MergeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-a)" strokeWidth="1.5" {...props}>
      <rect x="1.5" y="2" width="5.5" height="4.5" rx="1" />
      <rect x="1.5" y="11.5" width="5.5" height="4.5" rx="1" />
      <rect x="11" y="6.5" width="5.5" height="5" rx="1" />
      <path d="M7 4.3h2.2V9h1.8M7 13.7h2.2V9" />
    </svg>
  );
}

export function SplitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-b)" strokeWidth="1.5" {...props}>
      <rect x="2" y="2.5" width="5" height="13" rx="1" />
      <rect x="11" y="2.5" width="5" height="13" rx="1" />
      <path d="M9 1v3.5M9 7v3.5M9 13v3.5" />
    </svg>
  );
}

export function OrganizeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-c)" strokeWidth="1.5" {...props}>
      <rect x="2" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="10" width="6" height="6" rx="1" />
      <rect x="10" y="10" width="6" height="6" rx="1" />
      <path d="M10 5h6M13 2v6" />
    </svg>
  );
}

export function PdfToImagesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-e)" strokeWidth="1.5" {...props}>
      <rect x="2" y="2" width="8.5" height="11" rx="1" />
      <rect x="7.5" y="6.5" width="8.5" height="9.5" rx="1" />
      <circle cx="10.4" cy="9.6" r="1" />
    </svg>
  );
}

export function ImagesToPdfIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-f)" strokeWidth="1.5" {...props}>
      <rect x="2" y="3" width="8.5" height="8.5" rx="1" />
      <circle cx="4.8" cy="5.8" r="1" />
      <rect x="7.5" y="7" width="8.5" height="9" rx="1" />
    </svg>
  );
}

export function ConvertImagesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-g)" strokeWidth="1.5" {...props}>
      <rect x="2" y="2" width="7.5" height="7.5" rx="1" />
      <rect x="8.5" y="8.5" width="7.5" height="7.5" rx="1" />
      <path d="M11.6 5.6h3.4M14 3.2l1.4 2.4-1.4 2.4M6.4 12.4H3M5 14.8L3.6 12.4 5 10" />
    </svg>
  );
}
