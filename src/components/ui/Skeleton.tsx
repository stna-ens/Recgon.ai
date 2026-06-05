export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  /** Render N stacked lines. */
  count?: number;
  /** Round avatar-style placeholder (width = height). */
  circle?: boolean;
  /** Gap between stacked lines when count > 1. */
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Shared loading placeholder — one shimmer animation for the whole app
 * (`.ui-skeleton` in globals.css, driven by the `recgon-shimmer` keyframe).
 */
export function Skeleton({
  width = '100%',
  height = 12,
  radius = 4,
  count = 1,
  circle = false,
  gap = 8,
  className,
  style,
}: SkeletonProps) {
  const base: React.CSSProperties = {
    width: circle ? height : width,
    height,
    borderRadius: circle ? '50%' : radius,
    ...style,
  };
  const cls = ['ui-skeleton', className].filter(Boolean).join(' ');

  if (count <= 1) {
    return <span className={cls} style={base} aria-hidden="true" />;
  }

  return (
    <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cls}
          // Last line slightly shorter — reads as natural text.
          style={{ ...base, width: i === count - 1 ? '70%' : base.width }}
        />
      ))}
    </span>
  );
}
