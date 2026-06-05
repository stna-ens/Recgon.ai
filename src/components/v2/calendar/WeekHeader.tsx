'use client';

import { useTranslations } from 'next-intl';
import { formatDayHeader, isToday } from './calendarUtils';

type Props = {
  dayDates: Date[];
  activeDayIndex: number | null;
  rowLabel?: 'member' | 'project';
};

export function WeekHeader({ dayDates, activeDayIndex, rowLabel = 'member' }: Props) {
  const t = useTranslations('calendar');
  return (
    <>
      <div className="cal-corner">
        <span className="cal-corner-date">{t('header.date')}</span>
        <span className="cal-corner-member">{t(`header.${rowLabel}`)}</span>
        <svg className="cal-corner-line" aria-hidden="true">
          <line x1="0" y1="0" x2="100%" y2="100%" />
        </svg>
      </div>

      {dayDates.map((day, di) => {
        const hidden = activeDayIndex !== null && di !== activeDayIndex;
        const today = isToday(day);
        const { weekday, date } = formatDayHeader(day);
        return (
          <div
            key={di}
            className={`cal-day-header${today ? ' is-today' : ''}${hidden ? ' is-hidden' : ''}`}
          >
            <span className="cal-day-weekday">{weekday}</span>
            <span className="cal-day-date">
              <span className="cal-day-date-num">{date}</span>
            </span>
          </div>
        );
      })}

      <style>{css}</style>
    </>
  );
}

const css = `
.cal-corner {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 10;
  background: var(--bg-card);
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  overflow: hidden;
}
.cal-corner-date {
  position: absolute;
  top: 8px;
  right: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: var(--txt-faint);
  text-transform: uppercase;
}
.cal-corner-member {
  position: absolute;
  bottom: 8px;
  left: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: var(--txt-faint);
  text-transform: uppercase;
}
.cal-corner-line {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.cal-corner-line line {
  stroke: var(--rule);
  stroke-width: 1;
}
.cal-day-header {
  position: sticky;
  top: 0;
  z-index: 8;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 4px;
  padding: 14px 14px 12px;
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  background: var(--bg-card);
  min-width: var(--cal-day-min-width, 110px);
}
/* Drop right border on the last day header so it doesn't stack
   against the outer squircle frame. */
.cal-day-header:nth-child(8n) { border-right: none; }
.cal-day-header.is-hidden { display: none; }
.cal-day-weekday {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.4px;
  color: var(--txt-faint);
  text-transform: uppercase;
}
.cal-day-date {
  display: inline-flex;
  align-items: baseline;
  position: relative;
}
.cal-day-date-num {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 24px;
  font-weight: 600;
  color: var(--txt-pure);
  line-height: 1;
  letter-spacing: -0.02em;
  padding-bottom: 4px;
  border-bottom: 2px solid transparent;
  transition: border-color var(--dur-fast) ease, color var(--dur-fast) ease;
}
.cal-day-header.is-today .cal-day-date-num {
  color: var(--signature);
  border-bottom-color: var(--signature);
}
.cal-day-header.is-today .cal-day-weekday {
  color: var(--signature);
}
`;
