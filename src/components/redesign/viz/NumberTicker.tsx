'use client';

import NumberFlow from '@number-flow/react';

/**
 * NumberTicker — animated count-up number display.
 * Wraps @number-flow/react with our editorial typography.
 */
export default function NumberTicker({
  value,
  prefix,
  suffix,
  serif = true,
  size = '2.25rem',
  color = 'var(--rg-ink)',
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  serif?: boolean;
  size?: string;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: serif ? 'var(--font-fraunces, serif)' : 'var(--font-jetbrains, monospace)',
        fontVariationSettings: serif ? '"SOFT" 100, "WONK" 1, "opsz" 144' : undefined,
        fontWeight: serif ? 400 : 500,
        fontSize: size,
        color,
        lineHeight: 1,
        letterSpacing: serif ? '-0.02em' : '-0.01em',
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 2,
      }}
    >
      {prefix}
      <NumberFlow value={value} locales="en-US" />
      {suffix}
    </span>
  );
}
