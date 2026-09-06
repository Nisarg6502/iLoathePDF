export function PipelineArt() {
  return (
    <svg
      viewBox="0 0 860 210"
      fill="none"
      className="w-full"
      role="img"
      aria-label="Diagram: your files move from your device into this browser tab and back out to your device, with no server in between."
    >
      {/* crossed-out server, floating behind the real path */}
      <g transform="translate(430 24)" opacity="0.55">
        <rect x="-34" y="0" width="68" height="46" rx="8" fill="none" stroke="var(--border-hi)" strokeWidth="1.5" strokeDasharray="3 4" />
        <path d="M-22 12h44M-22 21h44M-22 30h44" stroke="var(--border-hi)" strokeWidth="1.5" strokeDasharray="3 4" strokeLinecap="round" />
        <path d="M-30 -8l60 62" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" />
      </g>
      <text x="430" y="90" textAnchor="middle" className="font-mono" fontSize="9.5" fontWeight="700" letterSpacing="0.12em" fill="var(--faint)">
        NO SERVER
      </text>

      {/* device -> tab */}
      <path d="M150 105h130" stroke="var(--border-hi)" strokeWidth="1.6" strokeDasharray="1 7" strokeLinecap="round" />
      <path d="M270 99l10 6-10 6" stroke="var(--border-hi)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />

      {/* tab -> device */}
      <path d="M580 105h130" stroke="var(--border-hi)" strokeWidth="1.6" strokeDasharray="1 7" strokeLinecap="round" />
      <path d="M700 99l10 6-10 6" stroke="var(--border-hi)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />

      {/* left node: your device */}
      <g transform="translate(60 68)">
        <rect width="90" height="74" rx="12" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
        <path
          d="M20 30h14l5 6h21a3 3 0 013 3v18a3 3 0 01-3 3H20a3 3 0 01-3-3V33a3 3 0 013-3z"
          fill="none"
          stroke="var(--tint-a)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </g>
      <text x="105" y="164" textAnchor="middle" className="font-mono" fontSize="10" fontWeight="700" letterSpacing="0.08em" fill="var(--muted)">
        YOUR DEVICE
      </text>

      {/* middle node: this tab */}
      <g transform="translate(345 56)">
        <rect width="170" height="98" rx="13" fill="var(--surface)" stroke="var(--border-hi)" strokeWidth="1.7" />
        <rect width="170" height="26" rx="13" fill="var(--surface-2)" />
        <path d="M0 20h170" stroke="var(--border)" strokeWidth="1" />
        <circle cx="15" cy="13" r="3" fill="var(--border-hi)" />
        <circle cx="27" cy="13" r="3" fill="var(--border-hi)" />
        <circle cx="39" cy="13" r="3" fill="var(--border-hi)" />
        <g transform="translate(72 45)">
          <circle cx="13" cy="13" r="13" fill="none" stroke="var(--tint-d)" strokeWidth="1.8" strokeDasharray="4 5" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 13 13" to="360 13 13" dur="6s" repeatCount="indefinite" />
          </circle>
          <path d="M9 13l2.6 2.8L18 9" stroke="var(--tint-d)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      </g>
      <text x="430" y="180" textAnchor="middle" className="font-mono" fontSize="10" fontWeight="700" letterSpacing="0.08em" fill="var(--muted)">
        THIS BROWSER TAB
      </text>

      {/* right node: your device, result */}
      <g transform="translate(710 68)">
        <rect width="90" height="74" rx="12" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
        <path
          d="M20 30h14l5 6h21a3 3 0 013 3v18a3 3 0 01-3 3H20a3 3 0 01-3-3V33a3 3 0 013-3z"
          fill="none"
          stroke="var(--ok)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M32 46l6 6 12-13" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <text x="755" y="164" textAnchor="middle" className="font-mono" fontSize="10" fontWeight="700" letterSpacing="0.08em" fill="var(--muted)">
        SAVED LOCALLY
      </text>
    </svg>
  );
}
