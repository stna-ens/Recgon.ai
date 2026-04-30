/**
 * Grain — a subtle SVG paper-noise overlay component.
 * Use sparingly to give a section extra paper weight (e.g., hero).
 * The page-level grain is already applied in redesign.css `.recgon-v2::before`.
 */
export default function Grain({
  opacity = 0.05,
  blendMode = 'multiply',
  size = 220,
}: {
  opacity?: number;
  blendMode?: React.CSSProperties['mixBlendMode'];
  size?: number;
}) {
  const id = `g-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity,
        mixBlendMode: blendMode,
      }}
    >
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
      {/* size hint to keep the noise pattern stable across viewports */}
      <rect width={size} height={size} fillOpacity="0" />
    </svg>
  );
}
