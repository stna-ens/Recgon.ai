// Shared identity palette for team / member avatars.
// Single source of truth — previously duplicated verbatim in
// src/app/teams/page.tsx and src/app/team/page.tsx, which guaranteed drift.
// Identity colors are exempt from the single-accent rule, but the set itself
// must stay curated in exactly one place.

export const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#0ea5e9', '#14b8a6', '#84cc16',
] as const;

/** Deterministic name → palette color (stable across reloads and surfaces). */
export function defaultAvatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
