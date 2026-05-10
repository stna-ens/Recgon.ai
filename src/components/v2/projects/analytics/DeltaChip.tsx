'use client';

interface DeltaChipProps {
  /** Percent delta. Pass null to render the muted "~" placeholder. */
  delta: number | null;
  /** When true, an INCREASE is bad (e.g., bounce rate). Flips the tone. */
  inverse?: boolean;
}

// Tiny chip that shows direction + percent. Three tones:
//   ↑ +12% (success / danger when inverse)
//   ↓ −12% (danger / success when inverse)
//   ~ 0%   (faint)
export default function DeltaChip({ delta, inverse = false }: DeltaChipProps) {
  if (delta === null) {
    return (
      <span className="v2-an-delta v2-an-delta-faint" aria-hidden="true">
        <span className="v2-an-delta-glyph">~</span>
        <span className="v2-an-delta-pct">—</span>
      </span>
    );
  }

  const abs = Math.abs(delta);
  const flat = abs < 1;
  const positive = delta > 0;
  const goodMove = flat ? false : (positive ? !inverse : inverse);

  const tone = flat ? 'faint' : goodMove ? 'success' : 'danger';
  const glyph = flat ? '~' : positive ? '↑' : '↓';
  const sign = flat ? '' : positive ? '+' : '−';
  const pct = flat ? '0%' : `${sign}${abs.toFixed(0)}%`;

  return (
    <span className={`v2-an-delta v2-an-delta-${tone}`} aria-label={`${pct} change`}>
      <span className="v2-an-delta-glyph">{glyph}</span>
      <span className="v2-an-delta-pct">{pct}</span>
    </span>
  );
}
