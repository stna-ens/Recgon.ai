'use client';

import { useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { EventChip } from './EventChip';
import type { CalendarCard } from './calendarTypes';
import { localDateKey } from './calendarUtils';
import { projectInitial } from '@/components/v2/utils';

type TeamBadge = { name: string; color: string | null };

type Props = {
  cards: CalendarCard[];
  dayDates: Date[];
  activeDayIndex: number | null;
  onCardClick: (card: CalendarCard) => void;
  teamBadgeByTeamId: Map<string, TeamBadge>;
  label: string;
  eyebrow?: string;
  logoUrl?: string | null;
};

const VISIBLE_CAP = 3;
const MULTI_CHIP_HEIGHT = 28;
const MULTI_ROW_GAP = 4;
const STACK_OFFSET = 8;
const SINGLE_GAP = 4;
const MIN_LANE_HEIGHT = 96;

// Greedy row assignment so overlapping multi-day chips don't visually collide.
function assignMultiRows(multi: CalendarCard[]): Map<string, number> {
  const sorted = [...multi].sort(
    (a, b) => a.dayIndex - b.dayIndex || (b.span - a.span),
  );
  const rowEnds: number[] = [];
  const out = new Map<string, number>();
  for (const c of sorted) {
    let row = rowEnds.findIndex((end) => end < c.dayIndex);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(c.dayIndex + c.span - 1);
    } else {
      rowEnds[row] = c.dayIndex + c.span - 1;
    }
    out.set(c.id, row);
  }
  return out;
}

