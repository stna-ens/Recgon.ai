'use client';

import { Rectangle, Sector } from 'recharts';
import { fmtNumber, PINK_SPECTRUM, type TooltipPayload } from './utils';

interface GlowBarProps {
  fill?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: unknown;
}

export function GlowBar(props: GlowBarProps) {
  const { fill, ...shapeProps } = props;
  const color = fill || PINK_SPECTRUM[0];
  return (
    <g style={{ filter: 'drop-shadow(0 0 6px rgba(var(--signature-rgb), 0.55))' }}>
      <Rectangle {...shapeProps} fill={color} />
    </g>
  );
}

interface GlowSectorProps {
  fill?: string;
  outerRadius?: number;
  cx?: number;
  cy?: number;
  innerRadius?: number;
  startAngle?: number;
  endAngle?: number;
}

export function GlowSector(props: GlowSectorProps) {
  const { fill, outerRadius, ...shapeProps } = props;
  const color = fill || PINK_SPECTRUM[0];
  return (
    <g style={{ filter: 'drop-shadow(0 0 8px rgba(var(--signature-rgb), 0.55))' }}>
      <Sector {...shapeProps} outerRadius={(outerRadius ?? 0) + 3} fill={color} />
    </g>
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="v2-an-tt">
      {label && <div className="v2-an-tt-label">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="v2-an-tt-row">
          <span className="v2-an-tt-dot" style={{ background: p.color }} />
          <span className="v2-an-tt-name">{p.name}</span>
          <span className="v2-an-tt-val">{fmtNumber(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
