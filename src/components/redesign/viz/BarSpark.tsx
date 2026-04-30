'use client';

/**
 * BarSpark — small bar comparison for 3-7 categorical items.
 * Replaces bullet-list "rankings" wall-of-text.
 */
export default function BarSpark({
  data,
  width = 240,
  rowHeight = 20,
  gap = 6,
  tone = 'ink',
  showValues = true,
}: {
  data: { label: string; value: number; tone?: 'sage' | 'ochre' | 'rust' | 'pink' | 'ink' | 'quiet' }[];
  width?: number;
  rowHeight?: number;
  gap?: number;
  tone?: 'sage' | 'ochre' | 'rust' | 'pink' | 'ink' | 'quiet';
  showValues?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const colorMap: Record<string, string> = {
    sage: 'var(--rg-sage)',
    ochre: 'var(--rg-ochre)',
    rust: 'var(--rg-rust)',
    pink: 'var(--rg-signature-deep)',
    ink: 'var(--rg-ink)',
    quiet: 'var(--rg-ink-quiet)',
  };
  const labelW = 72;
  const valueW = showValues ? 36 : 0;
  const barW = width - labelW - valueW;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {data.map((row, i) => {
        const w = (row.value / max) * barW;
        const c = colorMap[row.tone ?? tone];
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: `${labelW}px 1fr ${valueW}px`, alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains, monospace)',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--rg-ink-quiet)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {row.label}
            </span>
            <div style={{ height: rowHeight, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'var(--rg-paper-deep)', borderRadius: 4 }} />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: w,
                  background: c,
                  borderRadius: 4,
                  transition: 'width 600ms cubic-bezier(0.22,0.61,0.36,1)',
                }}
              />
            </div>
            {showValues && (
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains, monospace)',
                  fontSize: 12,
                  color: 'var(--rg-ink-soft)',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {row.value}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
