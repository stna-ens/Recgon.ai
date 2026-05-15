// Phase 3.5 / Plan 03.5-02 — owner board per-week capacity bar.
//
// One bar per (teammate × week). 16px-tall pill with a fill bar whose
// width is clamped to 100% (overload visualized via signature glow class
// instead of overflowing the track). Color tiers per UI-SPEC §6:
//
//   <60%  → is-healthy   (--success fill, "HEALTHY")
//   60-85 → is-warn      (--warning fill, "APPROACHING")
//   86-100→ is-near-cap  (--signature fill, no glow, "NEAR CAP")
//   >100  → is-overloaded(--signature fill with glow, "OVER")
//   0     → "IDLE", empty bar (no tier class so style stays neutral)
//
// ARIA per UI-SPEC §9: role="progressbar" with valuemin/valuemax/valuenow
// plus a descriptive aria-label including the teammate's display name and
// the week index.

'use client';

import type { TeammateWithStats } from '@/lib/recgon/types';
import { weeklyCapacityHours } from '@/lib/recgon/match';

type Props = {
  teammate: TeammateWithStats;
  scheduledHoursThisWeek: number;
  weekIndex: 1 | 2;
  weekStartLabel: string;
};

// Pick the bucket per UI-SPEC §6.
function bucketFor(util: number): {
  cls: string;
  label: string;
} {
  if (util <= 0) return { cls: 'is-idle', label: 'IDLE' };
  if (util < 0.6) return { cls: 'is-healthy', label: 'HEALTHY' };
  if (util < 0.86) return { cls: 'is-warn', label: 'APPROACHING' };
  if (util <= 1.0) return { cls: 'is-near-cap', label: 'NEAR CAP' };
  return { cls: 'is-overloaded', label: 'OVER' };
}

function fmtHours(h: number): string {
  if (h === 0) return '0h';
  if (Number.isInteger(h)) return `${h}h`;
  return `${h.toFixed(1)}h`;
}

export function CapacityBar({
  teammate,
  scheduledHoursThisWeek,
  weekIndex,
  weekStartLabel,
}: Props) {
  const cap = weeklyCapacityHours(teammate);
  const scheduled = Math.max(0, scheduledHoursThisWeek);
  const util = cap > 0 ? scheduled / cap : 0;
  const { cls, label } = bucketFor(util);
  const fillPct = Math.min(100, util * 100);

  return (
    <div className="capacity-bar-block" data-testid={`capacity-bar-wk${weekIndex}-${teammate.id}`}>
      <span className="capacity-bar-eyebrow">
        WK {weekIndex}
        {weekStartLabel ? <span className="capacity-bar-eyebrow-date"> · {weekStartLabel}</span> : null}
      </span>
      <div
        className={`capacity-bar ${cls}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={scheduled}
        aria-label={`${teammate.displayName} week ${weekIndex} utilization`}
        title={`${fmtHours(scheduled)} of ${fmtHours(cap)} scheduled`}
      >
        <span
          className="capacity-bar-fill"
          style={{ width: `${fillPct}%` }}
          aria-hidden="true"
        />
        <span className="capacity-bar-text">
          {fmtHours(scheduled)} / {fmtHours(cap)} · {label}
        </span>
      </div>
      <style>{css}</style>
    </div>
  );
}

const css = `
.capacity-bar-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.capacity-bar-eyebrow {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: var(--txt-faint);
  text-transform: uppercase;
  line-height: 1;
}
.capacity-bar-eyebrow-date {
  color: var(--txt-faint);
  letter-spacing: 0.6px;
  font-weight: 600;
  text-transform: uppercase;
}
.capacity-bar {
  position: relative;
  height: 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  overflow: hidden;
  display: flex;
  align-items: center;
  padding: 0 8px;
}
.capacity-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.10);
  transition: width 220ms cubic-bezier(0.2, 0.8, 0.2, 1), background 220ms ease;
}
.capacity-bar-text {
  position: relative;
  z-index: 1;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: var(--txt-pure);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.capacity-bar.is-healthy .capacity-bar-fill {
  background: rgb(var(--success-rgb, 70, 200, 110));
}
.capacity-bar.is-warn .capacity-bar-fill {
  background: rgb(var(--warning-rgb, 230, 180, 60));
}
.capacity-bar.is-near-cap .capacity-bar-fill {
  background: rgb(var(--signature-rgb));
}
.capacity-bar.is-overloaded .capacity-bar-fill {
  background: rgb(var(--signature-rgb));
  box-shadow:
    0 0 6px rgba(var(--signature-rgb), 0.70),
    0 0 14px rgba(var(--signature-rgb), 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
}
.capacity-bar.is-idle .capacity-bar-fill {
  background: transparent;
}
`;
