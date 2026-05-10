'use client';

import { useState } from 'react';
import { fmtNumber } from './utils';

const VBOX_W = 100; // viewBox width — SVG renders at 100% of parent and scales

interface SparklineProps {
  series: number[];
  /** Date label per point, same length as series. Shown in hover bubble. */
  labels?: string[];
  height?: number;
  /** When true, color the trend in danger tone instead of signature pink. */
  negative?: boolean;
  /** Override how the value is formatted in the hover bubble. */
  format?: (n: number) => string;
}

// Pure-SVG inline sparkline with hover-to-scrub. Mouse enters → vertical
// dashed guide + filled dot follow the cursor; a small bubble above the dot
// shows the formatted value (and date if `labels` provided). Mouse leaves
// → returns to a static line with a dot at the most recent point.
export default function Sparkline({
  series,
  labels,
  height = 32,
  negative = false,
  format = fmtNumber,
}: SparklineProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!series || series.length < 2) {
    return <span className="v2-an-tile-spark v2-an-tile-spark-empty" aria-hidden="true">─</span>;
  }

  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const stepX = VBOX_W / (series.length - 1);

  const points = series.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');

  const stroke = negative
    ? 'rgba(var(--danger-rgb, 255, 69, 58), 0.7)'
    : 'rgba(var(--signature-rgb), 0.65)';
  const dot = negative ? 'var(--danger)' : 'var(--signature)';

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const px = (e.clientX - rect.left) * (VBOX_W / rect.width);
    const idx = Math.round(px / stepX);
    setHovered(Math.max(0, Math.min(series.length - 1, idx)));
  };

  const isHover = hovered !== null;
  const idx = hovered ?? series.length - 1;
  const [hx, hy] = points[idx];

  return (
    <span className="v2-an-tile-spark-wrap">
      <svg
        className="v2-an-tile-spark"
        width="100%"
        height={height}
        viewBox={`0 0 ${VBOX_W} ${height}`}
        preserveAspectRatio="none"
        role="img"
        onMouseMove={handleMove}
        onMouseLeave={() => setHovered(null)}
      >
        <path
          d={path}
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        {isHover && (
          <line
            x1={hx}
            y1={0}
            x2={hx}
            y2={height}
            stroke="rgba(var(--signature-rgb), 0.30)"
            strokeWidth={1}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <circle cx={hx} cy={hy} r={isHover ? 2.6 : 1.8} fill={dot} vectorEffect="non-scaling-stroke" />
      </svg>
      {isHover && (
        <span
          className="v2-an-tile-spark-bubble"
          style={{ left: `${(hx / VBOX_W) * 100}%` }}
        >
          <span className="v2-an-tile-spark-bubble-val">{format(series[idx])}</span>
          {labels?.[idx] && <span className="v2-an-tile-spark-bubble-date">{labels[idx]}</span>}
        </span>
      )}
    </span>
  );
}
