'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { WeekRange } from './calendarTypes';

type Props = {
  week: WeekRange;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  viewMode: 'calendar' | 'list';
  onToggleView: () => void;
  unscheduledCount: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  refreshing?: boolean;
};

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

// Locale-pinned formatter; month abbreviations are resolved from the active
// translation namespace so the headline matches the chosen UI language.
function fmtEditorial(start: Date, end: Date, month: (i: number) => string): { primary: string; year: string } {
  const sm = month(start.getMonth());
  const em = month(end.getMonth());
  const primary = sm === em
    ? `${sm} ${start.getDate()} — ${end.getDate()}`
    : `${sm} ${start.getDate()} — ${em} ${end.getDate()}`;
  const year = `/ ${end.getFullYear()}`;
  return { primary, year };
}

export function WeekNav({
  week, onPrev, onNext, onToday, viewMode, onToggleView,
  unscheduledCount, sidebarOpen, onToggleSidebar, refreshing,
}: Props) {
  const t = useTranslations('calendar');
  const { primary, year } = fmtEditorial(week.start, week.end, (i) => t(`months.${MONTH_KEYS[i]}`));
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!viewMenuRef.current?.contains(event.target as Node)) setViewMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [viewMenuOpen]);

  const chooseView = (next: 'calendar' | 'list') => {
    setViewMenuOpen(false);
    if (next !== viewMode) onToggleView();
  };

  return (
    <div className="cal-nav">
      <div className="cal-nav-left">
        <span className="cal-nav-eyebrow">{t('nav.week')}</span>
        <h1 className="cal-nav-headline">
          <span className="cal-nav-headline-primary">{primary}</span>
          <span className="cal-nav-headline-year">{year}</span>
        </h1>
        {refreshing && <span className="cal-nav-spin" aria-hidden="true" />}
      </div>

      <div className="cal-nav-right">
        <div className="cal-nav-pager">
          <button type="button" className="cal-nav-arrow" onClick={onPrev} aria-label={t('nav.prevWeek')}>‹</button>
          <button type="button" className="cal-nav-today-link" onClick={onToday}>{t('nav.today')}</button>
          <button type="button" className="cal-nav-arrow" onClick={onNext} aria-label={t('nav.nextWeek')}>›</button>
        </div>

        {/* Keep the toggle while the panel is open even at 0 — otherwise
            dragging the last task onto a day removes the only control and
            leaves the empty panel stuck open. */}
        {(unscheduledCount > 0 || sidebarOpen) && (
          <button
            type="button"
            className={`cal-nav-unsched${sidebarOpen ? ' is-active' : ''}`}
            onClick={onToggleSidebar}
            aria-pressed={sidebarOpen}
          >
            <span className="cal-nav-unsched-mark">▲</span>
            <span className="cal-nav-unsched-count">{unscheduledCount}</span>
            <span className="cal-nav-unsched-text">{t('nav.unscheduled')}</span>
          </button>
        )}

        <div className="cal-view-menu" ref={viewMenuRef}>
          <button
            type="button"
            className={`cal-view-trigger${viewMenuOpen ? ' is-open' : ''}`}
            onClick={() => setViewMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={viewMenuOpen}
          >
            <span className="cal-view-trigger-dot" aria-hidden="true" />
            <span className="cal-view-trigger-text">{t(`view.${viewMode}`)}</span>
            <span className="cal-view-trigger-chev" aria-hidden="true">⌄</span>
          </button>
          {viewMenuOpen && (
            <div className="cal-view-menu-panel" role="menu" aria-label={t('view.menuAria')}>
              {(['calendar', 'list'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={viewMode === option}
                  className={`cal-view-option${viewMode === option ? ' is-active' : ''}`}
                  onClick={() => chooseView(option)}
                >
                  <span className="cal-view-option-label">{t(`view.${option}`)}</span>
                  {viewMode === option && <span className="cal-view-option-mark" aria-hidden="true">•</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{css}</style>
    </div>
  );
}

const css = `
.cal-nav {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px 24px;
  padding: 4px 0 22px;
  border-bottom: 1px solid var(--rule);
  margin-bottom: 14px;
}
.cal-nav-left {
  display: flex;
  align-items: baseline;
  gap: 14px;
  min-width: 0;
}
.cal-nav-right {
  display: flex;
  align-items: center;
  gap: 22px;
}
.cal-nav-eyebrow {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--signature);
  text-transform: uppercase;
  padding-top: 4px;
  flex-shrink: 0;
}
.cal-nav-headline {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 600;
  line-height: 1;
}
.cal-nav-headline-primary {
  font-size: 26px;
  letter-spacing: -0.01em;
  color: var(--txt-pure);
}
.cal-nav-headline-year {
  font-size: 11px;
  font-weight: 600;
  color: var(--txt-faint);
  letter-spacing: 0.6px;
  text-transform: uppercase;
}
.cal-nav-spin {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid rgba(var(--signature-rgb), 0.25);
  border-top-color: var(--signature);
  animation: calNavSpin 700ms linear infinite;
  display: inline-block;
  margin-left: 4px;
  align-self: center;
}
@keyframes calNavSpin { to { transform: rotate(360deg); } }

.cal-nav-pager {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.cal-nav-arrow {
  background: transparent;
  border: none;
  color: var(--txt-muted);
  font-size: 18px;
  font-weight: 400;
  line-height: 1;
  padding: 4px 8px;
  cursor: pointer;
  transition: color var(--dur-fast) ease;
}
.cal-nav-arrow:hover { color: var(--txt-pure); }
.cal-nav-arrow:focus-visible {
  outline: 2px solid var(--signature);
  outline-offset: 2px;
  border-radius: 2px;
}
.cal-nav-today-link {
  background: transparent;
  border: none;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--txt-muted);
  padding: 4px 6px;
  cursor: pointer;
  transition: color var(--dur-fast) ease;
}
.cal-nav-today-link:hover { color: var(--signature); }
.cal-nav-today-link:focus-visible {
  outline: 2px solid var(--signature);
  outline-offset: 2px;
  border-radius: 2px;
}

.cal-nav-unsched {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--warning);
  transition: opacity var(--dur-fast) ease;
}
.cal-nav-unsched:hover { opacity: 0.75; }
.cal-nav-unsched.is-active .cal-nav-unsched-text { border-bottom: 1px solid var(--warning); padding-bottom: 1px; }
.cal-nav-unsched-mark { font-size: 8px; transform: translateY(-1px); }
.cal-nav-unsched-count { font-size: 13px; }
.cal-nav-unsched:focus-visible {
  outline: 2px solid var(--warning);
  outline-offset: 2px;
  border-radius: 2px;
}

.cal-view-menu {
  position: relative;
  display: inline-flex;
}
.cal-view-trigger {
  min-width: 132px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 8px 7px 12px;
  background: transparent;
  border: 1px solid var(--rule, rgba(255,255,255,0.10));
  border-radius: 8px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--txt-faint);
  cursor: pointer;
  transition: border-color var(--dur-base) ease, color var(--dur-base) ease, background var(--dur-base) ease;
}
.cal-view-trigger:hover,
.cal-view-trigger.is-open {
  color: var(--txt-muted);
  border-color: rgba(var(--signature-rgb), 0.35);
  background: rgba(var(--signature-rgb), 0.03);
}
.cal-view-trigger:focus-visible {
  outline: 2px solid var(--signature);
  outline-offset: 2px;
}
.cal-view-trigger-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--signature);
  box-shadow: 0 0 8px var(--signature);
  flex-shrink: 0;
}
.cal-view-trigger-text {
  flex: 1;
  text-align: left;
}
.cal-view-trigger-chev {
  font-size: 12px;
  color: var(--txt-faint);
  transform: translateY(-1px);
}
.cal-view-menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  min-width: 132px;
  padding: 6px;
  background: var(--bg-card, rgba(20, 20, 22, 0.92));
  border: 1px solid var(--rule, rgba(255,255,255,0.10));
  border-radius: 10px;
  backdrop-filter: blur(32px) saturate(160%);
  -webkit-backdrop-filter: blur(32px) saturate(160%);
  box-shadow: var(--v2-shadow-strong, 0 22px 50px -22px rgba(0,0,0,0.45));
  animation: calViewMenuIn 150ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes calViewMenuIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.cal-view-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 9px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.1px;
  text-transform: uppercase;
  color: var(--txt-muted);
  cursor: pointer;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease;
}
.cal-view-option:hover {
  background: rgba(var(--signature-rgb), 0.06);
  color: var(--txt-pure);
}
.cal-view-option.is-active {
  color: var(--txt-pure);
}
.cal-view-option-mark {
  color: var(--signature);
  text-shadow: 0 0 8px var(--signature);
}

@media (max-width: 700px) {
  .cal-nav { padding: 4px 0 14px; margin-bottom: 10px; }
  .cal-nav-headline-primary { font-size: 20px; }
  .cal-nav-right { gap: 14px; }
  .cal-nav-unsched-text { display: none; }
}
`;
