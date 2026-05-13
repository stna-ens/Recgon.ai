// Phase 3 Plan 03 — WR-07 fix.
//
// Single source of truth for the two band-label threshold sets used by the
// LLM judgment overlay:
//
//   - PROMPT_BAND_THRESHOLDS: feeds the LLM prompt (`bandLabel` in
//     prompts.ts). Intentionally tuned for LLM clarity — `medium` starts at
//     0.45 so the model gets a slightly cleaner trichotomy when grading
//     candidate breakdowns.
//
//   - COPY_BAND_THRESHOLDS: feeds human-facing "Why you" copy (`band` in
//     whyYou.ts). `medium` starts at 0.4 so the rendered sentence reads as
//     "medium overlap" at a slightly lower bar than the prompt — humans
//     skim, so being a touch more generous on the language reads more
//     natural.
//
// Pre-WR-07 these two functions were copy-pasted with slightly different
// constants in two files. The risk was that a future maintainer would
// "harmonize" one and miss the other, silently shifting the boundary band
// for one consumer but not the other. Now both functions import from here.

export const PROMPT_BAND_THRESHOLDS = {
  medium: 0.45,
  high: 0.7,
} as const;

export const COPY_BAND_THRESHOLDS = {
  medium: 0.4,
  high: 0.7,
} as const;

export type Band = 'low' | 'medium' | 'high';

/**
 * Apply a band threshold set to a normalized score in [0, 1].
 * `>= high` -> high; `>= medium` -> medium; else low.
 */
export function bandFor(
  n: number,
  thresholds: { medium: number; high: number },
): Band {
  if (n >= thresholds.high) return 'high';
  if (n >= thresholds.medium) return 'medium';
  return 'low';
}