export function PersonalLane({
  cards,
  dayDates,
  activeDayIndex,
  onCardClick,
  teamBadgeByTeamId,
  label,
  eyebrow,
  logoUrl = null,
}: Props) {
  const t = useTranslations('calendar');
  const eyebrowText = eyebrow ?? t('lane.you');
  const [expandedCells, setExpandedCells] = useState<Set<number>>(new Set());

  const multiCards = cards.filter((c) => c.isMultiDay);
  const singleCards = cards.filter((c) => !c.isMultiDay);
  const multiRows = assignMultiRows(multiCards);
  const multiRowCount = multiRows.size === 0
    ? 0
    : Math.max(...Array.from(multiRows.values())) + 1;
  const multiBandHeight = multiRowCount > 0
    ? multiRowCount * MULTI_CHIP_HEIGHT + Math.max(0, multiRowCount - 1) * MULTI_ROW_GAP + STACK_OFFSET
    : 0;

  const singleByDay = new Map<number, CalendarCard[]>();
  for (const c of singleCards) {
    const arr = singleByDay.get(c.dayIndex) ?? [];
    arr.push(c);
    singleByDay.set(c.dayIndex, arr);
  }

  const toggleCell = (di: number) => {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      if (next.has(di)) next.delete(di);
      else next.add(di);
      return next;
    });
  };

  const laneVars = {
    '--multi-band-height': `${multiBandHeight}px`,
    '--multi-chip-height': `${MULTI_CHIP_HEIGHT}px`,
    '--multi-row-gap': `${MULTI_ROW_GAP}px`,
    '--stack-offset': `${STACK_OFFSET}px`,
    '--single-gap': `${SINGLE_GAP}px`,
    '--lane-min-height': `${MIN_LANE_HEIGHT}px`,
  } as CSSProperties;

  const badgeFor = (card: CalendarCard): TeamBadge | null => {
    return teamBadgeByTeamId.get(card.task.teamId) ?? null;
  };

  return (
    <div className="cal-lane" style={laneVars}>
      <div className="cal-lane-label">
        <div className="personal-lane-label-inner">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="personal-lane-label-logo" />
          ) : (
            <span className="personal-lane-label-logo personal-lane-label-logo-fallback" aria-hidden="true">
              {projectInitial(label)}
            </span>
          )}
          <span className="personal-lane-label-eyebrow">{eyebrowText}</span>
          <span className="personal-lane-label-name" title={label}>{label}</span>
        </div>
      </div>

      <div className="cal-lane-grid">
        {dayDates.map((date, di) => {
          const hidden = activeDayIndex !== null && di !== activeDayIndex;
          const cellSingles = singleByDay.get(di) ?? [];
          const isExpanded = expandedCells.has(di);
          const visible = isExpanded ? cellSingles : cellSingles.slice(0, VISIBLE_CAP);
          const overflow = cellSingles.length - visible.length;

          const startingMulti = multiCards.filter((c) => c.dayIndex === di);

          return (
            <div
              key={`personal-${localDateKey(date)}`}
              data-day-index={di}
              className={`cal-day-cell${hidden ? ' is-hidden' : ''}`}
            >
              {startingMulti.map((card) => {
                const row = multiRows.get(card.id) ?? 0;
                return (
                  <div
                    key={`multi-${card.id}`}
                    className="cal-multi-anchor"
                    style={{ '--span': card.span, '--row': row } as CSSProperties}
                  >
                    <EventChip
                      card={card}
                      onClick={onCardClick}
                      teamBadge={badgeFor(card)}
                    />
                  </div>
                );
              })}

              <div className="cal-card-stack">
                {visible.map((card) => (
                  <EventChip
                    key={card.id}
                    card={card}
                    onClick={onCardClick}
                    teamBadge={badgeFor(card)}
                  />
                ))}
                {(overflow > 0 || (isExpanded && cellSingles.length > VISIBLE_CAP)) && (
                  <button type="button" className="cal-day-more" onClick={() => toggleCell(di)}>
                    {isExpanded ? t('lane.less') : t('lane.more', { count: overflow })}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{css}</style>
    </div>
  );
}

const css = `
.cal-lane { display: contents; }
.cal-lane-label {
  display: flex;
  align-items: flex-start;
  padding: 0;
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  position: sticky;
  left: 0;
  background: var(--bg-card);
  z-index: 2;
  min-width: 0;
  min-height: var(--lane-min-height, 96px);
  box-sizing: border-box;
}
.cal-lane-grid { display: contents; }
.cal-day-cell {
  border-bottom: 1px solid var(--rule);
  border-right: 1px solid var(--rule);
  padding: var(--stack-offset, 8px) 8px 8px;
  padding-top: calc(var(--stack-offset, 8px) + var(--multi-band-height, 0px));
  display: flex;
  flex-direction: column;
  gap: var(--single-gap, 4px);
  min-height: var(--lane-min-height, 96px);
  position: relative;
  overflow: visible;
  box-sizing: border-box;
}
.cal-day-cell:nth-child(7) { border-right: none; }
.cal-day-cell.is-hidden { display: none; }

.cal-multi-anchor {
  position: absolute;
  top: calc(var(--stack-offset, 8px) + var(--row, 0) * (var(--multi-chip-height, 28px) + var(--multi-row-gap, 4px)));
  left: 6px;
  right: auto;
  width: calc(var(--span, 1) * 100% + (var(--span, 1) - 1) * 1px - 12px);
  height: var(--multi-chip-height, 28px);
  z-index: calc(8 + var(--row, 0));
}
.cal-multi-anchor:hover { z-index: 50; }
.cal-multi-anchor > .cal-chip { width: 100%; height: 100%; }

.cal-card-stack {
  display: flex;
  flex-direction: column;
  gap: var(--single-gap, 4px);
  min-width: 0;
}
.cal-day-more {
  background: transparent;
  border: none;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--txt-muted);
  padding: 4px 2px;
  cursor: pointer;
  text-align: left;
  transition: color 140ms ease;
  align-self: flex-start;
}
.cal-day-more:hover { color: var(--signature); }

.personal-lane-label-inner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  box-sizing: border-box;
  min-width: 0;
}
.personal-lane-label-logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  object-fit: contain;
  background: rgba(var(--signature-rgb), 0.06);
  border: 1px solid var(--rule);
  padding: 2px;
  margin-bottom: 4px;
  box-sizing: border-box;
}
.personal-lane-label-logo-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--signature);
  letter-spacing: -0.005em;
  text-transform: uppercase;
}
.personal-lane-label-eyebrow {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--signature);
}
.personal-lane-label-name {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--txt-pure);
  letter-spacing: 0.4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;
