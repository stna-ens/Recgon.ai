/**
 * RecgonMark — the vintage redesign of the Recgon brand mark.
 * Built around a circular "compass" reading of the eye-shape:
 * a slim ring crossed by a curve, sealed with a signature dot.
 */
export default function RecgonMark({
  size = 36,
  uid = 'rgmark',
  monogram = false,
}: {
  size?: number;
  uid?: string;
  monogram?: boolean;
}) {
  const stroke = Math.max(1.1, size / 22);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Recgon"
      style={{ display: 'block' }}
    >
      <defs>
        <clipPath id={`${uid}-clip`}>
          <circle cx="24" cy="24" r="20" />
        </clipPath>
      </defs>

      {/* Outer ring — paper edge */}
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        opacity="0.92"
      />

      {/* Inner mark — the "curve through the eye" */}
      <g clipPath={`url(#${uid}-clip)`}>
        <path
          d="M6 28 C 14 18, 32 32, 42 22"
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke * 1.6}
          strokeLinecap="round"
        />
        {/* Editorial accent: signature pink dot */}
        <circle cx="34" cy="24.5" r={stroke * 1.4} fill="var(--rg-signature, #e8a8c4)" />
      </g>

      {monogram && (
        <text
          x="24"
          y="44.5"
          textAnchor="middle"
          fontSize="6"
          letterSpacing="2"
          fill="currentColor"
          opacity="0.55"
          fontFamily="var(--font-jetbrains, monospace)"
          style={{ textTransform: 'uppercase' }}
        >
          RGN
        </text>
      )}
    </svg>
  );
}
