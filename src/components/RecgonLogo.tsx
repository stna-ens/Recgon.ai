interface RecgonLogoProps {
  size?: number;
  uid: string;
}

export default function RecgonLogo({ size = 24, uid }: RecgonLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <clipPath id={uid}>
          <path d="M1 12 C5 6, 19 6, 23 12 C19 18, 5 18, 1 12 Z" />
        </clipPath>
      </defs>
      <path d="M1 12 C5 6, 19 6, 23 12 C19 18, 5 18, 1 12 Z" fill="currentColor" stroke="none" />
      <path
        d="M4 10 C8 6, 16 18, 20 14"
        stroke="var(--bg-deep, #0a0a0a)"
        strokeWidth={3}
        fill="none"
        clipPath={`url(#${uid})`}
      />
    </svg>
  );
}
