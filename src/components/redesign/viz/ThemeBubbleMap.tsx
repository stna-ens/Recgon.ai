'use client';

/**
 * ThemeBubbleMap — feedback themes as packed circles.
 * Replaces bulleted lists of themes with a visual cluster.
 *
 * Layout uses a deterministic hex-pack (not d3) to keep
 * the bundle small. Bubbles are sized by frequency.
 */
export type ThemeBubble = {
  label: string;
  count: number;
  tone?: 'sage' | 'ochre' | 'rust' | 'pink' | 'quiet';
};

export default function ThemeBubbleMap({
  themes,
  width = 480,
  height = 280,
}: {
  themes: ThemeBubble[];
  width?: number;
  height?: number;
}) {
  if (!themes.length) return null;
  const max = Math.max(...themes.map((t) => t.count), 1);
  const minR = 22;
  const maxR = Math.min(width, height) * 0.18;

  // Deterministic seeded layout: spiral from center
  const cx = width / 2;
  const cy = height / 2;

  const sorted = [...themes].sort((a, b) => b.count - a.count);
  const placed: { x: number; y: number; r: number; t: ThemeBubble }[] = [];

  for (const t of sorted) {
    const r = minR + (t.count / max) * (maxR - minR);
    let placedThis = false;
    if (placed.length === 0) {
      placed.push({ x: cx, y: cy, r, t });
      placedThis = true;
    } else {
      // try expanding spiral
      for (let step = 0; step < 600 && !placedThis; step++) {
        const angle = step * 0.42;
        const radius = step * 1.4 + r;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.65;
        const collides = placed.some(
          (p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 6,
        );
        if (
          !collides &&
          x - r > 4 &&
          y - r > 4 &&
          x + r < width - 4 &&
          y + r < height - 4
        ) {
          placed.push({ x, y, r, t });
          placedThis = true;
        }
      }
    }
  }

  const colorMap: Record<string, string> = {
    sage: 'var(--rg-sage)',
    ochre: 'var(--rg-ochre)',
    rust: 'var(--rg-rust)',
    pink: 'var(--rg-signature-deep)',
    quiet: 'var(--rg-ink-quiet)',
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Feedback theme cluster">
      {placed.map((b, i) => {
        const c = colorMap[b.t.tone ?? 'quiet'];
        return (
          <g key={i} style={{ animation: `rg-fade-up 480ms cubic-bezier(0.22,0.61,0.36,1) ${i * 30}ms both` }}>
            <circle
              cx={b.x}
              cy={b.y}
              r={b.r}
              fill={c}
              fillOpacity="0.14"
              stroke={c}
              strokeWidth={1}
              strokeOpacity="0.55"
            />
            <text
              x={b.x}
              y={b.y - 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--rg-ink)"
              fontFamily="var(--font-fraunces, serif)"
              fontSize={Math.max(11, b.r * 0.32)}
              fontWeight={400}
              style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1, "opsz" 144' }}
            >
              {b.t.label}
            </text>
            <text
              x={b.x}
              y={b.y + b.r * 0.4}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--rg-ink-quiet)"
              fontFamily="var(--font-jetbrains, monospace)"
              fontSize={Math.max(9, b.r * 0.22)}
              style={{ letterSpacing: '0.08em' }}
            >
              {b.t.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
