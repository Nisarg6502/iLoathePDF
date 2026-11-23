/**
 * The iLoathePDF logo: the mark (a page with one line redacted) and the
 * wordmark ("iLoathe" plus "PDF" in a redaction bar). The mark's shapes match
 * public/favicon.svg; keep the two in step.
 */

export function LogoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="flex-none">
      <rect width="64" height="64" rx="14" fill="#E89800" />
      <path d="M19 9H37L48 20V52a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3Z" fill="#FFFDF8" />
      <path d="M37 9V17a3 3 0 0 0 3 3H48Z" fill="#F3C978" />
      <rect x="21.5" y="24" width="15" height="3.4" rx="1.7" fill="#C9BFB2" />
      <rect x="9" y="30.5" width="46" height="10" rx="1.2" fill="#1E1813" />
      <rect x="21.5" y="45" width="18" height="3.4" rx="1.7" fill="#C9BFB2" />
    </svg>
  );
}

/** Sized by the caller's font size; the bar inverts with the theme. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap font-bold leading-none tracking-[-0.035em] ${className}`}>
      iLoathe
      <span className="ml-[0.1em] rounded-[0.05em] bg-text px-[0.24em] pt-[0.1em] pb-[0.08em] font-mono text-[0.78em] font-bold tracking-[0.02em] text-bg">
        PDF
      </span>
    </span>
  );
}
