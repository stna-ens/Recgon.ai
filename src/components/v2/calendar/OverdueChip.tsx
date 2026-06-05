// Phase 3.6 / Plan 04 — overdue chip.
//
// Renders the "N days late" pill on any task card whose schedule is in the
// past AND whose status is still active. Pure presentation — callers decide
// whether to render (via `isOverdue(task, today)` from `overduePolicy.ts`)
// and how to pull `days` (via `daysOverdue(endKey, today)`).
//
// Tier visibility rule (plan spec):
//   - Assignee view: chip is uniformly signature-pink outline regardless of
//     escalation tier; the assignee sees the slip, not the owner's
//     escalation status.
//   - Owner view: chip color encodes tier so the owner can spot tier-2
//     (amber outline) and tier-3 (red filled) tasks at a glance.
//
// Design tokens (no new tokens introduced):
//   - tier 0..1  → var(--signature)   outline only
//   - tier 2     → var(--warning)     outline only
//   - tier 3     → var(--danger)      filled
// Mono font + recgon-label tracking matches the existing chip vocabulary on
// /tasks cards (`v2-tasks-card-prio`, `v2-tasks-card-flag`).

'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';

export type OverdueChipVariant = {
  color: string;
  filled: boolean;
};

function variantForTier(tier: 0 | 1 | 2 | 3, ownerView: boolean): OverdueChipVariant {
  // Assignee view: never expose escalation tier. Always pink outline.
  if (!ownerView) return { color: 'var(--signature)', filled: false };
  if (tier >= 3) return { color: 'var(--danger)', filled: true };
  if (tier === 2) return { color: 'var(--warning)', filled: false };
  return { color: 'var(--signature)', filled: false };
}

export function formatOverdueLabel(days: number): string {
  if (days <= 1) return '1 day late';
  return `${days} days late`;
}

type Props = {
  // Last tier the cron actioned. 0 = not yet actioned (still pink outline).
  // The chip renders whenever `isOverdue(task, today)` returns true, even at
  // tier 0 — pressure is visible before the cron has fired.
  tier: 0 | 1 | 2 | 3;
  // Integer days past the scheduled-end key. Caller pre-computes via
  // `daysOverdue(endKey, today)` from the pure policy module.
  days: number;
  // Whether the viewer is the team owner. Drives tier color exposure:
  // assignees see uniform pink, owners see tier-encoded color.
  ownerView?: boolean;
  // Optional extra className so the chip can sit inside the host card's
  // footer row without bringing its own margins.
  className?: string;
};

export function OverdueChip({ tier, days, ownerView = false, className }: Props) {
  const t = useTranslations('calendar');
  const v = variantForTier(tier, ownerView);
  const label = days <= 1 ? t('overdue.oneDayLate') : t('overdue.daysLate', { days });
  const style: CSSProperties = {
    borderColor: v.color,
    background: v.filled ? v.color : 'transparent',
    color: v.filled ? '#fff' : v.color,
  };
  return (
    <span
      className={`overdue-chip${className ? ` ${className}` : ''}`}
      data-tier={tier}
      data-owner-view={ownerView ? 'true' : 'false'}
      style={style}
      aria-label={label}
    >
      {label}
      <style>{css}</style>
    </span>
  );
}

const css = `
.overdue-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid currentColor;
  padding: 1px 6px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: lowercase;
  border-radius: 2px;
  line-height: 1.45;
  white-space: nowrap;
  flex-shrink: 0;
}
.overdue-chip[data-tier="3"][data-owner-view="true"] {
  /* filled red — text is forced white via inline style; keep the border
     blending with the fill so the chip reads as a solid pill rather than
     a bordered tile. */
  border-color: transparent;
}
`;
