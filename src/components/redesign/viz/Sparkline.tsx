'use client';

/**
 * Sparkline — a tiny inline trend line. Pure SVG, no library.
 * Pairs with a number to show the trend behind the metric.
 */
export default function Sparkline({
  data,
  width = 120,
  height = 32,
  tone = 'sage',
  fill = true,
  strokeWidth = 1.5,
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: 'sage' | 'ochre' | 'rust' | 'pink' | 'ink' | 'quiet';
  fill?: boolean;
  strokeWidth?: number;
}) {
  if (!data?.length) return <svg width={width} height={height} />;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;

  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = height - ((d - min) / range) * height;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');

  const fillPath = `${linePath} L ${(width).toFixed(2)} ${height} L 0 ${height} Z`;

  const colorVar: Record<string, string> = {
    sage: 'var(--rg-sage)',
    ochre: 'var(--rg-ochre)',
    rust: 'var(--rg-rust)',
    pink: 'var(--rg-signature-deep)',
    ink: 'var(--rg-ink)',
    quiet: 'var(--rg-ink-quiet)',
  };
  const color = colorVar[tone];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {fill && (
        <path d={fillPath} fill={color} opacity="0.12" />
      )}
      <path d={linePath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {/* End cap dot */}
      {points.length > 0 && (
        <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={2.5} fill={color} />
      )}
    </svg>
  );
}
