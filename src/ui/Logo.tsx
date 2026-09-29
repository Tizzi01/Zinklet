/** The Zinklet mark: Lexend ExtraBold "Z" on a mint rounded square. `boil` makes it line-boil. */
export const Z_PATH =
  'M17.22 50.00 L17.22 43.37 L36.02 18.47 L40.10 23.21 L18.56 23.21 L18.56 14.00 L46.22 14.00 L46.22 20.58 L27.51 45.53 L23.39 41.31 L46.78 41.31 L46.78 50.00Z';

export function ZMark({ size = 28, boil = false, variant = 'mint' }: { size?: number; boil?: boolean; variant?: 'mint' | 'dark' }) {
  const bg = variant === 'mint' ? 'var(--accent)' : '#0f1a20';
  const fg = variant === 'mint' ? 'var(--accent-ink)' : 'var(--accent)';
  return (
    <svg className="zmark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill={bg} />
      <path d={Z_PATH} fill={fg} style={boil ? { filter: 'url(#boil-filter)' } : undefined} />
    </svg>
  );
}

/** Line-boil SVG filter used by the logo, headings and hover effects. Render once per page. */
export function BoilFilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id="boil-filter">
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="1">
          <animate attributeName="seed" values="1;2;3" dur="0.375s" calcMode="discrete" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" scale="3.5" />
      </filter>
    </svg>
  );
}
