'use client';

/**
 * ProgressRing — a single-percent metric ring. Pure SVG.
 * Used for project health, sentiment %, completion.
 */
export default function ProgressRing({
  value,
  size = 140,
  stroke = 8,
  label,
  sub,
  tone = 'auto',
}: {
  value: number; // 0..100
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
  tone?: 'auto' | 'sage' | 'ochre' | 'rust' | 'pink' | 'ink';
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  const resolvedTone =
    tone === 'auto'
      ? v >= 75
        ? 'sage'
        : v >= 50
          ? 'ochre'
          : 'rust'
      : tone;

  const colorVar: Record<string, string> = {
    sage: 'var(--rg-sage)',
    ochre: 'var(--rg-ochre)',
    rust: 'var(--rg-rust)',
    pink: 'var(--rg-signature-deep)',
    ink: 'var(--rg-ink)',
  };
  const color = colorVar[resolvedTone];

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? ''} ${v}%`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--rg-rule)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.22,0.61,0.36,1)' }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--rg-ink)"
          fontFamily="var(--font-fraunces, serif)"
          fontSize={size * 0.32}
          fontWeight={400}
          style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1, "opsz" 144' }}
        >
          {Math.round(v)}
        </text>
      </svg>
      {label && (
        <div className="stamp" style={{ color: 'var(--rg-ink-quiet)' }}>
          {label}
        </div>
      )}
      {sub && (
        <div style={{ color: 'var(--rg-ink-quiet)', fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 11 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
