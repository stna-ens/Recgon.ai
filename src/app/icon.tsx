import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          background: '#0a0a0a',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24">
          {/* Filled eye */}
          <path
            d="M1 12 C5 6, 19 6, 23 12 C19 18, 5 18, 1 12 Z"
            fill="white"
          />
          {/* S-curve rendered as a filled strip — no clipPath needed.
              Upper edge shifted ~1.5 above the curve, lower edge ~1.5 below.
              Sits on dark bg so any bleed beyond the eye is invisible. */}
          <path
            d="M4 8.5 C8 4.5, 16 16.5, 20 12.5 L20 15.5 C16 19.5, 8 7.5, 4 11.5 Z"
            fill="#0a0a0a"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
