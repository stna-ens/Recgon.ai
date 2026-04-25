'use client';

import { CSSProperties } from 'react';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  variant?: 'shimmer' | 'pulse';
  className?: string;
  style?: CSSProperties;
}

export default function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  variant = 'shimmer',
  className = '',
  style,
}: SkeletonProps) {
  const cls = variant === 'pulse'
    ? `skeleton-pulse ${className}`
    : `skeleton ${className}`;

  const inline: CSSProperties = {
    width,
    height,
    borderRadius: radius,
    ...(variant === 'pulse' ? { background: 'rgba(var(--signature-rgb), 0.08)' } : {}),
    ...style,
  };

  return <div className={cls} style={inline} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3, lastWidth = '60%' }: { lines?: number; lastWidth?: string | number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? lastWidth : '100%'}
          variant="pulse"
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div className="glass-card" style={{ padding: 20 }}>
      <Skeleton width={88} height={11} radius={4} variant="pulse" style={{ marginBottom: 14 }} />
      <Skeleton height={height - 60} variant="pulse" />
    </div>
  );
}
